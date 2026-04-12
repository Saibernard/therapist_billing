import { prisma } from "@bookai/db";

interface TimeRange {
  startTime: Date;
  endTime: Date;
}

export function hasConflict(newSlot: TimeRange, existing: TimeRange[]): boolean {
  return existing.some(
    (appt) => newSlot.startTime < appt.endTime && newSlot.endTime > appt.startTime
  );
}

/**
 * Detect scheduling conflicts for a staff member.
 * For group/class services (maxCapacity > 1), allows multiple bookings
 * in the same slot up to the service's capacity.
 */
export async function detectConflicts(
  staffMemberId: string,
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: string,
  options?: { serviceId?: string; maxCapacity?: number }
) {
  const where: Record<string, unknown> = {
    staffMemberId,
    status: { in: ["CONFIRMED", "PENDING"] },
    startTime: { lt: endTime },
    endTime: { gt: startTime },
  };

  if (excludeAppointmentId) {
    where.id = { not: excludeAppointmentId };
  }

  const conflicts = await prisma.appointment.findMany({ where });

  // If this is a group service, check capacity instead of raw conflict count
  if (options?.serviceId && options?.maxCapacity && options.maxCapacity > 1) {
    // Count only conflicts for the same service in the same time slot
    const sameServiceConflicts = conflicts.filter(
      (c) => c.serviceId === options.serviceId
    );

    return {
      hasConflict: sameServiceConflicts.length >= options.maxCapacity,
      conflicts: sameServiceConflicts,
      spotsRemaining: options.maxCapacity - sameServiceConflicts.length,
      isGroupService: true,
    };
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    spotsRemaining: conflicts.length > 0 ? 0 : 1,
    isGroupService: false,
  };
}
