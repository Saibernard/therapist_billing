import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  createCheckoutSession,
  createSubscriptionCheckout,
} from "@bookai/communications/src/payments";

export const paymentRouter = router({
  createCheckout: protectedProcedure
    .input(
      z.object({
        appointmentId: z.string(),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const appointment = await ctx.prisma.appointment.findFirstOrThrow({
        where: { id: input.appointmentId, organizationId: ctx.organizationId },
        include: { service: true, client: true },
      });

      const url = await createCheckoutSession({
        organizationId: ctx.organizationId,
        appointmentId: input.appointmentId,
        clientId: appointment.clientId,
        amount: Number(appointment.service.price),
        currency: appointment.service.currency,
        serviceName: appointment.service.name,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
      });

      return { url };
    }),

  subscribe: protectedProcedure
    .input(
      z.object({
        tier: z.enum(["PRO", "BUSINESS"]),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const url = await createSubscriptionCheckout(
        ctx.organizationId,
        input.tier,
        input.successUrl,
        input.cancelUrl
      );
      return { url };
    }),

  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
    });
  }),

  switchToRevenueShare: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.prisma.subscription.upsert({
      where: { organizationId: ctx.organizationId },
      update: { pricingModel: "REVENUE_SHARE", tier: "FREE", revenueSharePct: 4 },
      create: {
        organizationId: ctx.organizationId,
        pricingModel: "REVENUE_SHARE",
        tier: "FREE",
        revenueSharePct: 4,
      },
    });
  }),

  recentPayments: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.payment.findMany({
        where: { organizationId: ctx.organizationId },
        include: { appointment: { include: { service: true } }, client: true },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),
});
