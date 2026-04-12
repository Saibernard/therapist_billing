import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const reportsRouter = router({
  // Revenue broken down by service
  revenueByService: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      end.setHours(23, 59, 59, 999);

      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: "COMPLETED",
          startTime: { gte: start },
          endTime: { lte: end },
        },
        include: { service: { select: { id: true, name: true, price: true, category: true } } },
      });

      const serviceMap = new Map<
        string,
        { serviceId: string; name: string; category: string | null; count: number; revenue: number }
      >();

      for (const appt of appointments) {
        const s = appt.service;
        const existing = serviceMap.get(s.id) ?? {
          serviceId: s.id,
          name: s.name,
          category: s.category,
          count: 0,
          revenue: 0,
        };
        existing.count++;
        existing.revenue += Number(s.price);
        serviceMap.set(s.id, existing);
      }

      return Array.from(serviceMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .map((s) => ({
          ...s,
          revenue: Math.round(s.revenue * 100) / 100,
          avgRevenue: Math.round((s.revenue / s.count) * 100) / 100,
        }));
    }),

  // Staff performance metrics
  staffPerformance: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      end.setHours(23, 59, 59, 999);

      const staff = await ctx.prisma.staffMember.findMany({
        where: { organizationId: ctx.organizationId, isActive: true },
        select: { id: true, displayName: true },
      });

      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: start },
          endTime: { lte: end },
        },
        include: { service: { select: { price: true, durationMinutes: true } } },
      });

      return staff.map((s) => {
        const staffAppts = appointments.filter((a) => a.staffMemberId === s.id);
        const completed = staffAppts.filter((a) => a.status === "COMPLETED");
        const noShows = staffAppts.filter((a) => a.status === "NO_SHOW");
        const cancelled = staffAppts.filter((a) => a.status === "CANCELLED");
        const revenue = completed.reduce((sum, a) => sum + Number(a.service.price), 0);
        const totalMinutes = completed.reduce((sum, a) => sum + a.service.durationMinutes, 0);

        return {
          staffMemberId: s.id,
          displayName: s.displayName,
          totalAppointments: staffAppts.length,
          completed: completed.length,
          noShows: noShows.length,
          cancelled: cancelled.length,
          completionRate:
            staffAppts.length > 0
              ? Math.round((completed.length / staffAppts.length) * 100)
              : 0,
          revenue: Math.round(revenue * 100) / 100,
          utilization: Math.round((totalMinutes / 60) * 10) / 10,
        };
      });
    }),

  // Client retention cohort analysis
  retentionCohorts: protectedProcedure
    .input(z.object({ months: z.number().int().min(1).max(12).default(6) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const cohorts: Array<{
        month: string;
        newClients: number;
        returnedNext: number;
        retentionRate: number;
      }> = [];

      for (let i = input.months - 1; i >= 0; i--) {
        const cohortStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const cohortEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() - i + 2, 0);

        // Clients who had their first appointment in this month
        const newClients = await ctx.prisma.client.findMany({
          where: {
            organizationId: ctx.organizationId,
            createdAt: { gte: cohortStart, lte: cohortEnd },
          },
          select: { id: true },
        });

        if (newClients.length === 0) {
          cohorts.push({
            month: cohortStart.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
            newClients: 0,
            returnedNext: 0,
            retentionRate: 0,
          });
          continue;
        }

        // How many came back the following month
        const returnVisits = await ctx.prisma.appointment.findMany({
          where: {
            organizationId: ctx.organizationId,
            clientId: { in: newClients.map((c) => c.id) },
            status: { in: ["COMPLETED", "CONFIRMED"] },
            startTime: { gt: cohortEnd, lte: nextMonthEnd },
          },
          select: { clientId: true },
          distinct: ["clientId"],
        });

        const retentionRate =
          newClients.length > 0
            ? Math.round((returnVisits.length / newClients.length) * 100)
            : 0;

        cohorts.push({
          month: cohortStart.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
          newClients: newClients.length,
          returnedNext: returnVisits.length,
          retentionRate,
        });
      }

      return cohorts;
    }),

  // Summary dashboard stats
  summary: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      end.setHours(23, 59, 59, 999);

      const [totalAppointments, completed, noShows, newClients, appointments] =
        await Promise.all([
          ctx.prisma.appointment.count({
            where: {
              organizationId: ctx.organizationId,
              startTime: { gte: start, lte: end },
            },
          }),
          ctx.prisma.appointment.count({
            where: {
              organizationId: ctx.organizationId,
              status: "COMPLETED",
              startTime: { gte: start, lte: end },
            },
          }),
          ctx.prisma.appointment.count({
            where: {
              organizationId: ctx.organizationId,
              status: "NO_SHOW",
              startTime: { gte: start, lte: end },
            },
          }),
          ctx.prisma.client.count({
            where: {
              organizationId: ctx.organizationId,
              createdAt: { gte: start, lte: end },
            },
          }),
          ctx.prisma.appointment.findMany({
            where: {
              organizationId: ctx.organizationId,
              status: "COMPLETED",
              startTime: { gte: start, lte: end },
            },
            include: { service: { select: { price: true } } },
          }),
        ]);

      const revenue = appointments.reduce((sum, a) => sum + Number(a.service.price), 0);

      return {
        totalAppointments,
        completed,
        noShows,
        noShowRate: totalAppointments > 0 ? Math.round((noShows / totalAppointments) * 100) : 0,
        newClients,
        revenue: Math.round(revenue * 100) / 100,
        avgRevenuePerAppointment:
          completed > 0 ? Math.round((revenue / completed) * 100) / 100 : 0,
      };
    }),
});
