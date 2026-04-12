import { NextResponse } from "next/server";
import { generateUpcomingRecurring } from "@bookai/scheduling";

export async function POST() {
  try {
    const results = await generateUpcomingRecurring(6);

    const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

    return NextResponse.json({
      success: true,
      rulesProcessed: results.length,
      appointmentsCreated: totalCreated,
      appointmentsSkipped: totalSkipped,
    });
  } catch (error) {
    console.error("Generate recurring error:", error);
    return NextResponse.json(
      { error: "Failed to generate recurring appointments" },
      { status: 500 }
    );
  }
}
