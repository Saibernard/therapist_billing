import { z } from "zod";

const intakeFieldSchema = z.object({
  id: z.string(),
  type: z.enum([
    "text",
    "textarea",
    "select",
    "checkbox",
    "date",
    "signature",
    "file",
    "radio",
    "number",
    "email",
    "phone",
  ]),
  label: z.string().min(1),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
});

export const createIntakeFormSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(intakeFieldSchema).min(1),
  requireSignature: z.boolean().default(false),
  serviceIds: z.array(z.string()).default([]),
});

export const updateIntakeFormSchema = z.object({
  id: z.string(),
  data: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    fields: z.array(intakeFieldSchema).optional(),
    requireSignature: z.boolean().optional(),
    isActive: z.boolean().optional(),
    serviceIds: z.array(z.string()).optional(),
  }),
});

export const submitIntakeFormSchema = z.object({
  intakeFormId: z.string(),
  clientId: z.string(),
  appointmentId: z.string().optional(),
  responses: z.record(z.string(), z.unknown()),
  signatureData: z.string().optional(),
});

export type IntakeField = z.infer<typeof intakeFieldSchema>;
