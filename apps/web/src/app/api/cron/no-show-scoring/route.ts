import { NextResponse } from "next/server";
import { prisma } from "@bookai/db";
import { scoreUpcomingAppointments } from "@bookai/ai";

export async function POST() {
  try {
    const orgs = await prisma.organization.findMany({
      select: { id: true },
    });

    let totalScored = 0;
    let totalHighRisk = 0;

    for (const org of orgs) {
      const scores = await scoreUpcomingAppointments(org.id, { daysAhead: 3 });
      totalScored += scores.length;
      totalHighRisk += scores.filter((s) => s.risk >= 40).length;
    }

    return NextResponse.json({
      scored: totalScored,
      highRisk: totalHighRisk,
      organizations: orgs.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[CRON NO-SHOW SCORING ERROR]", err);
    return NextResponse.json(
      { error: "Failed to score appointments" },
      { status: 500 }
    );
  }
}
