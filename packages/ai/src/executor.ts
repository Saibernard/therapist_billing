import { prisma } from "@bookai/db";
import type {
  PackageType,
  CampaignType,
  CampaignStatus,
  ContactChannel,
  AiActionType,
} from "@prisma/client";
import {
  createAppointment,
  cancelAppointment,
  rescheduleAppointment,
  getAvailableSlots,
  createRecurringSeries,
  cancelSeries,
} from "@bookai/scheduling";
import { formatCurrency } from "@bookai/utils";
import { validateArgs } from "./validate";
import {
  resolveClient,
  resolveService,
  resolveStaff,
  resolvePackage,
  resolveAppointment,
  resolveCampaign,
  getOrgTimezone,
} from "./resolve";

// ── Types ─────────────────────────────────────────────────────

export interface FunctionCallResult {
  success: boolean;
  data?: unknown;
  message: string;
  needsConfirmation?: boolean;
  confirmationSummary?: string;
}

type Args = Record<string, unknown>;
type Handler = (args: Args, orgId: string, clientId?: string) => Promise<FunctionCallResult>;

// ── Handler registry ──────────────────────────────────────────
// Every function maps to a deterministic handler.
// The LLM's only job is picking the function + extracting params.
// Everything after that is pure code.

const handlers: Record<string, Handler> = {
  // Services
  create_service: handleCreateService,
  update_service: handleUpdateService,
  delete_service: handleDeleteService,
  update_service_fees: handleUpdateServiceFees,

  // Clients
  create_client: handleCreateClient,
  update_client: handleUpdateClient,
  search_clients: handleSearchClients,

  // Appointments
  search_appointments: handleSearchAppointments,
  create_appointment: handleCreateAppointment,
  complete_appointment: handleCompleteAppointment,
  mark_no_show: handleMarkNoShow,
  reschedule_appointment: handleReschedule,
  cancel_appointment: handleCancel,
  confirm_appointment: handleConfirm,
  bulk_reschedule: handleBulkReschedule,
  bulk_cancel: handleBulkCancel,

  // Availability & schedule
  search_availability: handleSearchAvailability,
  block_time: handleBlockTime,
  add_extra_availability: handleAddExtraAvailability,
  remove_override: handleRemoveOverride,
  get_staff_availability: handleGetStaffAvailability,
  suggest_optimal_time: handleSuggestOptimalTime,

  // Staff
  create_staff: handleCreateStaff,
  update_staff_services: handleUpdateStaffServices,
  update_staff_schedule: handleUpdateStaffSchedule,

  // Recurring
  create_recurring_appointment: handleCreateRecurringAppointment,
  cancel_recurring_series: handleCancelRecurringSeries,

  // Packages
  get_client_packages: handleGetClientPackages,
  assign_package: handleAssignPackage,
  create_package: handleCreatePackage,

  // Campaigns
  create_campaign: handleCreateCampaign,
  update_campaign_status: handleUpdateCampaignStatus,

  // Intake forms
  create_intake_form: handleCreateIntakeForm,

  // Payroll & reports
  get_payroll_summary: handleGetPayrollSummary,
  get_revenue_report: handleGetRevenueReport,

  // Waitlist
  add_to_waitlist: handleAddToWaitlist,
  get_waitlist: handleGetWaitlist,

  // Analytics & info
  get_analytics: handleGetAnalytics,
  get_business_info: handleGetBusinessInfo,
  escalate_to_human: handleEscalate,
};

// ── Main entry point ──────────────────────────────────────────

export async function executeFunctionCall(
  name: string,
  args: Args,
  organizationId: string,
  clientId?: string
): Promise<FunctionCallResult> {
  // Step 1: Find handler
  const handler = handlers[name];
  if (!handler) {
    return { success: false, message: `Unknown function: ${name}` };
  }

  // Step 2: Validate args
  const validation = validateArgs(name, args);
  if (!validation.valid) {
    return { success: false, message: validation.error };
  }

  // Step 3: Execute deterministic handler
  try {
    return await handler(validation.data, organizationId, clientId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An error occurred";
    return { success: false, message };
  }
}

// ══════════════════════════════════════════════════════════════
//  SERVICE HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleCreateService(args: Args, orgId: string): Promise<FunctionCallResult> {
  const count = await prisma.service.count({ where: { organizationId: orgId } });
  const service = await prisma.service.create({
    data: {
      organizationId: orgId,
      name: args.name as string,
      description: (args.description as string) ?? null,
      category: (args.category as string) ?? null,
      durationMinutes: args.durationMinutes as number,
      bufferMinutes: (args.bufferMinutes as number) ?? 0,
      price: args.price as number,
      maxCapacity: (args.maxCapacity as number) ?? 1,
      sortOrder: count,
    },
  });

  await logAction(orgId, "SERVICE_CREATED", `Created service "${service.name}" (${service.durationMinutes}min, ${formatCurrency(Number(service.price))})`);

  return {
    success: true,
    data: service,
    message: `Created service "${service.name}" — ${service.durationMinutes}min, ${formatCurrency(Number(service.price))}.`,
  };
}

async function handleUpdateService(args: Args, orgId: string): Promise<FunctionCallResult> {
  const result = await resolveService(orgId, {
    serviceId: args.serviceId as string | undefined,
    serviceName: args.serviceName as string | undefined,
  });
  if (!result.found) return { success: false, message: result.error };

  const updates: Record<string, unknown> = {};
  if (args.name !== undefined) updates.name = args.name;
  if (args.durationMinutes !== undefined) updates.durationMinutes = args.durationMinutes;
  if (args.price !== undefined) updates.price = args.price;
  if (args.description !== undefined) updates.description = args.description;
  if (args.category !== undefined) updates.category = args.category;
  if (args.bufferMinutes !== undefined) updates.bufferMinutes = args.bufferMinutes;
  if (args.maxCapacity !== undefined) updates.maxCapacity = args.maxCapacity;
  if (args.depositAmount !== undefined) updates.depositAmount = args.depositAmount;
  if (args.noShowFeeAmount !== undefined) updates.noShowFeeAmount = args.noShowFeeAmount;

  if (Object.keys(updates).length === 0) {
    return { success: false, message: "No fields to update. Specify what to change (name, price, duration, etc.)." };
  }

  const updated = await prisma.service.update({
    where: { id: result.data.id },
    data: updates,
  });

  const changes = Object.keys(updates).join(", ");
  return {
    success: true,
    data: updated,
    message: `Updated "${updated.name}" — changed: ${changes}.`,
  };
}

async function handleDeleteService(args: Args, orgId: string): Promise<FunctionCallResult> {
  const result = await resolveService(orgId, {
    serviceId: args.serviceId as string | undefined,
    serviceName: args.serviceName as string | undefined,
  });
  if (!result.found) return { success: false, message: result.error };

  // Confirmation check
  if (!args.confirmed) {
    const activeAppointments = await prisma.appointment.count({
      where: {
        serviceId: result.data.id,
        status: { in: ["PENDING", "CONFIRMED"] },
        startTime: { gte: new Date() },
      },
    });
    return {
      success: false,
      needsConfirmation: true,
      confirmationSummary: `This will deactivate "${result.data.name}". ${activeAppointments > 0 ? `There are ${activeAppointments} upcoming appointments using this service.` : "No upcoming appointments use this service."} Say "yes, delete it" to confirm.`,
      message: `Are you sure you want to delete "${result.data.name}"? ${activeAppointments > 0 ? `${activeAppointments} upcoming appointment(s) use this service.` : ""} Confirm to proceed.`,
    };
  }

  await prisma.service.update({
    where: { id: result.data.id },
    data: { isActive: false },
  });

  return { success: true, message: `Deactivated service "${result.data.name}". It will no longer appear in booking.` };
}

async function handleUpdateServiceFees(args: Args, orgId: string): Promise<FunctionCallResult> {
  const result = await resolveService(orgId, {
    serviceId: args.serviceId as string | undefined,
    serviceName: args.serviceName as string | undefined,
  });
  if (!result.found) return { success: false, message: result.error };

  const updates: Record<string, unknown> = {};
  if (args.depositAmount !== undefined) updates.depositAmount = args.depositAmount;
  if (args.depositType !== undefined) updates.depositType = args.depositType;
  if (args.noShowFeeAmount !== undefined) updates.noShowFeeAmount = args.noShowFeeAmount;

  const updated = await prisma.service.update({
    where: { id: result.data.id },
    data: updates,
  });

  const parts = [];
  if (args.depositAmount !== undefined) parts.push(`deposit: ${formatCurrency(args.depositAmount as number)}`);
  if (args.noShowFeeAmount !== undefined) parts.push(`no-show fee: ${formatCurrency(args.noShowFeeAmount as number)}`);

  return {
    success: true,
    data: updated,
    message: `Updated fees for "${updated.name}" — ${parts.join(", ")}.`,
  };
}

// ══════════════════════════════════════════════════════════════
//  CLIENT HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleCreateClient(args: Args, orgId: string): Promise<FunctionCallResult> {
  // Check for duplicate by email or phone
  if (args.email) {
    const existing = await prisma.client.findFirst({
      where: { organizationId: orgId, email: args.email as string },
    });
    if (existing) {
      return {
        success: false,
        message: `A client with email "${args.email}" already exists: ${existing.firstName} ${existing.lastName ?? ""}.`,
      };
    }
  }

  const client = await prisma.client.create({
    data: {
      organizationId: orgId,
      firstName: args.firstName as string,
      lastName: (args.lastName as string) ?? null,
      email: (args.email as string) ?? null,
      phone: (args.phone as string) ?? null,
      notes: (args.notes as string) ?? null,
      tags: args.tags ? JSON.stringify(args.tags) : "[]",
      source: "AI",
    },
  });

  return {
    success: true,
    data: client,
    message: `Created client "${client.firstName} ${client.lastName ?? ""}".`.trim(),
  };
}

async function handleUpdateClient(args: Args, orgId: string): Promise<FunctionCallResult> {
  const result = await resolveClient(orgId, {
    clientId: args.clientId as string | undefined,
    clientName: args.clientName as string | undefined,
  });
  if (!result.found) return { success: false, message: result.error };

  const updates: Record<string, unknown> = {};
  if (args.firstName !== undefined) updates.firstName = args.firstName;
  if (args.lastName !== undefined) updates.lastName = args.lastName;
  if (args.email !== undefined) updates.email = args.email || null;
  if (args.phone !== undefined) updates.phone = args.phone;
  if (args.notes !== undefined) updates.notes = args.notes;
  if (args.tags !== undefined) updates.tags = JSON.stringify(args.tags);

  if (Object.keys(updates).length === 0) {
    return { success: false, message: "No fields to update. Specify what to change (firstName, email, phone, etc.)." };
  }

  const updated = await prisma.client.update({
    where: { id: result.data.id },
    data: updates,
  });

  return {
    success: true,
    data: updated,
    message: `Updated ${updated.firstName} ${updated.lastName ?? ""} — changed: ${Object.keys(updates).join(", ")}.`.trim(),
  };
}

async function handleSearchClients(args: Args, orgId: string): Promise<FunctionCallResult> {
  const query = args.query as string;
  const clients = await prisma.client.findMany({
    where: {
      organizationId: orgId,
      OR: [
        { firstName: { contains: query } },
        { lastName: { contains: query } },
        { email: { contains: query } },
        { phone: { contains: query } },
      ],
    },
    take: 10,
  });

  const summary = clients
    .map((c) => `- ${c.firstName} ${c.lastName ?? ""} (${c.email ?? c.phone ?? "no contact"}) — ${c.totalVisits} visits`)
    .join("\n");

  return {
    success: true,
    data: clients,
    message: clients.length > 0 ? `Found ${clients.length} client(s):\n${summary}` : "No clients found matching that search.",
  };
}

// ══════════════════════════════════════════════════════════════
//  APPOINTMENT HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleSearchAppointments(args: Args, orgId: string): Promise<FunctionCallResult> {
  const where: Record<string, unknown> = { organizationId: orgId };

  if (args.date) {
    const date = new Date(args.date as string);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    where.startTime = { gte: date, lt: nextDay };
  }

  if (args.status) where.status = args.status;
  if (args.staffMemberId) where.staffMemberId = args.staffMemberId;

  if (args.clientName) {
    const clientResult = await resolveClient(orgId, { clientName: args.clientName as string });
    if (clientResult.found) {
      where.clientId = clientResult.data.id;
    } else if (clientResult.candidates) {
      where.clientId = { in: clientResult.candidates.map((c) => c.id) };
    } else {
      return { success: true, data: [], message: "No appointments found for that client." };
    }
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: { client: true, service: true, staffMember: true },
    orderBy: { startTime: "asc" },
    take: 20,
  });

  const summary = appointments
    .map((a) => `- ${a.client.firstName} ${a.client.lastName ?? ""}: ${a.service.name} at ${a.startTime.toLocaleTimeString()} (${a.status}) [id: ${a.id}]`)
    .join("\n");

  return {
    success: true,
    data: appointments,
    message: appointments.length > 0 ? `Found ${appointments.length} appointment(s):\n${summary}` : "No appointments found.",
  };
}

async function handleCreateAppointment(args: Args, orgId: string, existingClientId?: string): Promise<FunctionCallResult> {
  // 1. Resolve client
  let clientId = existingClientId || (args.clientId as string | undefined);
  if (!clientId) {
    if (args.clientPhone || args.clientEmail || args.clientName) {
      // Try to find existing client
      if (args.clientPhone) {
        const c = await prisma.client.findFirst({ where: { organizationId: orgId, phone: args.clientPhone as string } });
        if (c) clientId = c.id;
      }
      if (!clientId && args.clientEmail) {
        const c = await prisma.client.findFirst({ where: { organizationId: orgId, email: args.clientEmail as string } });
        if (c) clientId = c.id;
      }
      if (!clientId && args.clientName) {
        const result = await resolveClient(orgId, { clientName: args.clientName as string });
        if (result.found) clientId = result.data.id;
      }
      // Auto-create if not found
      if (!clientId) {
        const nameParts = ((args.clientName as string) ?? "Client").split(" ");
        const newClient = await prisma.client.create({
          data: {
            organizationId: orgId,
            firstName: nameParts[0]!,
            lastName: nameParts.slice(1).join(" ") || null,
            phone: (args.clientPhone as string) ?? null,
            email: (args.clientEmail as string) ?? null,
            source: "AI",
          },
        });
        clientId = newClient.id;
      }
    }
  }
  if (!clientId) return { success: false, message: "Need client info (name, phone, or email) to book." };

  // 2. Resolve service
  let serviceId = args.serviceId as string | undefined;
  if (!serviceId) {
    const svcResult = await resolveService(orgId, { serviceName: args.serviceName as string | undefined });
    if (svcResult.found) {
      serviceId = svcResult.data.id;
    } else {
      const all = await prisma.service.findMany({ where: { organizationId: orgId, isActive: true } });
      return { success: false, message: `${svcResult.error} Available: ${all.map((s) => s.name).join(", ")}` };
    }
  }

  // 3. Resolve staff
  let staffMemberId = args.staffMemberId as string | undefined;
  if (!staffMemberId && args.staffName) {
    const staffResult = await resolveStaff(orgId, { staffName: args.staffName as string });
    if (staffResult.found) staffMemberId = staffResult.data.id;
  }
  if (!staffMemberId) {
    const first = await prisma.staffMember.findFirst({
      where: { organizationId: orgId, isActive: true, staffServices: { some: { serviceId } } },
    });
    staffMemberId = first?.id;
  }
  if (!staffMemberId) return { success: false, message: "No staff member available for this service." };

  // 4. Create appointment (engine handles conflict detection)
  const appointment = await createAppointment({
    organizationId: orgId,
    clientId,
    serviceId,
    staffMemberId,
    startTime: new Date(args.dateTime as string),
    notes: (args.notes as string) ?? undefined,
    source: "AI_CHAT",
  });

  await logAction(orgId, "APPOINTMENT_CREATED", `Booked ${appointment.service.name} for ${appointment.client.firstName} on ${appointment.startTime.toLocaleDateString()}`);

  return {
    success: true,
    data: appointment,
    message: `Booked ${appointment.service.name} for ${appointment.client.firstName} on ${appointment.startTime.toLocaleDateString()} at ${appointment.startTime.toLocaleTimeString()} with ${appointment.staffMember.displayName}.`,
  };
}

async function handleCompleteAppointment(args: Args, orgId: string): Promise<FunctionCallResult> {
  const result = await resolveAppointment(orgId, {
    appointmentId: args.appointmentId as string | undefined,
    clientName: args.clientName as string | undefined,
    date: args.date as string | undefined,
    status: "CONFIRMED",
  });
  if (!result.found) return { success: false, message: result.error };

  const appt = result.data;
  if (appt.status !== "CONFIRMED" && appt.status !== "PENDING") {
    return { success: false, message: `Cannot complete — appointment status is "${appt.status}".` };
  }

  const updated = await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "COMPLETED" },
    include: { client: true, service: true },
  });

  // Update client stats
  await prisma.client.update({
    where: { id: updated.clientId },
    data: {
      totalVisits: { increment: 1 },
      totalSpent: { increment: Number(updated.service.price) },
      lastVisitAt: new Date(),
    },
  });

  return {
    success: true,
    data: updated,
    message: `Marked ${updated.client.firstName}'s ${updated.service.name} appointment as completed.`,
  };
}

async function handleMarkNoShow(args: Args, orgId: string): Promise<FunctionCallResult> {
  const result = await resolveAppointment(orgId, {
    appointmentId: args.appointmentId as string | undefined,
    clientName: args.clientName as string | undefined,
    date: args.date as string | undefined,
  });
  if (!result.found) return { success: false, message: result.error };

  const appt = result.data;
  if (appt.status === "COMPLETED" || appt.status === "CANCELLED") {
    return { success: false, message: `Cannot mark as no-show — appointment status is "${appt.status}".` };
  }

  const updated = await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "NO_SHOW" },
    include: { client: true, service: true },
  });

  await prisma.client.update({
    where: { id: updated.clientId },
    data: { noShowCount: { increment: 1 } },
  });

  return {
    success: true,
    data: updated,
    message: `Marked ${updated.client.firstName}'s ${updated.service.name} as no-show. Their no-show count has been updated.`,
  };
}

async function handleReschedule(args: Args): Promise<FunctionCallResult> {
  const appointment = await rescheduleAppointment(
    args.appointmentId as string,
    new Date(args.newDateTime as string)
  );

  await logAction(appointment.organizationId, "APPOINTMENT_RESCHEDULED",
    `Rescheduled to ${appointment.startTime.toLocaleDateString()} at ${appointment.startTime.toLocaleTimeString()}`);

  return {
    success: true,
    data: appointment,
    message: `Rescheduled to ${appointment.startTime.toLocaleDateString()} at ${appointment.startTime.toLocaleTimeString()}.`,
  };
}

async function handleCancel(args: Args): Promise<FunctionCallResult> {
  const appointment = await cancelAppointment(args.appointmentId as string, args.reason as string | undefined);

  await logAction(appointment.organizationId, "APPOINTMENT_CANCELLED",
    `Cancelled appointment${args.reason ? `: ${args.reason}` : ""}`);

  return {
    success: true,
    data: appointment,
    message: `Appointment cancelled.${args.reason ? ` Reason: ${args.reason}` : ""}`,
  };
}

async function handleConfirm(args: Args): Promise<FunctionCallResult> {
  const appointment = await prisma.appointment.update({
    where: { id: args.appointmentId as string },
    data: { status: "CONFIRMED" },
    include: { service: true },
  });
  return {
    success: true,
    data: appointment,
    message: `Confirmed ${appointment.service.name} on ${appointment.startTime.toLocaleDateString()} at ${appointment.startTime.toLocaleTimeString()}.`,
  };
}

async function handleBulkReschedule(args: Args, orgId: string): Promise<FunctionCallResult> {
  const sourceDate = args.sourceDate as string;
  const targetDate = args.targetDate as string;

  const where: Record<string, unknown> = {
    organizationId: orgId,
    startTime: { gte: new Date(`${sourceDate}T00:00:00Z`), lte: new Date(`${sourceDate}T23:59:59Z`) },
    status: { in: ["PENDING", "CONFIRMED"] },
  };

  if (args.staffMemberId || args.staffName) {
    const staffResult = await resolveStaff(orgId, {
      staffMemberId: args.staffMemberId as string | undefined,
      staffName: args.staffName as string | undefined,
    });
    if (!staffResult.found) return { success: false, message: staffResult.error };
    where.staffMemberId = staffResult.data.id;
  }

  if (args.clientName) {
    const clientResult = await resolveClient(orgId, { clientName: args.clientName as string });
    if (!clientResult.found) return { success: false, message: clientResult.error };
    where.clientId = clientResult.data.id;
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: { client: true, service: true },
    orderBy: { startTime: "asc" },
  });

  if (appointments.length === 0) {
    return { success: false, message: `No active appointments found on ${sourceDate}.` };
  }

  // Confirmation gate
  if (!args.confirmed) {
    const names = appointments.map((a) => `${a.client.firstName} ${a.client.lastName ?? ""} (${a.service.name})`).join(", ");
    return {
      success: false,
      needsConfirmation: true,
      confirmationSummary: `Move ${appointments.length} appointment(s) from ${sourceDate} to ${targetDate}: ${names}`,
      message: `This will move ${appointments.length} appointment(s) from ${sourceDate} to ${targetDate}. Clients affected: ${names}. Say "yes" to confirm.`,
    };
  }

  const dayDiffMs = new Date(targetDate).getTime() - new Date(sourceDate).getTime();
  let moved = 0;
  const errors: string[] = [];

  for (const appt of appointments) {
    try {
      await rescheduleAppointment(appt.id, new Date(appt.startTime.getTime() + dayDiffMs));
      moved++;
    } catch {
      errors.push(`${appt.client.firstName} at ${appt.startTime.toLocaleTimeString()} — conflict`);
    }
  }

  return {
    success: moved > 0,
    data: { moved, failed: errors.length, total: appointments.length },
    message: `Moved ${moved} of ${appointments.length} appointments from ${sourceDate} to ${targetDate}.${errors.length > 0 ? ` Failed: ${errors.join("; ")}` : ""}`,
  };
}

async function handleBulkCancel(args: Args, orgId: string): Promise<FunctionCallResult> {
  const date = args.date as string;

  const where: Record<string, unknown> = {
    organizationId: orgId,
    startTime: { gte: new Date(`${date}T00:00:00Z`), lte: new Date(`${date}T23:59:59Z`) },
    status: { in: ["PENDING", "CONFIRMED"] },
  };

  if (args.staffMemberId || args.staffName) {
    const staffResult = await resolveStaff(orgId, {
      staffMemberId: args.staffMemberId as string | undefined,
      staffName: args.staffName as string | undefined,
    });
    if (!staffResult.found) return { success: false, message: staffResult.error };
    where.staffMemberId = staffResult.data.id;
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: { client: true, service: true },
  });

  if (appointments.length === 0) {
    return { success: false, message: `No active appointments found on ${date}.` };
  }

  // Confirmation gate
  if (!args.confirmed) {
    const names = appointments.map((a) => `${a.client.firstName} ${a.client.lastName ?? ""}`).join(", ");
    return {
      success: false,
      needsConfirmation: true,
      confirmationSummary: `Cancel ${appointments.length} appointment(s) on ${date}. Clients: ${names}`,
      message: `This will cancel ${appointments.length} appointment(s) on ${date}. Clients: ${names}. Say "yes, cancel them" to confirm.`,
    };
  }

  const reason = (args.reason as string) || "Bulk cancellation";
  for (const appt of appointments) {
    await cancelAppointment(appt.id, reason);
  }

  return {
    success: true,
    data: { cancelled: appointments.length },
    message: `Cancelled ${appointments.length} appointment(s) on ${date}.`,
  };
}

// ══════════════════════════════════════════════════════════════
//  AVAILABILITY & SCHEDULE HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleSearchAvailability(args: Args, orgId: string): Promise<FunctionCallResult> {
  const svcResult = await resolveService(orgId, {
    serviceId: args.serviceId as string | undefined,
    serviceName: args.serviceName as string | undefined,
  });

  if (!svcResult.found) {
    const all = await prisma.service.findMany({ where: { organizationId: orgId, isActive: true } });
    return { success: false, message: `${svcResult.error} Available: ${all.map((s) => s.name).join(", ")}` };
  }

  const timezone = await getOrgTimezone(orgId);
  const date = (args.date as string) ?? new Date().toISOString().split("T")[0]!;

  const slots = await getAvailableSlots({
    organizationId: orgId,
    serviceId: svcResult.data.id,
    staffMemberId: args.staffMemberId as string | undefined,
    date,
    timezone,
  });

  if (slots.length === 0) {
    return { success: true, message: `No available slots on ${date}. Try another date.` };
  }

  const summary = slots.slice(0, 8).map((s) => `- ${s.startTime} with ${s.staffName}`).join("\n");

  return {
    success: true,
    data: slots,
    message: `Available slots on ${date} for ${svcResult.data.name}:\n${summary}${slots.length > 8 ? `\n...and ${slots.length - 8} more` : ""}`,
  };
}

async function handleBlockTime(args: Args, orgId: string): Promise<FunctionCallResult> {
  const staffResult = await resolveStaffOrDefault(orgId, args);
  if (!staffResult) return { success: false, message: "No staff member found." };

  await prisma.staffScheduleOverride.create({
    data: {
      staffMemberId: staffResult.id,
      date: new Date(args.date as string),
      startTime: (args.startTime as string) ?? null,
      endTime: (args.endTime as string) ?? null,
      isAvailable: false,
      reason: (args.reason as string) ?? "Blocked",
    },
  });

  return {
    success: true,
    message: `Blocked ${args.date}${args.startTime ? ` from ${args.startTime} to ${args.endTime}` : " (all day)"} for ${staffResult.displayName}.`,
  };
}

async function handleAddExtraAvailability(args: Args, orgId: string): Promise<FunctionCallResult> {
  const staffResult = await resolveStaffOrDefault(orgId, args);
  if (!staffResult) return { success: false, message: "No staff member found." };

  const date = args.date as string;
  const isAvailable = args.isAvailable as boolean;

  const existing = await prisma.staffScheduleOverride.findFirst({
    where: { staffMemberId: staffResult.id, date: new Date(date) },
  });

  const data = {
    startTime: (args.startTime as string) ?? null,
    endTime: (args.endTime as string) ?? null,
    isAvailable,
    reason: (args.reason as string) ?? null,
  };

  if (existing) {
    await prisma.staffScheduleOverride.update({ where: { id: existing.id }, data });
  } else {
    await prisma.staffScheduleOverride.create({
      data: { staffMemberId: staffResult.id, date: new Date(date), ...data },
    });
  }

  if (isAvailable) {
    return { success: true, message: `Added extra availability for ${staffResult.displayName} on ${date}${args.startTime ? ` from ${args.startTime} to ${args.endTime}` : ""}.` };
  } else {
    return { success: true, message: `Blocked ${date} for ${staffResult.displayName}.${args.reason ? ` Reason: ${args.reason}` : ""}` };
  }
}

async function handleRemoveOverride(args: Args, orgId: string): Promise<FunctionCallResult> {
  const staffResult = await resolveStaffOrDefault(orgId, args);
  if (!staffResult) return { success: false, message: "No staff member found." };

  const deleted = await prisma.staffScheduleOverride.deleteMany({
    where: { staffMemberId: staffResult.id, date: new Date(args.date as string) },
  });

  return {
    success: true,
    message: deleted.count > 0
      ? `Removed override for ${staffResult.displayName} on ${args.date}. Regular schedule applies.`
      : `No override found for ${staffResult.displayName} on ${args.date}.`,
  };
}

async function handleGetStaffAvailability(args: Args, orgId: string): Promise<FunctionCallResult> {
  const staffResult = await resolveStaffOrDefault(orgId, args);
  if (!staffResult) return { success: false, message: "No staff member found." };

  const staff = await prisma.staffMember.findUnique({
    where: { id: staffResult.id },
    include: {
      schedules: { where: { isAvailable: true }, orderBy: { dayOfWeek: "asc" } },
      scheduleOverrides: { orderBy: { date: "asc" } },
    },
  });
  if (!staff) return { success: false, message: "Staff not found." };

  const startDate = new Date(args.startDate as string);
  const endDate = new Date(args.endDate as string);

  const appointments = await prisma.appointment.findMany({
    where: {
      staffMemberId: staffResult.id,
      startTime: { gte: startDate },
      endTime: { lte: new Date(endDate.getTime() + 86400000) },
      status: { in: ["CONFIRMED", "PENDING"] },
    },
    include: { service: true, client: true },
    orderBy: { startTime: "asc" },
  });

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const lines: string[] = [`Availability for ${staff.displayName}:`];

  lines.push("\nBase schedule:");
  for (const s of staff.schedules) {
    lines.push(`  ${days[s.dayOfWeek]}: ${s.startTime} - ${s.endTime}`);
  }
  if (staff.schedules.length === 0) lines.push("  No regular schedule set.");

  const relevantOverrides = staff.scheduleOverrides.filter((o) => {
    const d = o.date.toISOString().split("T")[0]!;
    return d >= (args.startDate as string) && d <= (args.endDate as string);
  });

  if (relevantOverrides.length > 0) {
    lines.push("\nOverrides:");
    for (const o of relevantOverrides) {
      const d = o.date.toISOString().split("T")[0];
      lines.push(o.isAvailable
        ? `  ${d}: Extra hours ${o.startTime ?? ""} - ${o.endTime ?? ""}${o.reason ? ` (${o.reason})` : ""}`
        : `  ${d}: BLOCKED${o.reason ? ` (${o.reason})` : ""}`);
    }
  }

  if (appointments.length > 0) {
    lines.push(`\nBooked (${appointments.length}):`);
    for (const a of appointments.slice(0, 10)) {
      const d = a.startTime.toISOString().split("T")[0];
      const t = a.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      lines.push(`  ${d} ${t}: ${a.service?.name} — ${a.client?.firstName ?? "Client"}`);
    }
  }

  return { success: true, data: { schedules: staff.schedules, overrides: relevantOverrides, appointments }, message: lines.join("\n") };
}

async function handleSuggestOptimalTime(args: Args, orgId: string): Promise<FunctionCallResult> {
  const svcResult = await resolveService(orgId, {
    serviceId: args.serviceId as string | undefined,
    serviceName: args.serviceName as string | undefined,
  });
  if (!svcResult.found) return { success: false, message: svcResult.error };

  let staffId: string | undefined;
  if (args.staffMemberId || args.staffName) {
    const staffResult = await resolveStaff(orgId, {
      staffMemberId: args.staffMemberId as string | undefined,
      staffName: args.staffName as string | undefined,
    });
    if (staffResult.found) staffId = staffResult.data.id;
  }

  const timezone = await getOrgTimezone(orgId);
  const date = (args.preferredDate as string) || new Date().toISOString().split("T")[0]!;

  const slots = await getAvailableSlots({
    organizationId: orgId,
    serviceId: svcResult.data.id,
    staffMemberId: staffId,
    date,
    timezone,
  });

  if (slots.length === 0) {
    return { success: false, message: `No available slots on ${date} for ${svcResult.data.name}. Try another date.` };
  }

  // Score slots by gap-filling and peak preference
  const existing = await prisma.appointment.findMany({
    where: {
      organizationId: orgId,
      startTime: { gte: new Date(`${date}T00:00:00Z`), lte: new Date(`${date}T23:59:59Z`) },
      status: { in: ["PENDING", "CONFIRMED"] },
      ...(staffId ? { staffMemberId: staffId } : {}),
    },
  });

  const scored = slots.map((slot) => {
    const t = new Date(slot.startTime);
    const hour = t.getHours();
    let score = 50;
    if (hour >= 9 && hour <= 11) score += 20;
    else if (hour >= 13 && hour <= 15) score += 15;
    for (const ex of existing) {
      const diff = Math.abs(t.getTime() - ex.endTime.getTime()) / 60000;
      if (diff <= 15) score += 25;
      else if (diff <= 30) score += 10;
    }
    if (hour < 9) score -= 10;
    if (hour >= 18) score -= 5;
    return { slot, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);

  const suggestions = top.map((s, i) => {
    const t = new Date(s.slot.startTime);
    const timeStr = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${i + 1}. ${timeStr} with ${s.slot.staffName || "available staff"}`;
  });

  return {
    success: true,
    data: top.map((s) => s.slot),
    message: `Best times on ${date} for ${svcResult.data.name}:\n${suggestions.join("\n")}`,
  };
}

// ══════════════════════════════════════════════════════════════
//  STAFF HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleCreateStaff(args: Args, orgId: string): Promise<FunctionCallResult> {
  const displayName = (args.displayName as string).replace(/\s+/g, " ").trim();

  // Idempotency: check for duplicate
  const existing = await prisma.staffMember.findFirst({
    where: { organizationId: orgId, displayName, isActive: true },
  });
  if (existing) {
    return { success: true, message: `Staff member "${existing.displayName}" already exists.` };
  }

  const serviceNames = (args.serviceNames as string[]) ?? [];
  const services = serviceNames.length > 0
    ? await prisma.service.findMany({ where: { organizationId: orgId, isActive: true } })
    : [];
  const serviceIds = serviceNames
    .map((n) => services.find((s) => s.name.toLowerCase().includes(n.toLowerCase()))?.id)
    .filter((id): id is string => !!id);

  const staff = await prisma.staffMember.create({
    data: {
      organizationId: orgId,
      displayName,
      bio: (args.bio as string) ?? null,
      staffServices: serviceIds.length > 0
        ? { create: serviceIds.map((serviceId) => ({ serviceId })) }
        : undefined,
    },
  });

  // Default Mon-Fri 9-5 schedule
  await prisma.staffSchedule.createMany({
    data: [1, 2, 3, 4, 5].map((day) => ({
      staffMemberId: staff.id,
      dayOfWeek: day,
      startTime: "09:00",
      endTime: "17:00",
      isAvailable: true,
    })),
  });

  return {
    success: true,
    data: staff,
    message: `Created staff member "${staff.displayName}". Default Mon-Fri 9am-5pm schedule set.${serviceIds.length > 0 ? ` Assigned ${serviceIds.length} service(s).` : ""}`,
  };
}

async function handleUpdateStaffServices(args: Args, orgId: string): Promise<FunctionCallResult> {
  const staffResult = await resolveStaff(orgId, {
    staffMemberId: args.staffMemberId as string | undefined,
    staffName: args.staffName as string | undefined,
  });
  if (!staffResult.found) return { success: false, message: staffResult.error };

  const allServices = await prisma.service.findMany({ where: { organizationId: orgId, isActive: true } });
  const currentAssignments = await prisma.staffService.findMany({ where: { staffMemberId: staffResult.data.id } });
  const currentIds = new Set(currentAssignments.map((a) => a.serviceId));

  let finalIds: Set<string>;

  if (args.serviceNames) {
    finalIds = new Set(
      (args.serviceNames as string[])
        .map((n) => allServices.find((s) => s.name.toLowerCase().includes(n.toLowerCase()))?.id)
        .filter((id): id is string => !!id)
    );
  } else {
    finalIds = new Set(currentIds);
    if (args.addServiceNames) {
      for (const n of args.addServiceNames as string[]) {
        const match = allServices.find((s) => s.name.toLowerCase().includes(n.toLowerCase()));
        if (match) finalIds.add(match.id);
      }
    }
    if (args.removeServiceNames) {
      for (const n of args.removeServiceNames as string[]) {
        const match = allServices.find((s) => s.name.toLowerCase().includes(n.toLowerCase()));
        if (match) finalIds.delete(match.id);
      }
    }
  }

  await prisma.staffService.deleteMany({ where: { staffMemberId: staffResult.data.id } });
  if (finalIds.size > 0) {
    await prisma.staffService.createMany({
      data: Array.from(finalIds).map((serviceId) => ({ staffMemberId: staffResult.data.id, serviceId })),
    });
  }

  const names = allServices.filter((s) => finalIds.has(s.id)).map((s) => s.name);
  return { success: true, message: `Updated ${staffResult.data.displayName}'s services: ${names.join(", ") || "none"}.` };
}

async function handleUpdateStaffSchedule(args: Args, orgId: string): Promise<FunctionCallResult> {
  const staffResult = await resolveStaffOrDefault(orgId, args);
  if (!staffResult) return { success: false, message: "No staff member found." };

  const schedule = args.schedule as Array<{ dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean }>;

  await prisma.staffSchedule.deleteMany({ where: { staffMemberId: staffResult.id } });
  await prisma.staffSchedule.createMany({
    data: schedule.map((s) => ({ staffMemberId: staffResult.id, ...s })),
  });

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const summary = schedule.filter((s) => s.isAvailable).map((s) => `${days[s.dayOfWeek]}: ${s.startTime}-${s.endTime}`).join(", ");

  return { success: true, message: `Updated ${staffResult.displayName}'s schedule: ${summary || "No available days."}` };
}

// ══════════════════════════════════════════════════════════════
//  RECURRING HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleCreateRecurringAppointment(args: Args, orgId: string, clientId?: string): Promise<FunctionCallResult> {
  let resolvedClientId = (args.clientId as string) ?? clientId;
  if (!resolvedClientId && args.clientName) {
    const result = await resolveClient(orgId, { clientName: args.clientName as string });
    if (!result.found) return { success: false, message: result.error };
    resolvedClientId = result.data.id;
  }
  if (!resolvedClientId) return { success: false, message: "Client not found." };

  let serviceId = args.serviceId as string | undefined;
  if (!serviceId && args.serviceName) {
    const result = await resolveService(orgId, { serviceName: args.serviceName as string });
    if (!result.found) return { success: false, message: result.error };
    serviceId = result.data.id;
  }
  if (!serviceId) return { success: false, message: "Service not found." };

  let staffMemberId = args.staffMemberId as string | undefined;
  if (!staffMemberId) {
    const staff = await prisma.staffMember.findFirst({
      where: { organizationId: orgId, isActive: true, staffServices: { some: { serviceId } } },
    });
    staffMemberId = staff?.id;
  }
  if (!staffMemberId) return { success: false, message: "No staff available for this service." };

  // Step 1: Create the RecurrenceRule in DB
  const rule = await prisma.recurrenceRule.create({
    data: {
      organizationId: orgId,
      clientId: resolvedClientId,
      serviceId,
      staffMemberId,
      frequency: args.frequency as "WEEKLY" | "BIWEEKLY" | "MONTHLY",
      dayOfWeek: args.dayOfWeek as number | undefined,
      preferredTime: args.preferredTime as string,
      startDate: new Date(args.startDate as string),
      endDate: args.endDate ? new Date(args.endDate as string) : undefined,
    },
  });

  // Step 2: Generate appointment occurrences from the rule
  const result = await createRecurringSeries(rule.id);

  return {
    success: true,
    data: result,
    message: `Created ${(args.frequency as string).toLowerCase()} recurring appointment. ${result.created.length} appointments generated.`,
  };
}

async function handleCancelRecurringSeries(args: Args): Promise<FunctionCallResult> {
  const result = await cancelSeries(
    args.ruleId as string,
    args.scope as "this" | "future" | "all",
    args.appointmentId as string | undefined,
  );

  return {
    success: true,
    data: result,
    message: `Cancelled recurring series (scope: ${result.cancelled}).`,
  };
}

// ══════════════════════════════════════════════════════════════
//  PACKAGE HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleGetClientPackages(args: Args, orgId: string): Promise<FunctionCallResult> {
  const result = await resolveClient(orgId, {
    clientId: args.clientId as string | undefined,
    clientName: args.clientName as string | undefined,
  });
  if (!result.found) return { success: false, message: result.error };

  const packages = await prisma.clientPackage.findMany({
    where: { clientId: result.data.id, status: "ACTIVE" },
    include: { package: true },
  });

  if (packages.length === 0) {
    return { success: true, message: `${result.data.firstName} has no active packages.` };
  }

  const summary = packages.map((p) => {
    const pkg = p.package;
    if (pkg.type === "VISIT_PACK") {
      return `- ${pkg.name}: ${p.visitsUsed}/${p.visitsTotal} visits used${p.expiryDate ? `, expires ${p.expiryDate.toLocaleDateString()}` : ""}`;
    }
    return `- ${pkg.name}: membership${p.expiryDate ? `, renews ${p.expiryDate.toLocaleDateString()}` : ""}`;
  }).join("\n");

  return { success: true, data: packages, message: `${result.data.firstName}'s packages:\n${summary}` };
}

async function handleAssignPackage(args: Args, orgId: string): Promise<FunctionCallResult> {
  const clientResult = await resolveClient(orgId, {
    clientId: args.clientId as string | undefined,
    clientName: args.clientName as string | undefined,
  });
  if (!clientResult.found) return { success: false, message: clientResult.error };

  const pkgResult = await resolvePackage(orgId, {
    packageId: args.packageId as string | undefined,
    packageName: args.packageName as string | undefined,
  });
  if (!pkgResult.found) return { success: false, message: pkgResult.error };

  const pkg = pkgResult.data;
  const expiryDate = pkg.validDays ? new Date(Date.now() + pkg.validDays * 86400000) : null;

  await prisma.clientPackage.create({
    data: {
      organizationId: orgId,
      clientId: clientResult.data.id,
      packageId: pkg.id,
      visitsTotal: pkg.totalVisits,
      expiryDate,
    },
  });

  await logAction(orgId, "PACKAGE_ASSIGNED", `Assigned "${pkg.name}" to ${clientResult.data.firstName}`);

  return {
    success: true,
    message: `Assigned "${pkg.name}" to ${clientResult.data.firstName}${expiryDate ? `, valid until ${expiryDate.toLocaleDateString()}` : ""}.`,
  };
}

async function handleCreatePackage(args: Args, orgId: string): Promise<FunctionCallResult> {
  const pkg = await prisma.package.create({
    data: {
      organizationId: orgId,
      name: args.name as string,
      type: args.type as PackageType,
      price: args.price as number,
      totalVisits: (args.totalVisits as number) ?? null,
      validDays: (args.validDays as number) ?? null,
      billingInterval: (args.billingInterval as string) ?? null,
      includedVisits: (args.includedVisits as number) ?? null,
    },
  });

  const details = pkg.type === "VISIT_PACK"
    ? `${pkg.totalVisits} visits, ${formatCurrency(Number(pkg.price))}`
    : `${formatCurrency(Number(pkg.price))}${pkg.billingInterval ? `/${pkg.billingInterval}` : ""}`;

  return { success: true, data: pkg, message: `Created package "${pkg.name}" — ${details}.` };
}

// ══════════════════════════════════════════════════════════════
//  CAMPAIGN HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleCreateCampaign(args: Args, orgId: string): Promise<FunctionCallResult> {
  const campaign = await prisma.campaign.create({
    data: {
      organizationId: orgId,
      name: args.name as string,
      type: args.type as CampaignType,
      channel: (args.channel as ContactChannel) ?? "EMAIL",
      messageTemplate: (args.messageTemplate as string) ?? null,
      useAi: (args.useAi as boolean) ?? true,
    },
  });

  return { success: true, data: campaign, message: `Created campaign "${campaign.name}" (${campaign.type}, ${campaign.channel}). It's in DRAFT — activate it when ready.` };
}

async function handleUpdateCampaignStatus(args: Args, orgId: string): Promise<FunctionCallResult> {
  const result = await resolveCampaign(orgId, {
    campaignId: args.campaignId as string | undefined,
    campaignName: args.campaignName as string | undefined,
  });
  if (!result.found) return { success: false, message: result.error };

  const updated = await prisma.campaign.update({
    where: { id: result.data.id },
    data: { status: args.status as CampaignStatus },
  });

  return { success: true, data: updated, message: `Campaign "${updated.name}" is now ${updated.status}.` };
}

// ══════════════════════════════════════════════════════════════
//  INTAKE FORM HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleCreateIntakeForm(args: Args, orgId: string): Promise<FunctionCallResult> {
  const form = await prisma.intakeForm.create({
    data: {
      organizationId: orgId,
      name: args.name as string,
      description: (args.description as string) ?? null,
      fields: JSON.stringify(args.fields),
      requireSignature: (args.requireSignature as boolean) ?? false,
    },
  });

  // Link to services if provided
  if (args.serviceNames) {
    const services = await prisma.service.findMany({
      where: { organizationId: orgId, isActive: true },
    });
    for (const name of args.serviceNames as string[]) {
      const match = services.find((s) => s.name.toLowerCase().includes(name.toLowerCase()));
      if (match) {
        await prisma.intakeFormServiceLink.create({
          data: { intakeFormId: form.id, serviceId: match.id },
        });
      }
    }
  }

  return { success: true, data: form, message: `Created intake form "${form.name}" with ${(args.fields as unknown[]).length} field(s).` };
}

// ══════════════════════════════════════════════════════════════
//  PAYROLL & REPORTS
// ══════════════════════════════════════════════════════════════

async function handleGetPayrollSummary(args: Args, orgId: string): Promise<FunctionCallResult> {
  const { start, end } = getDateRangeFromPeriod((args.period as string) ?? "this_month");

  const staff = await prisma.staffMember.findMany({
    where: { organizationId: orgId, isActive: true },
  });

  const lines: string[] = ["Payroll Summary:"];

  for (const s of staff) {
    if (args.staffName && !s.displayName.toLowerCase().includes((args.staffName as string).toLowerCase())) continue;

    const appointments = await prisma.appointment.findMany({
      where: {
        staffMemberId: s.id,
        status: "COMPLETED",
        startTime: { gte: start, lte: end },
      },
      include: { service: true },
    });

    const revenue = appointments.reduce((sum, a) => sum + Number(a.service.price), 0);
    const hours = appointments.reduce((sum, a) => sum + a.service.durationMinutes / 60, 0);
    const commission = revenue * (Number(s.commissionRate) || 0) / 100;
    const hourly = hours * (Number(s.hourlyRate) || 0);

    lines.push(`\n${s.displayName}:`);
    lines.push(`  Appointments: ${appointments.length}`);
    lines.push(`  Hours: ${hours.toFixed(1)}h`);
    lines.push(`  Revenue generated: ${formatCurrency(revenue)}`);
    if (commission > 0) lines.push(`  Commission (${s.commissionRate}%): ${formatCurrency(commission)}`);
    if (hourly > 0) lines.push(`  Hourly pay: ${formatCurrency(hourly)}`);
    lines.push(`  Total earnings: ${formatCurrency(commission + hourly)}`);
  }

  return { success: true, message: lines.join("\n") };
}

async function handleGetRevenueReport(args: Args, orgId: string): Promise<FunctionCallResult> {
  const { start, end } = getDateRangeFromPeriod((args.period as string) ?? "this_month");
  const groupBy = (args.groupBy as string) ?? "service";

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId: orgId,
      status: "COMPLETED",
      startTime: { gte: start, lte: end },
    },
    include: { service: true, staffMember: true },
  });

  const totalRevenue = appointments.reduce((s, a) => s + Number(a.service.price), 0);

  if (groupBy === "staff") {
    const byStaff: Record<string, { name: string; revenue: number; count: number }> = {};
    for (const a of appointments) {
      const key = a.staffMemberId;
      if (!byStaff[key]) byStaff[key] = { name: a.staffMember.displayName, revenue: 0, count: 0 };
      byStaff[key].revenue += Number(a.service.price);
      byStaff[key].count++;
    }
    const lines = Object.values(byStaff)
      .sort((a, b) => b.revenue - a.revenue)
      .map((s) => `- ${s.name}: ${formatCurrency(s.revenue)} (${s.count} appointments)`);

    return { success: true, message: `Revenue by staff (${formatCurrency(totalRevenue)} total):\n${lines.join("\n")}` };
  }

  // Default: by service
  const byService: Record<string, { name: string; revenue: number; count: number }> = {};
  for (const a of appointments) {
    const key = a.serviceId;
    if (!byService[key]) byService[key] = { name: a.service.name, revenue: 0, count: 0 };
    byService[key].revenue += Number(a.service.price);
    byService[key].count++;
  }
  const lines = Object.values(byService)
    .sort((a, b) => b.revenue - a.revenue)
    .map((s) => `- ${s.name}: ${formatCurrency(s.revenue)} (${s.count} bookings)`);

  return { success: true, message: `Revenue by service (${formatCurrency(totalRevenue)} total):\n${lines.join("\n")}` };
}

// ══════════════════════════════════════════════════════════════
//  WAITLIST HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleAddToWaitlist(args: Args, orgId: string): Promise<FunctionCallResult> {
  const clientResult = await resolveClient(orgId, {
    clientId: args.clientId as string | undefined,
    clientName: args.clientName as string | undefined,
  });
  if (!clientResult.found) return { success: false, message: clientResult.error };

  let serviceId: string | undefined;
  if (args.serviceId || args.serviceName) {
    const svcResult = await resolveService(orgId, {
      serviceId: args.serviceId as string | undefined,
      serviceName: args.serviceName as string | undefined,
    });
    if (!svcResult.found) return { success: false, message: svcResult.error };
    serviceId = svcResult.data.id;
  }

  let staffMemberId: string | undefined;
  if (args.staffMemberId || args.staffName) {
    const staffResult = await resolveStaff(orgId, {
      staffMemberId: args.staffMemberId as string | undefined,
      staffName: args.staffName as string | undefined,
    });
    if (staffResult.found) staffMemberId = staffResult.data.id;
  }

  const entry = await prisma.waitlistEntry.create({
    data: {
      organizationId: orgId,
      clientId: clientResult.data.id,
      serviceId: serviceId ?? "",
      staffMemberId: staffMemberId ?? null,
      preferredDate: args.preferredDate ? new Date(args.preferredDate as string) : new Date(),
      preferredTimeStart: (args.preferredTime as string) ?? null,
      autoBook: (args.autoBook as boolean) ?? false,
    },
  });

  return {
    success: true,
    data: entry,
    message: `Added ${clientResult.data.firstName} to the waitlist.${args.preferredDate ? ` Preferred date: ${args.preferredDate}.` : ""}${args.autoBook ? " Auto-book is enabled." : ""}`,
  };
}

async function handleGetWaitlist(args: Args, orgId: string): Promise<FunctionCallResult> {
  const where: Record<string, unknown> = { organizationId: orgId, status: "WAITING" };

  if (args.date) {
    where.preferredDate = new Date(args.date as string);
  }

  const entries = await prisma.waitlistEntry.findMany({
    where,
    include: { client: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  if (entries.length === 0) {
    return { success: true, message: "Waitlist is empty." };
  }

  const summary = entries.map((e) => {
    const client = e.client;
    const pref = e.preferredDate ? ` — prefers ${e.preferredDate.toLocaleDateString()}` : "";
    return `- ${client.firstName} ${client.lastName ?? ""}${pref}${e.autoBook ? " (auto-book)" : ""}`;
  }).join("\n");

  return { success: true, data: entries, message: `Waitlist (${entries.length}):\n${summary}` };
}

// ══════════════════════════════════════════════════════════════
//  ANALYTICS & INFO
// ══════════════════════════════════════════════════════════════

async function handleGetAnalytics(args: Args, orgId: string): Promise<FunctionCallResult> {
  const { start } = getDateRangeFromPeriod((args.period as string) ?? "this_month");

  const [totalBookings, completed, noShows, totalClients, newClients] = await Promise.all([
    prisma.appointment.count({ where: { organizationId: orgId, startTime: { gte: start } } }),
    prisma.appointment.count({ where: { organizationId: orgId, status: "COMPLETED", startTime: { gte: start } } }),
    prisma.appointment.count({ where: { organizationId: orgId, status: "NO_SHOW", startTime: { gte: start } } }),
    prisma.client.count({ where: { organizationId: orgId } }),
    prisma.client.count({ where: { organizationId: orgId, createdAt: { gte: start } } }),
  ]);

  const revenue = await prisma.appointment.findMany({
    where: { organizationId: orgId, status: "COMPLETED", startTime: { gte: start } },
    include: { service: true },
  });
  const totalRevenue = revenue.reduce((s, a) => s + Number(a.service.price), 0);

  return {
    success: true,
    message: `Analytics:\n- Revenue: ${formatCurrency(totalRevenue)}\n- Bookings: ${totalBookings}\n- Completed: ${completed}\n- No-shows: ${noShows}\n- Total clients: ${totalClients}\n- New clients: ${newClients}`,
  };
}

async function handleGetBusinessInfo(args: Args, orgId: string): Promise<FunctionCallResult> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    include: {
      services: { where: { isActive: true } },
      staffMembers: { where: { isActive: true }, include: { schedules: true } },
    },
  });

  switch (args.infoType) {
    case "services": {
      const list = org.services.map((s) => `- ${s.name}: ${s.durationMinutes}min, ${formatCurrency(Number(s.price))}`).join("\n");
      return { success: true, message: `Services:\n${list || "No services set up."}` };
    }
    case "hours": {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const schedules = org.staffMembers.flatMap((s) => s.schedules);
      const list = schedules.filter((s) => s.isAvailable).map((s) => `${days[s.dayOfWeek]}: ${s.startTime} - ${s.endTime}`).join("\n");
      return { success: true, message: `Business hours:\n${list || "No hours set."}` };
    }
    case "location":
      return { success: true, message: `Location: ${org.address ?? "Not set"}` };
    case "pricing": {
      const list = org.services.map((s) => `- ${s.name}: ${formatCurrency(Number(s.price))}`).join("\n");
      return { success: true, message: `Pricing:\n${list || "No services set up."}` };
    }
    default:
      return { success: true, message: `${org.name}\nAddress: ${org.address ?? "N/A"}\nPhone: ${org.phone ?? "N/A"}\nEmail: ${org.email ?? "N/A"}` };
  }
}

async function handleEscalate(args: Args, orgId: string): Promise<FunctionCallResult> {
  if (args.conversationId) {
    await prisma.aiConversation.update({
      where: { id: args.conversationId as string },
      data: { status: "ESCALATED", aiEnabled: false, escalationReason: (args.reason as string) ?? "AI unable to handle request" },
    });
  }

  await logAction(orgId, "ESCALATED_TO_HUMAN", `Escalated: ${(args.reason as string) ?? "AI unable to handle request"}`);

  return { success: true, message: "I've connected you with the business owner. They'll get back to you shortly." };
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

async function logAction(orgId: string, type: AiActionType, description: string) {
  await prisma.aiActionLog.create({
    data: { organizationId: orgId, actionType: type, description },
  });
}

/** Resolve staff from args, falling back to first active staff member */
async function resolveStaffOrDefault(orgId: string, args: Args): Promise<{ id: string; displayName: string } | null> {
  if (args.staffMemberId || args.staffName) {
    const result = await resolveStaff(orgId, {
      staffMemberId: args.staffMemberId as string | undefined,
      staffName: args.staffName as string | undefined,
    });
    if (result.found) return result.data;
  }
  const first = await prisma.staffMember.findFirst({ where: { organizationId: orgId, isActive: true } });
  return first ? { id: first.id, displayName: first.displayName } : null;
}

function getDateRangeFromPeriod(period: string): { start: Date; end: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (period) {
    case "today": {
      const s = new Date(y, m, now.getDate());
      return { start: s, end: new Date(s.getTime() + 86400000) };
    }
    case "this_week": {
      const s = new Date(now);
      s.setDate(now.getDate() - now.getDay());
      s.setHours(0, 0, 0, 0);
      return { start: s, end: new Date(s.getTime() + 7 * 86400000) };
    }
    case "last_month": {
      const s = new Date(y, m - 1, 1);
      const e = new Date(y, m, 0);
      return { start: s, end: e };
    }
    case "this_quarter": {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
      const qEnd = new Date(y, Math.floor(m / 3) * 3 + 3, 0);
      return { start: qStart, end: qEnd };
    }
    case "this_month":
    default: {
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
    }
  }
}
