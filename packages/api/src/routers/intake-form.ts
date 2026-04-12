import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import type { Prisma } from "@prisma/client";

export const intakeFormRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.intakeForm.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        serviceLinks: { include: { service: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.intakeForm.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: {
          serviceLinks: { include: { service: true } },
          submissions: {
            include: { client: true, appointment: true },
            orderBy: { submittedAt: "desc" },
            take: 50,
          },
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        fields: z.array(z.any()).min(1),
        requireSignature: z.boolean().default(false),
        serviceIds: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const form = await ctx.prisma.intakeForm.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          description: input.description,
          fields: JSON.stringify(input.fields),
          requireSignature: input.requireSignature,
        },
      });

      if (input.serviceIds.length > 0) {
        await ctx.prisma.intakeFormServiceLink.createMany({
          data: input.serviceIds.map((serviceId) => ({
            intakeFormId: form.id,
            serviceId,
          })),
        });
      }

      return form;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          fields: z.array(z.any()).optional(),
          requireSignature: z.boolean().optional(),
          isActive: z.boolean().optional(),
          serviceIds: z.array(z.string()).optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { serviceIds, ...data } = input.data;

      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.fields !== undefined) updateData.fields = JSON.stringify(data.fields);
      if (data.requireSignature !== undefined) updateData.requireSignature = data.requireSignature;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      const form = await ctx.prisma.intakeForm.update({
        where: { id: input.id },
        data: updateData,
      });

      if (serviceIds !== undefined) {
        await ctx.prisma.intakeFormServiceLink.deleteMany({
          where: { intakeFormId: input.id },
        });
        if (serviceIds.length > 0) {
          await ctx.prisma.intakeFormServiceLink.createMany({
            data: serviceIds.map((serviceId) => ({
              intakeFormId: input.id,
              serviceId,
            })),
          });
        }
      }

      return form;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.intakeForm.update({
        where: { id: input.id },
        data: { isActive: false },
      });
    }),

  // Get forms required for a specific service
  getForService: protectedProcedure
    .input(z.object({ serviceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const links = await ctx.prisma.intakeFormServiceLink.findMany({
        where: { serviceId: input.serviceId },
        include: { intakeForm: true },
      });
      return links
        .map((l) => l.intakeForm)
        .filter((f) => f.isActive);
    }),

  // Get submissions for a client
  getClientSubmissions: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.intakeFormSubmission.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId: input.clientId,
        },
        include: { intakeForm: true, appointment: true },
        orderBy: { submittedAt: "desc" },
      });
    }),

  // Submit a form (used by public intake page)
  submit: publicProcedure
    .input(
      z.object({
        intakeFormId: z.string(),
        clientId: z.string(),
        organizationId: z.string(),
        appointmentId: z.string().optional(),
        responses: z.record(z.string(), z.unknown()),
        signatureData: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const form = await ctx.prisma.intakeForm.findFirstOrThrow({
        where: { id: input.intakeFormId, organizationId: input.organizationId, isActive: true },
      });

      return ctx.prisma.intakeFormSubmission.create({
        data: {
          organizationId: input.organizationId,
          intakeFormId: input.intakeFormId,
          clientId: input.clientId,
          appointmentId: input.appointmentId,
          responses: JSON.stringify(input.responses),
          signatureData: input.signatureData,
          signedAt: input.signatureData ? new Date() : null,
        },
      });
    }),

  // Get a single submission
  getSubmission: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.intakeFormSubmission.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: { intakeForm: true, client: true, appointment: true },
      });
    }),
});
