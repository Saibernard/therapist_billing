import { NextResponse } from "next/server";
import { syncAllCalendars } from "@bookai/scheduling";

export async function POST() {
  try {
    const results = await syncAllCalendars();

    return NextResponse.json({
      success: true,
      synced: results.synced,
      errors: results.errors,
    });
  } catch (error) {
    console.error("Calendar sync cron error:", error);
    return NextResponse.json(
      { error: "Failed to sync calendars" },
      { status: 500 }
    );
  }
}
