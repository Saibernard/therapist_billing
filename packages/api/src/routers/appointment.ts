import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
} from "@bookai/validators";
import {
  createAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from "@bookai/scheduling";

export const appointmentRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        staffMemberId: z.string().optional(),
        status: z
          .enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"])
          .optional(),
        limit: z.number().min(1).max(500).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        organizationId: ctx.organizationId,
      };

      if (input.startDate || input.endDate) {
        const timeFilter: Record<string, Date> = {};
        if (input.startDate) timeFilter.gte = new Date(input.startDate);
        if (input.endDate) timeFilter.lte = new Date(input.endDate);
        where.startTime = timeFilter;
      }
      if (input.staffMemberId) where.staffMemberId = input.staffMemberId;
      if (input.status) where.status = input.status;

      return ctx.prisma.appointment.findMany({
        where,
        take: input.limit,
        orderBy: { startTime: "asc" },
        include: {
          client: true,
          service: true,
          staffMember: true,
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.appointment.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: {
          client: true,
          service: true,
          staffMember: true,
          communicationLogs: { orderBy: { createdAt: "desc" } },
        },
      });
    }),

  create: protectedProcedure
    .input(createAppointmentSchema)
    .mutation(async ({ ctx, input }) => {
      return createAppointment({
        organizationId: ctx.organizationId,
        clientId: input.clientId,
        serviceId: input.serviceId,
        staffMemberId: input.staffMemberId,
        startTime: new Date(input.startTime),
        notes: input.notes,
        source: input.source as never,
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: updateAppointmentSchema }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.appointment.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      return cancelAppointment(input.id, input.reason);
    }),

  reschedule: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        newStartTime: z.string().datetime(),
        staffMemberId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return rescheduleAppointment(
        input.id,
        new Date(input.newStartTime),
        input.staffMemberId
      );
    }),
});
