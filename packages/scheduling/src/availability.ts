import { prisma } from "@bookai/db";
import {
  timeStringToMinutes,
  minutesToTimeString,
  addMinutesToTime,
} from "@bookai/utils";
import type { TimeSlot, AvailabilityQuery } from "@bookai/types";
import { startOfDay, endOfDay, getDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export async function getAvailableSlots(
  query: AvailabilityQuery
): Promise<TimeSlot[]> {
  const { organizationId, serviceId, staffMemberId, date, timezone } = query;

  const service = await prisma.service.findFirst({
    where: { id: serviceId, organizationId, isActive: true },
  });
  if (!service) return [];

  const totalDuration = service.durationMinutes + service.bufferMinutes;

  const staffFilter: Record<string, unknown> = {
    organizationId,
    isActive: true,
  };
  if (staffMemberId) staffFilter.id = staffMemberId;

  const staffMembers = await prisma.staffMember.findMany({
    where: {
      ...staffFilter,
      staffServices: { some: { serviceId } },
    },
    include: {
      schedules: true,
      scheduleOverrides: true,
    },
  });

  const targetDate = new Date(date);
  const dayOfWeek = getDay(toZonedTime(targetDate, timezone));

  const dayStart = startOfDay(toZonedTime(targetDate, timezone));
  const dayEnd = endOfDay(toZonedTime(targetDate, timezone));
  const utcStart = fromZonedTime(dayStart, timezone);
  const utcEnd = fromZonedTime(dayEnd, timezone);

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: utcStart },
      endTime: { lte: utcEnd },
      status: { in: ["CONFIRMED", "PENDING"] },
    },
  });

  const slots: TimeSlot[] = [];

  for (const staff of staffMembers) {
    const override = staff.scheduleOverrides.find(
      (o) => o.date.toISOString().split("T")[0] === date
    );

    if (override && !override.isAvailable) continue;

    const schedule = override
      ? { startTime: override.startTime!, endTime: override.endTime! }
      : staff.schedules.find(
          (s) => s.dayOfWeek === dayOfWeek && s.isAvailable
        );

    if (!schedule) continue;

    const scheduleStart = timeStringToMinutes(schedule.startTime);
    const scheduleEnd = timeStringToMinutes(schedule.endTime);

    const staffAppointments = existingAppointments
      .filter((a) => a.staffMemberId === staff.id)
      .map((a) => ({
        start: toZonedTime(a.startTime, timezone),
        end: toZonedTime(a.endTime, timezone),
      }));

    let currentMinute = scheduleStart;

    while (currentMinute + service.durationMinutes <= scheduleEnd) {
      const slotStart = minutesToTimeString(currentMinute);
      const slotEnd = addMinutesToTime(slotStart, service.durationMinutes);

      const slotStartDate = new Date(`${date}T${slotStart}:00`);
      const slotEndDate = new Date(`${date}T${slotEnd}:00`);

      const hasConflict = staffAppointments.some(
        (appt) => slotStartDate < appt.end && slotEndDate > appt.start
      );

      slots.push({
        startTime: slotStart,
        endTime: slotEnd,
        staffMemberId: staff.id,
        staffName: staff.displayName,
        available: !hasConflict,
      });

      currentMinute += 30; // 30-minute slot intervals
    }
  }

  return slots.filter((s) => s.available);
}
