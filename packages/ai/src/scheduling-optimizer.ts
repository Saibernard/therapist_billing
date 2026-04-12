import { prisma } from "@bookai/db";

interface GapAnalysis {
  staffName: string;
  staffMemberId: string;
  date: string;
  gaps: Array<{
    start: string;
    end: string;
    durationMinutes: number;
  }>;
  totalGapMinutes: number;
  utilizationPercent: number;
}

interface OptimizationSuggestion {
  type: "fill_gap" | "redistribute" | "extend_hours" | "reduce_hours";
  priority: "high" | "medium" | "low";
  description: string;
  staffMemberId?: string;
  suggestedAction?: string;
}

interface ScheduleOptimizationReport {
  date: string;
  staffGaps: GapAnalysis[];
  suggestions: OptimizationSuggestion[];
  peakHours: Array<{ hour: number; count: number }>;
  averageUtilization: number;
}

/**
 * Analyze gaps in a staff member's schedule for a given date.
 */
async function analyzeStaffGaps(
  organizationId: string,
  staffMemberId: string,
  date: string
): Promise<GapAnalysis> {
  const staff = await prisma.staffMember.findUniqueOrThrow({
    where: { id: staffMemberId },
    include: { schedules: true },
  });

  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd = new Date(`${date}T23:59:59Z`);
  const dayOfWeek = dayStart.getDay();

  const schedule = staff.schedules.find(
    (s) => s.dayOfWeek === dayOfWeek && s.isAvailable
  );

  if (!schedule) {
    return {
      staffName: staff.displayName,
      staffMemberId,
      date,
      gaps: [],
      totalGapMinutes: 0,
      utilizationPercent: 0,
    };
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      staffMemberId,
      organizationId,
      startTime: { gte: dayStart, lte: dayEnd },
      status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
    },
    orderBy: { startTime: "asc" },
  });

  // Parse working hours
  const [startH, startM] = schedule.startTime.split(":").map(Number);
  const [endH, endM] = schedule.endTime.split(":").map(Number);
  const workStart = new Date(`${date}T00:00:00Z`);
  workStart.setUTCHours(startH!, startM);
  const workEnd = new Date(`${date}T00:00:00Z`);
  workEnd.setUTCHours(endH!, endM);

  const totalWorkMinutes =
    (workEnd.getTime() - workStart.getTime()) / 60000;

  // Find gaps between appointments
  const gaps: GapAnalysis["gaps"] = [];
  let current = workStart.getTime();
  let busyMinutes = 0;

  for (const appt of appointments) {
    const apptStart = appt.startTime.getTime();
    const apptEnd = appt.endTime.getTime();

    if (apptStart > current) {
      const gapMin = (apptStart - current) / 60000;
      if (gapMin >= 15) {
        // Only count gaps >= 15 min
        gaps.push({
          start: new Date(current).toISOString(),
          end: new Date(apptStart).toISOString(),
          durationMinutes: Math.round(gapMin),
        });
      }
    }
    busyMinutes += (apptEnd - Math.max(apptStart, current)) / 60000;
    current = Math.max(current, apptEnd);
  }

  // Gap after last appointment until work end
  if (current < workEnd.getTime()) {
    const gapMin = (workEnd.getTime() - current) / 60000;
    if (gapMin >= 15) {
      gaps.push({
        start: new Date(current).toISOString(),
        end: workEnd.toISOString(),
        durationMinutes: Math.round(gapMin),
      });
    }
  }

  const totalGapMinutes = gaps.reduce((s, g) => s + g.durationMinutes, 0);
  const utilization =
    totalWorkMinutes > 0
      ? Math.round((busyMinutes / totalWorkMinutes) * 100)
      : 0;

  return {
    staffName: staff.displayName,
    staffMemberId,
    date,
    gaps,
    totalGapMinutes,
    utilizationPercent: Math.min(100, utilization),
  };
}

/**
 * Analyze booking patterns to find peak hours.
 */
async function analyzePeakHours(
  organizationId: string,
  daysBack: number = 30
): Promise<Array<{ hour: number; count: number }>> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: since },
      status: { in: ["CONFIRMED", "COMPLETED"] },
    },
    select: { startTime: true },
  });

  const hourCounts: Record<number, number> = {};
  for (const appt of appointments) {
    const hour = appt.startTime.getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }

  return Object.entries(hourCounts)
    .map(([h, c]) => ({ hour: Number(h), count: c }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Generate a full schedule optimization report for a date.
 */
export async function generateOptimizationReport(
  organizationId: string,
  date: string
): Promise<ScheduleOptimizationReport> {
  const activeStaff = await prisma.staffMember.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, displayName: true },
  });

  // Analyze gaps for all staff
  const staffGaps: GapAnalysis[] = [];
  for (const s of activeStaff) {
    const gap = await analyzeStaffGaps(organizationId, s.id, date);
    if (gap.utilizationPercent > 0 || gap.gaps.length > 0) {
      staffGaps.push(gap);
    }
  }

  const peakHours = await analyzePeakHours(organizationId);
  const avgUtilization =
    staffGaps.length > 0
      ? Math.round(
          staffGaps.reduce((s, g) => s + g.utilizationPercent, 0) /
            staffGaps.length
        )
      : 0;

  // Generate suggestions
  const suggestions: OptimizationSuggestion[] = [];

  // Identify staff with large gaps
  for (const gap of staffGaps) {
    if (gap.totalGapMinutes >= 120) {
      suggestions.push({
        type: "fill_gap",
        priority: "high",
        description: `${gap.staffName} has ${gap.totalGapMinutes} minutes of idle time. Consider filling gaps with walk-in appointments or administrative tasks.`,
        staffMemberId: gap.staffMemberId,
        suggestedAction: `Block ${gap.gaps.length} gap(s) or promote open slots to fill them.`,
      });
    } else if (gap.totalGapMinutes >= 60) {
      suggestions.push({
        type: "fill_gap",
        priority: "medium",
        description: `${gap.staffName} has a ${gap.totalGapMinutes}-minute gap that could be filled.`,
        staffMemberId: gap.staffMemberId,
      });
    }
  }

  // Identify redistribution opportunities
  const overloaded = staffGaps.filter((g) => g.utilizationPercent >= 90);
  const underloaded = staffGaps.filter(
    (g) => g.utilizationPercent > 0 && g.utilizationPercent < 40
  );

  if (overloaded.length > 0 && underloaded.length > 0) {
    suggestions.push({
      type: "redistribute",
      priority: "high",
      description: `${overloaded.map((s) => s.staffName).join(", ")} ${overloaded.length === 1 ? "is" : "are"} overloaded (90%+ utilization) while ${underloaded.map((s) => s.staffName).join(", ")} ${underloaded.length === 1 ? "has" : "have"} low utilization. Consider redistributing appointments.`,
    });
  }

  // Peak hour alignment
  if (peakHours.length > 0) {
    const topPeakHour = peakHours[0].hour;
    const lowStaffAtPeak = staffGaps.filter((g) =>
      g.gaps.some((gap) => {
        const gapHour = new Date(gap.start).getHours();
        return gapHour <= topPeakHour && new Date(gap.end).getHours() >= topPeakHour;
      })
    );

    if (lowStaffAtPeak.length > 0) {
      suggestions.push({
        type: "extend_hours",
        priority: "medium",
        description: `Peak booking hour is ${topPeakHour > 12 ? topPeakHour - 12 : topPeakHour}${topPeakHour >= 12 ? "pm" : "am"}, but ${lowStaffAtPeak.length} staff member(s) have gaps during this time. Ensure coverage during peak hours.`,
      });
    }
  }

  // Low utilization day suggestion
  if (avgUtilization < 30 && staffGaps.length > 1) {
    suggestions.push({
      type: "reduce_hours",
      priority: "low",
      description: `Average utilization is only ${avgUtilization}%. Consider reducing staff or hours on this day to cut overhead.`,
    });
  }

  return {
    date,
    staffGaps,
    suggestions,
    peakHours: peakHours.slice(0, 5),
    averageUtilization: avgUtilization,
  };
}

/**
 * Get a quick utilization summary for a date range.
 */
export async function getUtilizationSummary(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<
  Array<{
    date: string;
    averageUtilization: number;
    totalAppointments: number;
    totalGapMinutes: number;
  }>
> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const results = [];

  const current = new Date(start);
  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0]!;

    const appointments = await prisma.appointment.count({
      where: {
        organizationId,
        startTime: {
          gte: new Date(`${dateStr}T00:00:00Z`),
          lte: new Date(`${dateStr}T23:59:59Z`),
        },
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
      },
    });

    // Quick utilization estimate based on appointments vs staff
    const activeStaff = await prisma.staffMember.count({
      where: { organizationId, isActive: true },
    });

    // Assume 8-hour day, 30-min avg appointment
    const capacity = activeStaff * 16; // ~16 slots per staff per day
    const utilization =
      capacity > 0 ? Math.min(100, Math.round((appointments / capacity) * 100)) : 0;

    results.push({
      date: dateStr,
      averageUtilization: utilization,
      totalAppointments: appointments,
      totalGapMinutes: 0, // Detailed gap analysis is expensive, skip for summary
    });

    current.setDate(current.getDate() + 1);
  }

  return results;
}
