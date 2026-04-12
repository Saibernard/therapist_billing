import { z } from "zod";

export const createRecurrenceRuleSchema = z.object({
  clientId: z.string(),
  serviceId: z.string(),
  staffMemberId: z.string(),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"]),
  intervalWeeks: z.number().int().min(1).max(12).default(1),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/),
  startDate: z.string(),
  endDate: z.string().optional(),
  maxOccurrences: z.number().int().min(1).optional(),
});

export const cancelRecurrenceSchema = z.object({
  ruleId: z.string(),
  scope: z.enum(["this", "future", "all"]),
  appointmentId: z.string().optional(),
});
