import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "@bookai/validators";

export const organizationRouter = router({
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const org = await ctx.prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      include: { subscription: true },
    });
    if (!org) {
      const firstOrg = await ctx.prisma.organization.findFirst({
        include: { subscription: true },
      });
      if (firstOrg) return firstOrg;
      throw new Error("No organization found. Please complete onboarding.");
    }
    return org;
  }),

  dashboardStats: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const [todayAppts, monthAppts, totalClients, noShows, totalLast30] = await Promise.all([
      ctx.prisma.appointment.count({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: todayStart, lt: todayEnd },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
      }),
      ctx.prisma.appointment.count({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: monthStart },
          status: { not: "CANCELLED" },
        },
      }),
      ctx.prisma.client.count({
        where: { organizationId: ctx.organizationId },
      }),
      ctx.prisma.appointment.count({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: thirtyDaysAgo },
          status: "NO_SHOW",
        },
      }),
      ctx.prisma.appointment.count({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: thirtyDaysAgo },
          status: { not: "CANCELLED" },
        },
      }),
    ]);

    const noShowRate = totalLast30 > 0 ? Math.round((noShows / totalLast30) * 100) : 0;

    const upcomingAppts = await ctx.prisma.appointment.findMany({
      where: {
        organizationId: ctx.organizationId,
        startTime: { gte: now },
        status: { in: ["CONFIRMED", "PENDING"] },
      },
      take: 5,
      orderBy: { startTime: "asc" },
      include: { client: true, service: true, staffMember: true },
    });

    return {
      todayAppointments: todayAppts,
      monthBookings: monthAppts,
      totalClients,
      noShowRate,
      upcomingAppointments: upcomingAppts,
    };
  }),

  update: protectedProcedure
    .input(updateOrganizationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.organization.update({
        where: { id: ctx.organizationId },
        data: input,
      });
    }),

  checkSlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const existing = await ctx.prisma.organization.findUnique({
        where: { slug: input.slug },
      });
      return { available: !existing };
    }),

  completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.prisma.organization.update({
      where: { id: ctx.organizationId },
      data: { onboardingCompleted: true },
    });
  }),

  morningBriefing: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const tomorrowEnd = new Date(todayStart.getTime() + 2 * 86400000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);

    const [
      todayAppts,
      tomorrowAppts,
      weekAppts,
      cancellations24h,
      waitlistEntries,
      pendingAppts,
      staffMembers,
    ] = await Promise.all([
      ctx.prisma.appointment.findMany({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: todayStart, lt: todayEnd },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        orderBy: { startTime: "asc" },
        include: { client: true, service: true, staffMember: true },
      }),
      ctx.prisma.appointment.findMany({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: todayEnd, lt: tomorrowEnd },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        orderBy: { startTime: "asc" },
        include: { client: true, service: true, staffMember: true },
      }),
      ctx.prisma.appointment.count({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: todayStart, lt: weekEnd },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
      }),
      ctx.prisma.appointment.findMany({
        where: {
          organizationId: ctx.organizationId,
          updatedAt: { gte: new Date(now.getTime() - 86400000) },
          status: "CANCELLED",
        },
        include: { client: true, service: true, staffMember: true },
      }),
      ctx.prisma.waitlistEntry.count({
        where: {
          organizationId: ctx.organizationId,
          status: "WAITING",
        },
      }),
      ctx.prisma.appointment.count({
        where: {
          organizationId: ctx.organizationId,
          startTime: { gte: todayStart },
          status: "PENDING",
        },
      }),
      ctx.prisma.staffMember.findMany({
        where: { organizationId: ctx.organizationId, isActive: true },
        include: {
          schedules: true,
          scheduleOverrides: {
            where: { date: { gte: todayStart, lt: todayEnd } },
          },
        },
      }),
    ]);

    const todayRevenue = todayAppts.reduce(
      (sum, a) => sum + Number(a.service.price),
      0
    );

    const gaps: Array<{ staffName: string; time: string }> = [];
    for (const member of staffMembers) {
      const isBlocked = member.scheduleOverrides.some((o) => !o.isAvailable);
      if (isBlocked) continue;

      const daySchedule = member.schedules.find(
        (s) => s.dayOfWeek === now.getDay() && s.isAvailable
      );
      if (!daySchedule) continue;

      const staffAppts = todayAppts
        .filter((a) => a.staffMember.id === member.id)
        .sort(
          (a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

      const [startH, startM] = daySchedule.startTime.split(":").map(Number);
      const [endH, endM] = daySchedule.endTime.split(":").map(Number);
      let cursor = startH * 60 + startM;
      const dayEnd = endH * 60 + endM;

      for (const appt of staffAppts) {
        const apptStart =
          new Date(appt.startTime).getHours() * 60 +
          new Date(appt.startTime).getMinutes();
        if (apptStart - cursor >= 60) {
          const gh = Math.floor(cursor / 60);
          const gm = cursor % 60;
          gaps.push({
            staffName: member.displayName.split(" ")[0],
            time: `${gh > 12 ? gh - 12 : gh}:${String(gm).padStart(2, "0")} ${gh >= 12 ? "PM" : "AM"}`,
          });
        }
        cursor = Math.max(
          cursor,
          apptStart + appt.service.durationMinutes
        );
      }
      if (dayEnd - cursor >= 60) {
        const gh = Math.floor(cursor / 60);
        const gm = cursor % 60;
        gaps.push({
          staffName: member.displayName.split(" ")[0],
          time: `${gh > 12 ? gh - 12 : gh}:${String(gm).padStart(2, "0")} ${gh >= 12 ? "PM" : "AM"}`,
        });
      }
    }

    const staffOnLeave = staffMembers
      .filter((m) => m.scheduleOverrides.some((o) => !o.isAvailable))
      .map((m) => m.displayName);

    return {
      greeting: getGreeting(),
      todayCount: todayAppts.length,
      tomorrowCount: tomorrowAppts.length,
      weekCount: weekAppts,
      todayRevenue,
      recentCancellations: cancellations24h.map((c) => ({
        clientName: `${c.client.firstName} ${c.client.lastName ?? ""}`.trim(),
        serviceName: c.service.name,
        staffName: c.staffMember.displayName,
        time: c.startTime,
      })),
      waitlistCount: waitlistEntries,
      pendingCount: pendingAppts,
      gaps: gaps.slice(0, 5),
      staffOnLeave,
      firstAppt: todayAppts[0]
        ? {
            clientName: `${todayAppts[0].client.firstName} ${todayAppts[0].client.lastName ?? ""}`.trim(),
            serviceName: todayAppts[0].service.name,
            time: todayAppts[0].startTime,
            staffName: todayAppts[0].staffMember.displayName,
          }
        : null,
      lastAppt: todayAppts.length > 0
        ? {
            time: todayAppts[todayAppts.length - 1].endTime,
          }
        : null,
    };
  }),
});

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
