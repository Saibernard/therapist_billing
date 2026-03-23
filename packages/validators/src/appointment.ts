import { z } from "zod";

export const createAppointmentSchema = z.object({
  clientId: z.string().cuid(),
  serviceId: z.string().cuid(),
  staffMemberId: z.string().cuid(),
  startTime: z.string().datetime(),
  notes: z.string().max(2000).optional(),
  source: z
    .enum([
      "BOOKING_PAGE",
      "SMS",
      "WHATSAPP",
      "EMAIL_REPLY",
      "AI_CHAT",
      "MANUAL",
      "WIDGET",
    ])
    .default("MANUAL"),
});

export const updateAppointmentSchema = z.object({
  status: z
    .enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"])
    .optional(),
  notes: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
  cancellationReason: z.string().max(500).optional(),
});

export const rescheduleAppointmentSchema = z.object({
  appointmentId: z.string().cuid(),
  newStartTime: z.string().datetime(),
  staffMemberId: z.string().cuid().optional(),
  notifyClient: z.boolean().default(true),
});
