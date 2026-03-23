import { prisma } from "@bookai/db";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;

interface SendSmsParams {
  to: string;
  body: string;
  organizationId: string;
  clientId?: string;
  appointmentId?: string;
  messageType: string;
}

export async function sendSms(params: SendSmsParams): Promise<string | null> {
  const log = await prisma.communicationLog.create({
    data: {
      organizationId: params.organizationId,
      clientId: params.clientId,
      appointmentId: params.appointmentId,
      channel: "SMS",
      direction: "OUTBOUND",
      messageType: params.messageType as never,
      content: params.body,
      status: "QUEUED",
    },
  });

  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.log(`[SMS STUB] To: ${params.to} | ${params.body.substring(0, 100)}`);
    await prisma.communicationLog.update({
      where: { id: log.id },
      data: { status: "SENT", externalId: `stub-${log.id}` },
    });
    return log.id;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: TWILIO_FROM,
        To: params.to,
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
    console.error("[SMS ERROR]", data);
    return null;
  } catch (err) {
    await prisma.communicationLog.update({
      where: { id: log.id },
      data: { status: "FAILED" },
    });
    console.error("[SMS ERROR]", err);
    return null;
  }
}

export function buildConfirmationSms(appointment: {
  client: { firstName: string };
  service: { name: string };
  staffMember: { displayName: string };
  startTime: Date;
  organization: { name: string };
}): string {
  const { client, service, staffMember, startTime, organization } = appointment;
  const dateStr = startTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeStr = startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Hi ${client.firstName}! Your ${service.name} with ${staffMember.displayName} is confirmed for ${dateStr} at ${timeStr}. Reply to reschedule or cancel. - ${organization.name}`;
}

export function buildReminderSms(appointment: {
  client: { firstName: string };
  service: { name: string };
  startTime: Date;
  organization: { name: string };
}): string {
  const { client, service, startTime, organization } = appointment;
  const timeStr = startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Reminder: ${client.firstName}, your ${service.name} is tomorrow at ${timeStr}. Reply CONFIRM or CANCEL. - ${organization.name}`;
}
