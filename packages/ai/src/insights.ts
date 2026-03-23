import { prisma } from "@bookai/db";
import {
  startOfDay,
  endOfDay,
  addDays,
  subDays,
  subWeeks,
  startOfWeek,
  endOfWeek,
  format,
  getDay,
  differenceInDays,
} from "date-fns";

// ── Types ──────────────────────────────────────────────────────────

export type InsightPriority = "urgent" | "high" | "medium" | "low";
export type InsightCategory =
  | "revenue"
  | "retention"
  | "scheduling"
  | "growth"
  | "operations";

export interface Insight {
  id: string;
  category: InsightCategory;
  priority: InsightPriority;
  title: string;
  description: string;
  impact: string;
  actionLabel?: string;
  actionPayload?: Record<string, unknown>;
  metric?: { label: string; value: string; trend?: "up" | "down" | "flat" };
}

export interface RevenueSnapshot {
  thisWeek: number;
  lastWeek: number;
  thisMonth: number;
  lastMonth: number;
  projected: number;
  perSlotAvg: number;
}

export interface CoachSummary {
  greeting: string;
  insights: Insight[];
  revenue: RevenueSnapshot;
  weeklyUtilization: number;
  atRiskClients: Array<{
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    daysSinceLastVisit: number;
    totalVisits: number;
    totalSpent: number;
    preferredService: string | null;
  }>;
  emptySlots: Array<{
    date: string;
    dayName: string;
    staffName: string;
    staffId: string;
    openHours: number;
    bookedHours: number;
  }>;
  topServices: Array<{
    name: string;
    bookings: number;
    revenue: number;
    trend: "up" | "down" | "flat";
  }>;
  peakAnalysis: {
    busiestDay: string;
    busiestHour: string;
    quietestDay: string;
    quietestHour: string;
    saturdayDemandMultiplier: number | null;
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function dayName(dayIndex: number): string {
  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][dayIndex];
}

function hourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

// ── Main Engine ────────────────────────────────────────────────────

export async function generateCoachInsights(
  organizationId: string
): Promise<CoachSummary> {
  const now = new Date();
  const today = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = subWeeks(weekStart, 1);
  const lastWeekEnd = subDays(weekStart, 1);
  const thirtyDaysAgo = subDays(now, 30);
  const sixtyDaysAgo = subDays(now, 60);
  const next7Days = addDays(today, 7);

  // ── Parallel data fetching ───────────────────────────────────────

  const [
    org,
    thisWeekAppts,
    lastWeekAppts,
    last30Appts,
    prev30Appts,
    allClients,
    staffMembers,
    services,
    staffSchedules,
  ] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    }),
    prisma.appointment.findMany({
      where: {
        organizationId,
        startTime: { gte: weekStart, lte: weekEnd },
        status: { not: "CANCELLED" },
      },
      include: { service: true, staffMember: true, client: true },
    }),
    prisma.appointment.findMany({
      where: {
        organizationId,
        startTime: { gte: lastWeekStart, lte: endOfDay(lastWeekEnd) },
        status: { not: "CANCELLED" },
      },
      include: { service: true },
    }),
    prisma.appointment.findMany({
      where: {
        organizationId,
        startTime: { gte: thirtyDaysAgo },
        status: { not: "CANCELLED" },
      },
      include: { service: true, client: true, staffMember: true },
    }),
    prisma.appointment.findMany({
      where: {
        organizationId,
        startTime: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        status: { not: "CANCELLED" },
      },
      include: { service: true },
    }),
    prisma.client.findMany({
      where: { organizationId },
      include: {
        appointments: {
          orderBy: { startTime: "desc" },
          take: 1,
          include: { service: true },
        },
      },
    }),
    prisma.staffMember.findMany({
      where: { organizationId, isActive: true },
    }),
    prisma.service.findMany({
      where: { organizationId, isActive: true },
    }),
    prisma.staffSchedule.findMany({
      where: {
        staffMember: { organizationId, isActive: true },
        isAvailable: true,
      },
      include: { staffMember: true },
    }),
  ]);

  // Upcoming appointments for the next 7 days (for empty slot analysis)
  const next7Appts = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: today, lte: next7Days },
      status: { in: ["CONFIRMED", "PENDING"] },
    },
    include: { staffMember: true, service: true },
  });

  // ── Revenue Calculations ─────────────────────────────────────────

  const sumRevenue = (
    appts: Array<{ service: { price: { toNumber?: () => number } | number } }>
  ) =>
    appts.reduce((sum, a) => {
      const p = a.service.price;
      return sum + (typeof p === "number" ? p : Number(p));
    }, 0);

  const thisWeekRevenue = sumRevenue(thisWeekAppts);
  const lastWeekRevenue = sumRevenue(lastWeekAppts);
  const thisMonthRevenue = sumRevenue(last30Appts);
  const lastMonthRevenue = sumRevenue(prev30Appts);

  const dayOfWeek = getDay(now);
  const daysIntoWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
  const projectedWeekRevenue =
    daysIntoWeek > 0
      ? Math.round((thisWeekRevenue / daysIntoWeek) * 7)
      : thisWeekRevenue;

  const avgRevenuePerSlot =
    last30Appts.length > 0 ? thisMonthRevenue / last30Appts.length : 0;

  // ── Utilization (booked hours / available hours this week) ───────

  let totalAvailableMinutes = 0;
  for (const sched of staffSchedules) {
    const [sh, sm] = sched.startTime.split(":").map(Number);
    const [eh, em] = sched.endTime.split(":").map(Number);
    totalAvailableMinutes += eh * 60 + em - (sh * 60 + sm);
  }
  const totalBookedMinutes = thisWeekAppts.reduce(
    (sum, a) => sum + a.service.durationMinutes,
    0
  );
  const weeklyUtilization =
    totalAvailableMinutes > 0
      ? Math.round((totalBookedMinutes / totalAvailableMinutes) * 100)
      : 0;

  // ── At-Risk Clients (no visit in 21+ days, had at least 2 visits) ─

  const atRiskClients = allClients
    .filter((c) => {
      if (c.totalVisits < 2) return false;
      const lastAppt = c.appointments[0];
      if (!lastAppt) return false;
      return differenceInDays(now, lastAppt.startTime) >= 21;
    })
    .map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      daysSinceLastVisit: differenceInDays(now, c.appointments[0].startTime),
      totalVisits: c.totalVisits,
      totalSpent: Number(c.totalSpent),
      preferredService: c.appointments[0]?.service?.name ?? null,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10);

  // ── Empty Slot Analysis (next 7 days) ────────────────────────────

  const emptySlots: CoachSummary["emptySlots"] = [];

  for (let d = 0; d < 7; d++) {
    const date = addDays(today, d);
    const dow = getDay(date);

    for (const staff of staffMembers) {
      const schedule = staffSchedules.find(
        (s) => s.staffMemberId === staff.id && s.dayOfWeek === dow
      );
      if (!schedule) continue;

      const [sh, sm] = schedule.startTime.split(":").map(Number);
      const [eh, em] = schedule.endTime.split(":").map(Number);
      const availMins = eh * 60 + em - (sh * 60 + sm);

      const dayAppts = next7Appts.filter(
        (a) =>
          a.staffMemberId === staff.id &&
          format(a.startTime, "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
      );
      const bookedMins = dayAppts.reduce(
        (s, a) => s + a.service.durationMinutes,
        0
      );

      if (bookedMins < availMins * 0.5) {
        emptySlots.push({
          date: format(date, "yyyy-MM-dd"),
          dayName: format(date, "EEEE"),
          staffName: staff.displayName,
          staffId: staff.id,
          openHours: Math.round(((availMins - bookedMins) / 60) * 10) / 10,
          bookedHours: Math.round((bookedMins / 60) * 10) / 10,
        });
      }
    }
  }

  // ── Top Services ─────────────────────────────────────────────────

  const serviceMap = new Map<
    string,
    { name: string; current: number; previous: number; revenue: number }
  >();
  for (const svc of services) {
    serviceMap.set(svc.id, {
      name: svc.name,
      current: 0,
      previous: 0,
      revenue: 0,
    });
  }
  for (const a of last30Appts) {
    const entry = serviceMap.get(a.serviceId);
    if (entry) {
      entry.current++;
      entry.revenue += Number(a.service.price);
    }
  }
  for (const a of prev30Appts) {
    const entry = serviceMap.get(a.serviceId);
    if (entry) entry.previous++;
  }

  const topServices = [...serviceMap.values()]
    .filter((s) => s.current > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((s) => ({
      name: s.name,
      bookings: s.current,
      revenue: Math.round(s.revenue),
      trend: (s.current > s.previous
        ? "up"
        : s.current < s.previous
          ? "down"
          : "flat") as "up" | "down" | "flat",
    }));

  // ── Peak Analysis ────────────────────────────────────────────────

  const dayBuckets = new Array(7).fill(0);
  const hourBuckets = new Array(24).fill(0);
  for (const a of last30Appts) {
    dayBuckets[getDay(a.startTime)]++;
    hourBuckets[a.startTime.getHours()]++;
  }

  const maxDay = dayBuckets.indexOf(Math.max(...dayBuckets));
  const minDay = dayBuckets.indexOf(
    Math.min(...dayBuckets.filter((v) => v > 0).concat([0]))
  );
  const activeHours = hourBuckets
    .map((v, i) => ({ v, i }))
    .filter((h) => h.v > 0);
  const maxHour =
    activeHours.length > 0
      ? activeHours.reduce((a, b) => (b.v > a.v ? b : a)).i
      : 9;
  const minHour =
    activeHours.length > 0
      ? activeHours.reduce((a, b) => (b.v < a.v ? b : a)).i
      : 9;

  const avgWeekday =
    dayBuckets.slice(1, 6).reduce((a, b) => a + b, 0) / 5 || 1;
  const saturdayDemandMultiplier =
    dayBuckets[6] > 0
      ? Math.round((dayBuckets[6] / avgWeekday) * 10) / 10
      : null;

  const peakAnalysis = {
    busiestDay: dayName(maxDay),
    busiestHour: hourLabel(maxHour),
    quietestDay: dayName(minDay),
    quietestHour: hourLabel(minHour),
    saturdayDemandMultiplier,
  };

  // ── Generate Insights ────────────────────────────────────────────

  const insights: Insight[] = [];

  // 1. Empty slots this week
  const totalOpenHours = emptySlots.reduce((s, e) => s + e.openHours, 0);
  if (totalOpenHours > 4) {
    const potentialRevenue = Math.round(totalOpenHours * avgRevenuePerSlot);
    insights.push({
      id: "empty-slots",
      category: "revenue",
      priority: "urgent",
      title: `${Math.round(totalOpenHours)} open hours this week`,
      description: `You have ${emptySlots.length} under-booked days in the next 7 days. That's potential revenue sitting on the table.`,
      impact: `~$${potentialRevenue.toLocaleString()} in potential revenue`,
      actionLabel: "Fill slots with offers",
      actionPayload: {
        type: "fill_empty_slots",
        slots: emptySlots.slice(0, 3),
      },
      metric: {
        label: "Open hours",
        value: `${Math.round(totalOpenHours)}h`,
        trend: "down",
      },
    });
  }

  // 2. At-risk clients (churn prevention)
  if (atRiskClients.length > 0) {
    const totalAtRiskRevenue = atRiskClients.reduce(
      (s, c) => s + c.totalSpent,
      0
    );
    insights.push({
      id: "at-risk-clients",
      category: "retention",
      priority: "high",
      title: `${atRiskClients.length} client${atRiskClients.length > 1 ? "s" : ""} going cold`,
      description: `${atRiskClients[0].firstName}${atRiskClients.length > 1 ? ` and ${atRiskClients.length - 1} others` : ""} haven't booked in ${atRiskClients[0].daysSinceLastVisit}+ days. They've spent $${totalAtRiskRevenue.toLocaleString()} total.`,
      impact: `$${totalAtRiskRevenue.toLocaleString()} in client lifetime value at risk`,
      actionLabel: "Send win-back messages",
      actionPayload: {
        type: "winback_campaign",
        clientIds: atRiskClients.map((c) => c.id),
      },
      metric: {
        label: "At risk",
        value: `${atRiskClients.length}`,
        trend: "down",
      },
    });
  }

  // 3. Revenue trend
  const revenueTrend =
    lastWeekRevenue > 0
      ? Math.round(
          ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100
        )
      : 0;
  if (revenueTrend < -10) {
    insights.push({
      id: "revenue-dip",
      category: "revenue",
      priority: "high",
      title: `Revenue down ${Math.abs(revenueTrend)}% vs last week`,
      description: `This week: $${thisWeekRevenue.toLocaleString()} vs last week: $${lastWeekRevenue.toLocaleString()}. Let's fix that before the week ends.`,
      impact: `$${Math.abs(thisWeekRevenue - lastWeekRevenue).toLocaleString()} gap to close`,
      actionLabel: "Boost this week",
      actionPayload: { type: "revenue_boost" },
      metric: {
        label: "This week",
        value: `$${thisWeekRevenue.toLocaleString()}`,
        trend: "down",
      },
    });
  } else if (revenueTrend > 15) {
    insights.push({
      id: "revenue-up",
      category: "revenue",
      priority: "low",
      title: `Revenue up ${revenueTrend}% vs last week`,
      description: `Great momentum! This week: $${thisWeekRevenue.toLocaleString()} vs last week: $${lastWeekRevenue.toLocaleString()}.`,
      impact: "Keep it going!",
      metric: {
        label: "This week",
        value: `$${thisWeekRevenue.toLocaleString()}`,
        trend: "up",
      },
    });
  }

  // 4. Saturday demand insight
  if (saturdayDemandMultiplier && saturdayDemandMultiplier > 1.5) {
    const satSchedules = staffSchedules.filter((s) => s.dayOfWeek === 6);
    if (satSchedules.length === 0) {
      insights.push({
        id: "saturday-opportunity",
        category: "growth",
        priority: "high",
        title: "High demand for Saturday — but you're closed",
        description: `Saturday booking requests are ${saturdayDemandMultiplier}x your weekday average, but you have no Saturday availability. Adding just 2 morning slots could generate ~$${Math.round(avgRevenuePerSlot * 2 * 4).toLocaleString()}/month.`,
        impact: `~$${Math.round(avgRevenuePerSlot * 2 * 4).toLocaleString()}/month new revenue`,
        actionLabel: "Add Saturday slots",
        actionPayload: { type: "add_saturday_slots" },
        metric: {
          label: "Demand multiplier",
          value: `${saturdayDemandMultiplier}x`,
          trend: "up",
        },
      });
    }
  }

  // 5. Utilization insight
  if (weeklyUtilization < 50 && last30Appts.length > 5) {
    insights.push({
      id: "low-utilization",
      category: "scheduling",
      priority: "medium",
      title: `Only ${weeklyUtilization}% of your time is booked`,
      description:
        "Your schedule is less than half full. Consider tightening your availability window or running a limited-time promotion to fill gaps.",
      impact: `${100 - weeklyUtilization}% of available time is going unfilled`,
      actionLabel: "Optimize schedule",
      actionPayload: { type: "optimize_schedule" },
      metric: {
        label: "Utilization",
        value: `${weeklyUtilization}%`,
        trend: weeklyUtilization < 40 ? "down" : "flat",
      },
    });
  } else if (weeklyUtilization > 90) {
    insights.push({
      id: "high-utilization",
      category: "growth",
      priority: "medium",
      title: `${weeklyUtilization}% utilization — you're nearly maxed out`,
      description:
        "You're almost fully booked. This is a good problem! Consider raising prices or adding availability to capture more revenue.",
      impact: "Potential to increase revenue per hour",
      actionLabel: "Review pricing",
      actionPayload: { type: "review_pricing" },
      metric: {
        label: "Utilization",
        value: `${weeklyUtilization}%`,
        trend: "up",
      },
    });
  }

  // 6. No-show pattern
  const noShows = last30Appts.filter((a) => a.status === "NO_SHOW");
  if (noShows.length >= 3) {
    const repeatOffenders = new Map<string, number>();
    for (const ns of noShows) {
      repeatOffenders.set(
        ns.clientId,
        (repeatOffenders.get(ns.clientId) ?? 0) + 1
      );
    }
    const worstOffender = [...repeatOffenders.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0];
    const offenderClient = allClients.find((c) => c.id === worstOffender?.[0]);

    insights.push({
      id: "no-show-pattern",
      category: "operations",
      priority: "medium",
      title: `${noShows.length} no-shows in the last 30 days`,
      description: offenderClient
        ? `${offenderClient.firstName} has no-showed ${worstOffender[1]} times. Consider requiring a deposit or sending stronger reminders.`
        : "Consider adding a cancellation policy or requiring deposits for certain clients.",
      impact: `~$${Math.round(noShows.length * avgRevenuePerSlot).toLocaleString()} in lost revenue`,
      actionLabel: "Enable deposits",
      actionPayload: { type: "enable_deposits" },
      metric: {
        label: "No-shows",
        value: `${noShows.length}`,
        trend: "down",
      },
    });
  }

  // 7. New client acquisition trend
  const newClientsLast30 = allClients.filter(
    (c) => differenceInDays(now, c.createdAt) <= 30
  ).length;
  const newClientsPrev30 = allClients.filter(
    (c) =>
      differenceInDays(now, c.createdAt) > 30 &&
      differenceInDays(now, c.createdAt) <= 60
  ).length;
  if (newClientsLast30 < newClientsPrev30 && newClientsPrev30 > 0) {
    insights.push({
      id: "client-acquisition-dip",
      category: "growth",
      priority: "medium",
      title: "New client signups slowing down",
      description: `${newClientsLast30} new clients this month vs ${newClientsPrev30} last month. Consider sharing your booking link more broadly or asking existing clients for referrals.`,
      impact: `${newClientsPrev30 - newClientsLast30} fewer new clients`,
      actionLabel: "Send referral requests",
      actionPayload: {
        type: "referral_campaign",
        targetClients: allClients
          .filter((c) => c.totalVisits >= 3)
          .slice(0, 10)
          .map((c) => c.id),
      },
      metric: {
        label: "New clients",
        value: `${newClientsLast30}`,
        trend: "down",
      },
    });
  }

  // Sort insights by priority
  const priorityOrder: Record<InsightPriority, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // ── Greeting ─────────────────────────────────────────────────────

  const hour = now.getHours();
  const timeOfDay =
    hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const orgName = org.name;

  let greeting: string;
  if (insights.length === 0) {
    greeting = `Good ${timeOfDay}! ${orgName} is looking healthy — no urgent actions needed right now.`;
  } else {
    const urgentCount = insights.filter(
      (i) => i.priority === "urgent" || i.priority === "high"
    ).length;
    if (urgentCount > 0) {
      greeting = `Good ${timeOfDay}! I've found ${urgentCount} thing${urgentCount > 1 ? "s" : ""} that need your attention this week.`;
    } else {
      greeting = `Good ${timeOfDay}! Here's what's happening at ${orgName} — a few opportunities to grow.`;
    }
  }

  return {
    greeting,
    insights,
    revenue: {
      thisWeek: Math.round(thisWeekRevenue),
      lastWeek: Math.round(lastWeekRevenue),
      thisMonth: Math.round(thisMonthRevenue),
      lastMonth: Math.round(lastMonthRevenue),
      projected: Math.round(projectedWeekRevenue),
      perSlotAvg: Math.round(avgRevenuePerSlot),
    },
    weeklyUtilization,
    atRiskClients,
    emptySlots: emptySlots.slice(0, 10),
    topServices,
    peakAnalysis,
  };
}
