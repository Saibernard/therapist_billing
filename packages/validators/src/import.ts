import { z } from "zod";

export const columnMappingSchema = z.record(z.string(), z.string());

export const startImportSchema = z.object({
  importJobId: z.string(),
  mappings: columnMappingSchema,
});

export const importClientRowSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  preferredChannel: z.enum(["EMAIL", "SMS", "WHATSAPP"]).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  source: z.enum(["BOOKING_PAGE", "AI", "MANUAL", "IMPORT", "WALK_IN"]).optional(),
});

export const importServiceRowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  durationMinutes: z.coerce.number().int().min(5),
  bufferMinutes: z.coerce.number().int().min(0).optional(),
  price: z.coerce.number().min(0),
});
