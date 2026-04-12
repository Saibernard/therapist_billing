import { prisma } from "@bookai/db";
import type { RecurrenceFrequency } from "@prisma/client";
import { addWeeks, addMonths, setDay, setDate, startOfDay } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { detectConflicts } from "./conflicts";

interface RecurrenceRuleData {
  id: string;
  organizationId: string;
  clientId: string;
  serviceId: string;
  staffMemberId: string;
  frequency: RecurrenceFrequency;
  intervalWeeks: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  preferredTime: string;
  startDate: Date;
  endDate: Date | null;
  maxOccurrences: number | null;
  isActive: boolean;
}

interface GenerateOptions {
  weeksAhead?: number;
  timezone?: string;
}

export function generateOccurrenceDates(
  rule: RecurrenceRuleData,
  options: GenerateOptions = {}
): Date[] {
  const { weeksAhead = 6, timezone = "America/New_York" } = options;
  const dates: Date[] = [];
  const now = new Date();
  const horizon = addWeeks(now, weeksAhead);
  const [hours, minutes] = rule.preferredTime.split(":").map(Number);

  let cursor = new Date(rule.startDate);
  let count = 0;

  while (cursor <= horizon) {
    if (cursor >= now && (!rule.endDate || cursor <= rule.endDate)) {
      if (!rule.maxOccurrences || count < rule.maxOccurrences) {
        const occurrence = startOfDay(cursor);
        occurrence.setHours(hours, minutes, 0, 0);
        const utcTime = fromZonedTime(occurrence, timezone);
        dates.push(utcTime);
        count++;
      } else {
        break;
      }
    }

    switch (rule.frequency) {
      case "WEEKLY":
        cursor = addWeeks(cursor, 1);
        break;
      case "BIWEEKLY":
        cursor = addWeeks(cursor, 2);
        break;
      case "MONTHLY":
        cursor = addMonths(cursor, 1);
        if (rule.dayOfMonth) {
          cursor = setDate(cursor, Math.min(rule.dayOfMonth, 28));
        }
        break;
      case "CUSTOM":
        cursor = addWeeks(cursor, rule.intervalWeeks);
        break;
    }
  }

  return dates;
}

export async function createRecurringSeries(
  ruleId: string,
  options: GenerateOptions = {}
) {
  const rule = await prisma.recurrenceRule.findUniqueOrThrow({
    where: { id: ruleId },
    include: {
      service: true,
      organization: true,
    },
  });

  const timezone = rule.organization.timezone;
  const dates = generateOccurrenceDates(rule, { ...options, timezone });

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      recurrenceRuleId: ruleId,
      status: { in: ["CONFIRMED", "PENDING"] },
    },
    select: { startTime: true },
  });

  const existingTimes = new Set(
    existingAppointments.map((a) => a.startTime.toISOString())
  );

  const created: string[] = [];
  const skipped: Array<{ date: Date; reason: string }> = [];

  for (const date of dates) {
    if (existingTimes.has(date.toISOString())) {
      skipped.push({ date, reason: "already exists" });
      continue;
    }

    const endTime = new Date(
      date.getTime() + rule.service.durationMinutes * 60 * 1000
    );

    const { hasConflict } = await detectConflicts(
      rule.staffMemberId,
      date,
      endTime
    );

    if (hasConflict) {
      skipped.push({ date, reason: "time slot conflict" });
      continue;
    }

    const appointment = await prisma.appointment.create({
      data: {
        organizationId: rule.organizationId,
        clientId: rule.clientId,
        serviceId: rule.serviceId,
        staffMemberId: rule.staffMemberId,
        startTime: date,
        endTime,
        status: "CONFIRMED",
        source: "AI_CHAT",
        recurrenceRuleId: ruleId,
      },
    });

    created.push(appointment.id);
  }

  return { created, skipped };
}

export async function cancelSeries(
  ruleId: string,
  scope: "this" | "future" | "all",
  fromAppointmentId?: string
) {
  const rule = await prisma.recurrenceRule.findUniqueOrThrow({
    where: { id: ruleId },
  });

  if (scope === "all") {
    await prisma.appointment.updateMany({
      where: {
        recurrenceRuleId: ruleId,
        status: { in: ["CONFIRMED", "PENDING"] },
      },
      data: {
        status: "CANCELLED",
        cancellationReason: "Recurring series cancelled",
      },
    });

    await prisma.recurrenceRule.update({
      where: { id: ruleId },
      data: { isActive: false },
    });

    return { cancelled: "all" };
  }

  if (scope === "this" && fromAppointmentId) {
    await prisma.appointment.update({
      where: { id: fromAppointmentId },
      data: {
        status: "CANCELLED",
        cancellationReason: "Single occurrence cancelled",
        recurrenceRuleId: null,
      },
    });

    return { cancelled: "single" };
  }

  if (scope === "future" && fromAppointmentId) {
    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: fromAppointmentId },
    });

    await prisma.appointment.updateMany({
      where: {
        recurrenceRuleId: ruleId,
        startTime: { gte: appointment.startTime },
        status: { in: ["CONFIRMED", "PENDING"] },
      },
      data: {
        status: "CANCELLED",
        cancellationReason: "Future recurring appointments cancelled",
      },
    });

    await prisma.recurrenceRule.update({
      where: { id: ruleId },
      data: { endDate: appointment.startTime },
    });

    return { cancelled: "future" };
  }

  return { cancelled: "none" };
}

export async function generateUpcomingRecurring(weeksAhead = 6) {
  const activeRules = await prisma.recurrenceRule.findMany({
    where: { isActive: true },
  });

  const results: Array<{ ruleId: string; created: number; skipped: number }> = [];

  for (const rule of activeRules) {
    const { created, skipped } = await createRecurringSeries(rule.id, { weeksAhead });
    results.push({
      ruleId: rule.id,
      created: created.length,
      skipped: skipped.length,
    });
  }

  return results;
}
