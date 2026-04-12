import { z } from "zod";

/**
 * Zod validation schemas for every AI function's arguments.
 *
 * The executor calls `validateArgs(functionName, rawArgs)` before
 * running any business logic. If validation fails, the user gets
 * a clear error message instead of a crash or undefined behavior.
 */

// ── Schemas ───────────────────────────────────────────────────

const schemas: Record<string, z.ZodType> = {
  // ── Services ──
  create_service: z.object({
    name: z.string().min(1, "Service name is required"),
    durationMinutes: z.number().min(5, "Duration must be at least 5 minutes"),
    price: z.number().min(0, "Price cannot be negative"),
    description: z.string().optional(),
    category: z.string().optional(),
    bufferMinutes: z.number().min(0).optional(),
    maxCapacity: z.number().min(1).optional(),
  }),

  update_service: z.object({
    serviceId: z.string().optional(),
    serviceName: z.string().optional(),
    name: z.string().min(1).optional(),
    durationMinutes: z.number().min(5).optional(),
    price: z.number().min(0).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    bufferMinutes: z.number().min(0).optional(),
    maxCapacity: z.number().min(1).optional(),
    depositAmount: z.number().min(0).optional(),
    noShowFeeAmount: z.number().min(0).optional(),
  }),

  delete_service: z.object({
    serviceId: z.string().optional(),
    serviceName: z.string().optional(),
    confirmed: z.boolean().optional(),
  }),

  // ── Clients ──
  create_client: z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().optional(),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    phone: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),

  update_client: z.object({
    clientId: z.string().optional(),
    clientName: z.string().optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),

  search_clients: z.object({
    query: z.string().min(1, "Search query is required"),
  }),

  // ── Appointments ──
  search_appointments: z.object({
    date: z.string().optional(),
    clientName: z.string().optional(),
    status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]).optional(),
    staffMemberId: z.string().optional(),
  }),

  create_appointment: z.object({
    clientName: z.string().optional(),
    clientPhone: z.string().optional(),
    clientEmail: z.string().optional(),
    clientId: z.string().optional(),
    serviceId: z.string().optional(),
    serviceName: z.string().optional(),
    staffMemberId: z.string().optional(),
    staffName: z.string().optional(),
    dateTime: z.string().min(1, "Date/time is required"),
    notes: z.string().optional(),
  }),

  complete_appointment: z.object({
    appointmentId: z.string().optional(),
    clientName: z.string().optional(),
    date: z.string().optional(),
  }),

  mark_no_show: z.object({
    appointmentId: z.string().optional(),
    clientName: z.string().optional(),
    date: z.string().optional(),
  }),

  reschedule_appointment: z.object({
    appointmentId: z.string().min(1, "Appointment ID is required"),
    newDateTime: z.string().min(1, "New date/time is required"),
  }),

  cancel_appointment: z.object({
    appointmentId: z.string().min(1, "Appointment ID is required"),
    reason: z.string().optional(),
  }),

  confirm_appointment: z.object({
    appointmentId: z.string().min(1, "Appointment ID is required"),
  }),

  bulk_reschedule: z.object({
    sourceDate: z.string().min(1, "Source date is required (YYYY-MM-DD)"),
    targetDate: z.string().min(1, "Target date is required (YYYY-MM-DD)"),
    staffMemberId: z.string().optional(),
    staffName: z.string().optional(),
    clientName: z.string().optional(),
    preserveTime: z.boolean().optional(),
    confirmed: z.boolean().optional(),
  }),

  bulk_cancel: z.object({
    date: z.string().min(1, "Date is required (YYYY-MM-DD)"),
    staffMemberId: z.string().optional(),
    staffName: z.string().optional(),
    reason: z.string().optional(),
    confirmed: z.boolean().optional(),
  }),

  // ── Availability & Schedule ──
  search_availability: z.object({
    serviceId: z.string().optional(),
    serviceName: z.string().optional(),
    staffMemberId: z.string().optional(),
    date: z.string().optional(),
    dateRange: z.string().optional(),
  }),

  block_time: z.object({
    staffMemberId: z.string().optional(),
    staffName: z.string().optional(),
    date: z.string().min(1, "Date is required"),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    reason: z.string().optional(),
  }),

  add_extra_availability: z.object({
    staffMemberId: z.string().optional(),
    staffName: z.string().optional(),
    date: z.string().min(1, "Date is required"),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    isAvailable: z.boolean(),
    reason: z.string().optional(),
  }),

  remove_override: z.object({
    staffMemberId: z.string().optional(),
    staffName: z.string().optional(),
    date: z.string().min(1, "Date is required"),
  }),

  get_staff_availability: z.object({
    staffMemberId: z.string().optional(),
    staffName: z.string().optional(),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
  }),

  suggest_optimal_time: z.object({
    serviceId: z.string().optional(),
    serviceName: z.string().optional(),
    staffMemberId: z.string().optional(),
    staffName: z.string().optional(),
    clientName: z.string().optional(),
    preferredDate: z.string().optional(),
  }),

  // ── Staff ──
  create_staff: z.object({
    displayName: z.string().min(1, "Staff name is required"),
    bio: z.string().optional(),
    serviceNames: z.array(z.string()).optional(),
  }),

  update_staff_services: z.object({
    staffMemberId: z.string().optional(),
    staffName: z.string().optional(),
    serviceNames: z.array(z.string()).optional(),
    addServiceNames: z.array(z.string()).optional(),
    removeServiceNames: z.array(z.string()).optional(),
  }),

  update_staff_schedule: z.object({
    staffMemberId: z.string().optional(),
    staffName: z.string().optional(),
    schedule: z.array(
      z.object({
        dayOfWeek: z.number().min(0).max(6),
        startTime: z.string(),
        endTime: z.string(),
        isAvailable: z.boolean(),
      })
    ),
  }),

  // ── Recurring ──
  create_recurring_appointment: z.object({
    clientId: z.string().optional(),
    clientName: z.string().optional(),
    serviceId: z.string().optional(),
    serviceName: z.string().optional(),
    staffMemberId: z.string().optional(),
    frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
    dayOfWeek: z.number().min(0).max(6).optional(),
    preferredTime: z.string().min(1, "Preferred time is required"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().optional(),
  }),

  cancel_recurring_series: z.object({
    ruleId: z.string().min(1, "Recurrence rule ID is required"),
    scope: z.enum(["this", "future", "all"]),
    appointmentId: z.string().optional(),
  }),

  // ── Packages ──
  get_client_packages: z.object({
    clientId: z.string().optional(),
    clientName: z.string().optional(),
  }),

  assign_package: z.object({
    clientId: z.string().optional(),
    clientName: z.string().optional(),
    packageId: z.string().optional(),
    packageName: z.string().optional(),
  }),

  create_package: z.object({
    name: z.string().min(1, "Package name is required"),
    type: z.enum(["VISIT_PACK", "MEMBERSHIP"]),
    price: z.number().min(0, "Price cannot be negative"),
    totalVisits: z.number().min(1).optional(),
    validDays: z.number().min(1).optional(),
    billingInterval: z.string().optional(),
    includedVisits: z.number().min(1).optional(),
  }),

  // ── Campaigns ──
  create_campaign: z.object({
    name: z.string().min(1, "Campaign name is required"),
    type: z.enum(["BIRTHDAY", "WINBACK", "POST_VISIT", "REBOOK_NUDGE", "CUSTOM"]),
    channel: z.enum(["EMAIL", "SMS", "WHATSAPP"]).optional(),
    messageTemplate: z.string().optional(),
    useAi: z.boolean().optional(),
  }),

  update_campaign_status: z.object({
    campaignId: z.string().optional(),
    campaignName: z.string().optional(),
    status: z.enum(["ACTIVE", "PAUSED", "DRAFT"]),
  }),

  // ── Intake Forms ──
  create_intake_form: z.object({
    name: z.string().min(1, "Form name is required"),
    description: z.string().optional(),
    fields: z.array(
      z.object({
        type: z.string(),
        label: z.string(),
        required: z.boolean().optional(),
        options: z.array(z.string()).optional(),
        placeholder: z.string().optional(),
      })
    ),
    requireSignature: z.boolean().optional(),
    serviceNames: z.array(z.string()).optional(),
  }),

  // ── Payroll & Reports ──
  get_payroll_summary: z.object({
    period: z.enum(["this_week", "this_month", "last_month"]).optional(),
    staffName: z.string().optional(),
  }),

  get_revenue_report: z.object({
    period: z.enum(["today", "this_week", "this_month", "last_month", "this_quarter"]).optional(),
    groupBy: z.enum(["service", "staff", "day"]).optional(),
  }),

  // ── Waitlist ──
  add_to_waitlist: z.object({
    clientId: z.string().optional(),
    clientName: z.string().optional(),
    serviceId: z.string().optional(),
    serviceName: z.string().optional(),
    staffMemberId: z.string().optional(),
    staffName: z.string().optional(),
    preferredDate: z.string().optional(),
    preferredTime: z.string().optional(),
    autoBook: z.boolean().optional(),
  }),

  get_waitlist: z.object({
    date: z.string().optional(),
    serviceName: z.string().optional(),
  }),

  // ── Service Fees ──
  update_service_fees: z.object({
    serviceId: z.string().optional(),
    serviceName: z.string().optional(),
    depositAmount: z.number().min(0).optional(),
    depositType: z.enum(["FIXED", "PERCENTAGE"]).optional(),
    noShowFeeAmount: z.number().min(0).optional(),
  }),

  // ── Analytics / Info ──
  get_analytics: z.object({
    metric: z.enum(["revenue", "bookings", "no_shows", "new_clients", "utilization"]),
    period: z.enum(["today", "this_week", "this_month", "last_month"]).optional(),
  }),

  get_business_info: z.object({
    infoType: z.enum(["hours", "location", "services", "pricing", "policies"]),
  }),

  escalate_to_human: z.object({
    reason: z.string().min(1, "Reason is required"),
    conversationId: z.string().optional(),
  }),
};

// ── Validator ─────────────────────────────────────────────────

export interface ValidationOk {
  valid: true;
  data: Record<string, unknown>;
}

export interface ValidationFail {
  valid: false;
  error: string;
}

export type ValidationResult = ValidationOk | ValidationFail;

export function validateArgs(
  functionName: string,
  rawArgs: Record<string, unknown>
): ValidationResult {
  const schema = schemas[functionName];

  // No schema = skip validation (backward compat for unknown functions)
  if (!schema) return { valid: true, data: rawArgs };

  const result = schema.safeParse(rawArgs);
  if (result.success) {
    return { valid: true, data: result.data as Record<string, unknown> };
  }

  const issues = result.error.issues
    .map((i) => {
      const path = i.path.length > 0 ? `${i.path.join(".")}: ` : "";
      return `${path}${i.message}`;
    })
    .join("; ");

  return { valid: false, error: `Invalid parameters: ${issues}` };
}
