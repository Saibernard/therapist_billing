import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const waitlistRouter = router({
  list: protectedProcedure
    .input(z.object({ serviceId: z.string().optional(), status: z.enum(["WAITING", "NOTIFIED", "BOOKED", "EXPIRED"]).optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { organizationId: ctx.organizationId };
      if (input.serviceId) where.serviceId = input.serviceId;
      if (input.status) where.status = input.status;
      return ctx.prisma.waitlistEntry.findMany({
        where,
        include: { client: true, service: true, staffMember: true },
        orderBy: { createdAt: "asc" },
      });
    }),

  add: protectedProcedure
    .input(z.object({
      clientId: z.string(),
      serviceId: z.string(),
      staffMemberId: z.string().optional(),
      preferredDate: z.string().datetime(),
      preferredTimeStart: z.string().optional(),
      preferredTimeEnd: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.waitlistEntry.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: input.clientId,
          serviceId: input.serviceId,
          staffMemberId: input.staffMemberId,
          preferredDate: new Date(input.preferredDate),
          preferredTimeStart: input.preferredTimeStart,
          preferredTimeEnd: input.preferredTimeEnd,
        },
      });
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["WAITING", "NOTIFIED", "BOOKED", "EXPIRED"]) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.waitlistEntry.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.status === "NOTIFIED" ? { notifiedAt: new Date() } : {}),
        },
      });
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.waitlistEntry.delete({ where: { id: input.id } });
    }),
});
