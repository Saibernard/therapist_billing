import { z } from "zod";

export const createServiceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  durationMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(60).default(0),
  price: z.number().min(0),
  currency: z.string().length(3).default("USD"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#3B82F6"),
  maxCapacity: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
});

export const updateServiceSchema = createServiceSchema.partial();
