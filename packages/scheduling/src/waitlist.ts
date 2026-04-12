import { prisma } from "@bookai/db";
import { getAvailableSlots } from "./availability";
import { createAppointment } from "./engine";

interface WaitlistCheckResult {
  notified: number;
  autoBooked: number;
}

/**
 * When an appointment is cancelled, check the waitlist for matching entries.
 * For auto-book entries: immediately book the slot if available.
 * For notify entries: mark as notified (actual notification sent by caller).
 */
export async function checkWaitlistOnCancellation(
  organizationId: string,
  serviceId: string,
  staffMemberId: string,
  cancelledDate: Date
): Promise<WaitlistCheckResult> {
  const dateStr = cancelledDate.toISOString().split("T")[0];

  // Find matching waitlist entries that are still waiting
  const entries = await prisma.waitlistEntry.findMany({
    where: {
      organizationId,
      serviceId,
      status: "WAITING",
      preferredDate: {
        gte: new Date(dateStr),
        lt: new Date(new Date(dateStr).getTime() + 24 * 60 * 60 * 1000),
      },
      OR: [
        { staffMemberId },
        { staffMemberId: null }, // entries with no staff preference
      ],
    },
    include: { client: true, service: true },
    orderBy: { createdAt: "asc" }, // FIFO
  });

  let notified = 0;
  let autoBooked = 0;

  for (const entry of entries) {
    // Check if slot is still available
    // Look up org timezone for availability check
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { timezone: true },
    });

    const slots = await getAvailableSlots({
      organizationId,
      serviceId: entry.serviceId,
      date: dateStr,
      staffMemberId,
      timezone: org.timezone,
    });

    const availableSlots = slots.filter((s) => s.available);
    if (availableSlots.length === 0) break; // No more slots

    if (entry.autoBook) {
      // Auto-book: pick the first available slot
      try {
        await createAppointment({
          organizationId,
          clientId: entry.clientId,
          serviceId: entry.serviceId,
          staffMemberId,
          startTime: new Date(availableSlots[0].startTime),
          source: "AI_CHAT",
        });

        await prisma.waitlistEntry.update({
          where: { id: entry.id },
          data: { status: "BOOKED" },
        });

        autoBooked++;
      } catch {
        // Conflict or error, skip to next
        continue;
      }
    } else {
      // Notify: mark as notified, set 24h expiry
      await prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: {
          status: "NOTIFIED",
          notifiedAt: new Date(),
          notificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      notified++;
    }
  }

  return { notified, autoBooked };
}

/**
 * Expire notifications that have passed their expiry time.
 * Called by a cron job to clean up unresponsive waitlist entries.
 */
export async function expireWaitlistNotifications(): Promise<number> {
  const result = await prisma.waitlistEntry.updateMany({
    where: {
      status: "NOTIFIED",
      notificationExpiry: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });

  return result.count;
}
