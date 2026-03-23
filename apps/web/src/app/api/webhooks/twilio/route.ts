import { NextRequest, NextResponse } from "next/server";
import { handleInboundMessage } from "@bookai/communications";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const body = formData.get("Body") as string;
    const messageSid = formData.get("MessageSid") as string;

    const isWhatsApp = from?.startsWith("whatsapp:");
    const channel = isWhatsApp ? "whatsapp" : "sms";
    const cleanFrom = isWhatsApp ? from.replace("whatsapp:", "") : from;
    const cleanTo = isWhatsApp ? to.replace("whatsapp:", "") : to;

    await handleInboundMessage({
      channel,
      from: cleanFrom,
      to: cleanTo,
      body: body ?? "",
      externalId: messageSid,
    });

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" } }
    );
  } catch (err) {
    console.error("[TWILIO WEBHOOK ERROR]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
