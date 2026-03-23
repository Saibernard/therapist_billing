import { prisma } from "@bookai/db";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA_FROM = process.env.TWILIO_WHATSAPP_NUMBER ?? "whatsapp:+14155238886";

interface SendWhatsAppParams {
  to: string;
  body: string;
  organizationId: string;
  clientId?: string;
  appointmentId?: string;
  messageType: string;
}

export async function sendWhatsApp(params: SendWhatsAppParams): Promise<string | null> {
  const log = await prisma.communicationLog.create({
    data: {
      organizationId: params.organizationId,
      clientId: params.clientId,
      appointmentId: params.appointmentId,
      channel: "WHATSAPP",
      direction: "OUTBOUND",
      messageType: params.messageType as never,
      content: params.body,
      status: "QUEUED",
    },
  });

  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.log(`[WHATSAPP STUB] To: ${params.to} | ${params.body.substring(0, 100)}`);
    await prisma.communicationLog.update({
      where: { id: log.id },
      data: { status: "SENT", externalId: `stub-${log.id}` },
    });
    return log.id;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");

    const to = params.to.startsWith("whatsapp:") ? params.to : `whatsapp:${params.to}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: TWILIO_WA_FROM,
        To: to,
        Body: params.body,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      await prisma.communicationLog.update({
        where: { id: log.id },
        data: { status: "SENT", externalId: data.sid },
      });
      return log.id;
    }

    await prisma.communicationLog.update({
      where: { id: log.id },
      data: { status: "FAILED" },
    });
    console.error("[WHATSAPP ERROR]", data);
    return null;
  } catch (err) {
    await prisma.communicationLog.update({
      where: { id: log.id },
      data: { status: "FAILED" },
    });
    console.error("[WHATSAPP ERROR]", err);
    return null;
  }
}
