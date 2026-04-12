import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from "date-fns";
import {
  getHighRiskAppointments,
  scoreUpcomingAppointments,
  generateOptimizationReport,
  getUtilizationSummary,
} from "@bookai/ai";

export const analyticsRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);
    const thirtyDaysAgo = subDays(today, 30);

    const [
      todayAppointments,
      monthlyAppointments,
      totalClients,
      recentClients,
    ] = await Promise.all([
      ctx.prisma.appointment.count({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: startOfToday, lte: endOfToday },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
      }),
      ctx.prisma.appointment.count({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: startOfMonth(today), lte: endOfMonth(today) },
          status: { not: "CANCELLED" },
        },
      }),
      ctx.prisma.client.count({
        where: { organizationId: ctx.organizationId },
      }),
      ctx.prisma.client.count({
        where: {
          organizationId: ctx.organizationId,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    const noShows = await ctx.prisma.appointment.count({
      where: {
        organizationId: ctx.organizationId,
        startTime: { gte: thirtyDaysAgo },
        status: "NO_SHOW",
      },
    });

    return {
      todayAppointments,
      monthlyAppointments,
      totalClients,
      newClientsLast30Days: recentClients,
      noShowsLast30Days: noShows,
      noShowRate:
        monthlyAppointments > 0
          ? Math.round((noShows / monthlyAppointments) * 100)
          : 0,
    };
  }),

  upcomingAppointments: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.appointment.findMany({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: new Date() },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        take: input.limit,
        orderBy: { startTime: "asc" },
        include: {
          client: true,
          service: true,
          staffMember: true,
        },
      });
    }),

  noShowRisk: protectedProcedure
    .input(
      z.object({
        date: z.string().optional(),
        threshold: z.number().min(0).max(100).default(40),
      })
    )
    .query(async ({ ctx, input }) => {
      return getHighRiskAppointments(ctx.organizationId, {
        date: input.date,
        threshold: input.threshold,
      });
    }),

  scoreNoShowRisk: protectedProcedure
    .input(
      z.object({
        date: z.string().optional(),
        daysAhead: z.number().min(1).max(30).default(7),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scores = await scoreUpcomingAppointments(ctx.organizationId, {
        date: input.date,
        daysAhead: input.daysAhead,
      });
      const highRisk = scores.filter((s) => s.risk >= 40).length;
      return {
        total: scores.length,
        highRisk,
        scores,
      };
    }),

  optimizationReport: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      return generateOptimizationReport(ctx.organizationId, input.date);
    }),

  utilization: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getUtilizationSummary(
        ctx.organizationId,
        input.startDate,
        input.endDate
      );
    }),
});
