import { NextRequest, NextResponse } from "next/server";
import { handleInboundMessage } from "@bookai/communications";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    // Resend inbound webhook format
    const { from, to, subject, text, html } = data;

    await handleInboundMessage({
      channel: "email",
      from: typeof from === "string" ? from : from?.email ?? "",
      to: typeof to === "string" ? to : Array.isArray(to) ? to[0] : "",
      body: text ?? html ?? "",
      subject,
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[EMAIL WEBHOOK ERROR]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
