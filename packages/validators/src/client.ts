import { z } from "zod";

export const createClientSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().max(50).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).default([]),
  preferredChannel: z.enum(["EMAIL", "SMS", "WHATSAPP"]).default("EMAIL"),
  source: z
    .enum(["BOOKING_PAGE", "AI", "MANUAL", "IMPORT", "WALK_IN"])
    .default("MANUAL"),
});

export const updateClientSchema = createClientSchema.partial();
