import { NextResponse } from "next/server";
import { sendPendingReminders } from "@bookai/communications";

export async function GET() {
  try {
    const count = await sendPendingReminders();
    return NextResponse.json({ sent: count, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[CRON REMINDER ERROR]", err);
    return NextResponse.json({ error: "Failed to send reminders" }, { status: 500 });
  }
}
