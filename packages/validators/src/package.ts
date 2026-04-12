import { z } from "zod";

export const createPackageSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["VISIT_PACK", "MEMBERSHIP"]),
  price: z.number().min(0),
  totalVisits: z.number().int().min(1).optional(),
  validDays: z.number().int().min(1).optional(),
  billingInterval: z.enum(["monthly", "yearly"]).optional(),
  includedVisits: z.number().int().min(1).optional(),
  serviceIds: z.array(z.string()).default([]),
});

export const updatePackageSchema = z.object({
  id: z.string(),
  data: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    price: z.number().min(0).optional(),
    totalVisits: z.number().int().min(1).optional(),
    validDays: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
    serviceIds: z.array(z.string()).optional(),
  }),
});

export const assignPackageSchema = z.object({
  packageId: z.string(),
  clientId: z.string(),
});
