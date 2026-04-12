import { prisma, type AppointmentSource } from "@bookai/db";
import { addMinutes } from "date-fns";
import { detectConflicts } from "./conflicts";

interface CreateAppointmentInput {
  organizationId: string;
  clientId: string;
  serviceId: string;
  staffMemberId: string;
  startTime: Date;
  notes?: string;
  source?: AppointmentSource;
}

export async function createAppointment(input: CreateAppointmentInput) {
  const service = await prisma.service.findFirstOrThrow({
    where: { id: input.serviceId, organizationId: input.organizationId },
  });

  const endTime = addMinutes(input.startTime, service.durationMinutes);

  const { hasConflict, conflicts, spotsRemaining, isGroupService } = await detectConflicts(
    input.staffMemberId,
    input.startTime,
    endTime,
    undefined,
    { serviceId: input.serviceId, maxCapacity: service.maxCapacity }
  );

  if (hasConflict) {
    const msg = isGroupService
      ? `Class is full (${service.maxCapacity} spots). No spots remaining.`
      : `Time slot conflicts with ${conflicts.length} existing appointment(s)`;
    throw new Error(msg);
  }

  const appointment = await prisma.appointment.create({
    data: {
      organizationId: input.organizationId,
      clientId: input.clientId,
      serviceId: input.serviceId,
      staffMemberId: input.staffMemberId,
      startTime: input.startTime,
      endTime,
      status: "CONFIRMED",
      source: input.source ?? "MANUAL",
      notes: input.notes,
    },
    include: {
      client: true,
      service: true,
      staffMember: true,
    },
  });

  await prisma.client.update({
    where: { id: input.clientId },
    data: { totalVisits: { increment: 1 } },
  });

  return appointment;
}

export async function cancelAppointment(
  appointmentId: string,
  reason?: string
) {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { organization: true },
  });

  let internalNotes = "";
  const settings = (appointment.organization.settings && typeof appointment.organization.settings === "object" && !Array.isArray(appointment.organization.settings))
    ? (appointment.organization.settings as Record<string, unknown>)
    : {};
  const policyHours = (typeof settings.cancellationPolicyHours === "number" ? settings.cancellationPolicyHours : 24);
  const hoursUntil =
    (appointment.startTime.getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntil < policyHours && hoursUntil > 0) {
    internalNotes = `Late cancellation (${Math.round(hoursUntil)}h before appointment, policy requires ${policyHours}h notice)`;
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: "CANCELLED",
      cancellationReason: reason,
      internalNotes,
    },
    include: {
      client: true,
      service: true,
      staffMember: true,
    },
  });

  return updated;
}

export async function rescheduleAppointment(
  appointmentId: string,
  newStartTime: Date,
  newStaffMemberId?: string
) {
  const existing = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { service: true },
  });

  const endTime = addMinutes(newStartTime, existing.service.durationMinutes);
  const staffId = newStaffMemberId ?? existing.staffMemberId;

  const { hasConflict } = await detectConflicts(
    staffId,
    newStartTime,
    endTime,
    appointmentId
  );

  if (hasConflict) {
    throw new Error("New time slot has a conflict");
  }

  const appointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      startTime: newStartTime,
      endTime,
      staffMemberId: staffId,
    },
    include: {
      client: true,
      service: true,
      staffMember: true,
    },
  });

  return appointment;
}
