import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { createServiceSchema, updateServiceSchema } from "@bookai/validators";

export const serviceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.service.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { sortOrder: "asc" },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.service.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: {
          staffServices: { include: { staffMember: true } },
        },
      });
    }),

  create: protectedProcedure
    .input(createServiceSchema)
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.prisma.service.count({
        where: { organizationId: ctx.organizationId },
      });
      return ctx.prisma.service.create({
        data: {
          ...input,
          organizationId: ctx.organizationId,
          sortOrder: count,
        },
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: updateServiceSchema }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.service.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.service.update({
        where: { id: input.id },
        data: { isActive: false },
      });
    }),
});
