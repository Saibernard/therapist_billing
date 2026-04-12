import { prisma } from "@bookai/db";

interface NoShowScore {
  appointmentId: string;
  risk: number; // 0–100
  factors: string[];
}

/**
 * Score a single appointment for no-show risk based on client history,
 * day-of-week patterns, time-of-day patterns, lead time, and recency.
 */
export async function scoreAppointment(
  appointmentId: string
): Promise<NoShowScore> {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { client: true, service: true },
  });

  const factors: string[] = [];
  let score = 0;

  const client = appointment.client;

  // 1. Client no-show history (heaviest signal)
  const noShowRate =
    client.totalVisits > 0
      ? client.noShowCount / (client.totalVisits + client.noShowCount)
      : 0;

  if (noShowRate > 0.3) {
    score += 35;
    factors.push(`High no-show history (${Math.round(noShowRate * 100)}%)`);
  } else if (noShowRate > 0.15) {
    score += 20;
    factors.push(`Moderate no-show history (${Math.round(noShowRate * 100)}%)`);
  } else if (client.noShowCount > 0) {
    score += 8;
    factors.push(`${client.noShowCount} prior no-show(s)`);
  }

  // 2. New client (no visit history = higher risk)
  if (client.totalVisits === 0) {
    score += 15;
    factors.push("First-time client");
  }

  // 3. Day-of-week pattern — Mondays and Fridays tend to have higher no-shows
  const dayOfWeek = appointment.startTime.getDay();
  if (dayOfWeek === 1) {
    score += 5;
    factors.push("Monday appointment");
  } else if (dayOfWeek === 5) {
    score += 5;
    factors.push("Friday appointment");
  }

  // 4. Time-of-day — very early or very late slots see more no-shows
  const hour = appointment.startTime.getHours();
  if (hour < 9) {
    score += 8;
    factors.push("Early morning slot");
  } else if (hour >= 18) {
    score += 5;
    factors.push("Evening slot");
  }

  // 5. Lead time — appointments booked far in advance have higher no-show risk
  const leadDays =
    (appointment.startTime.getTime() - appointment.createdAt.getTime()) /
    (1000 * 60 * 60 * 24);
  if (leadDays > 14) {
    score += 10;
    factors.push(`Booked ${Math.round(leadDays)} days in advance`);
  } else if (leadDays > 7) {
    score += 5;
    factors.push(`Booked ${Math.round(leadDays)} days in advance`);
  }

  // 6. Recency — client hasn't visited in a while
  if (client.lastVisitAt) {
    const daysSinceVisit =
      (Date.now() - client.lastVisitAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceVisit > 90) {
      score += 10;
      factors.push(`Last visit ${Math.round(daysSinceVisit)} days ago`);
    } else if (daysSinceVisit > 30) {
      score += 5;
      factors.push(`Last visit ${Math.round(daysSinceVisit)} days ago`);
    }
  }

  // 7. No confirmation yet (appointment is still PENDING, not CONFIRMED)
  if (appointment.status === "PENDING") {
    score += 10;
    factors.push("Not yet confirmed");
  }

  // 8. Deposit reduces risk
  if (appointment.depositPaid) {
    score -= 15;
    factors.push("Deposit paid (lower risk)");
  }

  // 9. Has card on file reduces risk
  if (client.hasCardOnFile) {
    score -= 10;
    factors.push("Card on file (lower risk)");
  }

  const finalScore = Math.max(0, Math.min(100, score));

  return {
    appointmentId,
    risk: finalScore,
    factors,
  };
}

/**
 * Score all upcoming appointments for a given date range and persist results.
 */
export async function scoreUpcomingAppointments(
  organizationId: string,
  options?: { date?: string; daysAhead?: number }
): Promise<NoShowScore[]> {
  const now = new Date();
  const startDate = options?.date ? new Date(options.date) : now;
  const daysAhead = options?.daysAhead ?? 7;
  const endDate = new Date(startDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: startDate, lte: endDate },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { id: true },
  });

  const scores: NoShowScore[] = [];

  for (const appt of appointments) {
    const score = await scoreAppointment(appt.id);
    scores.push(score);

    // Persist the risk score on the appointment
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { noShowRisk: score.risk },
    });
  }

  return scores;
}

/**
 * Get high-risk appointments that may need extra reminders or attention.
 */
export async function getHighRiskAppointments(
  organizationId: string,
  options?: { threshold?: number; date?: string }
): Promise<
  Array<{
    appointmentId: string;
    clientName: string;
    serviceName: string;
    startTime: Date;
    risk: number;
    factors: string[];
  }>
> {
  const threshold = options?.threshold ?? 40;
  const date = options?.date || new Date().toISOString().split("T")[0];
  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd = new Date(`${date}T23:59:59Z`);

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId,
      startTime: { gte: dayStart, lte: dayEnd },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    include: { client: true, service: true },
    orderBy: { startTime: "asc" },
  });

  const results = [];

  for (const appt of appointments) {
    const score = await scoreAppointment(appt.id);
    if (score.risk >= threshold) {
      results.push({
        appointmentId: appt.id,
        clientName: `${appt.client.firstName} ${appt.client.lastName ?? ""}`.trim(),
        serviceName: appt.service.name,
        startTime: appt.startTime,
        risk: score.risk,
        factors: score.factors,
      });
    }
  }

  results.sort((a, b) => b.risk - a.risk);
  return results;
}
