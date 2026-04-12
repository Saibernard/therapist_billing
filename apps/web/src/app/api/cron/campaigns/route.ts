import { NextResponse } from "next/server";
import { runActiveCampaigns } from "@bookai/communications/src/campaigns";

export async function POST() {
  try {
    const results = await runActiveCampaigns();

    const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

    return NextResponse.json({
      success: true,
      campaignsProcessed: results.length,
      totalSent,
      totalFailed,
    });
  } catch (error) {
    console.error("Campaign cron error:", error);
    return NextResponse.json(
      { error: "Failed to run campaigns" },
      { status: 500 }
    );
  }
}
