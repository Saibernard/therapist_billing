import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  timezone: z.string().default("America/New_York"),
  currency: z.string().length(3).default("USD"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();
