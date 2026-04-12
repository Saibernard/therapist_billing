import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { createRecurrenceRuleSchema, cancelRecurrenceSchema } from "@bookai/validators";
import { createRecurringSeries, cancelSeries } from "@bookai/scheduling";

export const recurrenceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.recurrenceRule.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      include: {
        client: true,
        service: true,
        staffMember: true,
        _count: {
          select: {
            appointments: {
              where: { status: { in: ["CONFIRMED", "PENDING"] } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  getByClient: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.recurrenceRule.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId: input.clientId,
          isActive: true,
        },
        include: { service: true, staffMember: true },
      });
    }),

  create: protectedProcedure
    .input(createRecurrenceRuleSchema)
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.prisma.recurrenceRule.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: input.clientId,
          serviceId: input.serviceId,
          staffMemberId: input.staffMemberId,
          frequency: input.frequency,
          intervalWeeks: input.intervalWeeks,
          dayOfWeek: input.dayOfWeek,
          dayOfMonth: input.dayOfMonth,
          preferredTime: input.preferredTime,
          startDate: new Date(input.startDate),
          endDate: input.endDate ? new Date(input.endDate) : null,
          maxOccurrences: input.maxOccurrences,
        },
      });

      const { created, skipped } = await createRecurringSeries(rule.id);

      return {
        rule,
        appointmentsCreated: created.length,
        appointmentsSkipped: skipped.length,
      };
    }),

  cancel: protectedProcedure
    .input(cancelRecurrenceSchema)
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.prisma.recurrenceRule.findFirstOrThrow({
        where: { id: input.ruleId, organizationId: ctx.organizationId },
      });

      return cancelSeries(rule.id, input.scope, input.appointmentId);
    }),

  regenerate: protectedProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.prisma.recurrenceRule.findFirstOrThrow({
        where: { id: input.ruleId, organizationId: ctx.organizationId },
      });

      const { created, skipped } = await createRecurringSeries(rule.id);

      return {
        appointmentsCreated: created.length,
        appointmentsSkipped: skipped.length,
      };
    }),
});
