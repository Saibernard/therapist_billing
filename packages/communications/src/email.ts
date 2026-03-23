import { prisma } from "@bookai/db";
import { encodeReplyAddress } from "./reply-address";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@bookai.com";

function formatGoogleCalendarDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildGoogleCalendarUrl(input: {
  title: string;
  startTime: Date;
  endTime: Date;
  details: string;
  location?: string | null;
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${formatGoogleCalendarDate(input.startTime)}/${formatGoogleCalendarDate(input.endTime)}`,
    details: input.details,
  });
  if (input.location) {
    params.set("location", input.location);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  organizationId: string;
  clientId?: string;
  appointmentId?: string;
  messageType: string;
  replyTo?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<string | null> {
  const replyTo =
    params.replyTo ??
    (params.clientId
      ? encodeReplyAddress(params.organizationId, params.clientId, params.appointmentId)
      : undefined);

  const log = await prisma.communicationLog.create({
    data: {
      organizationId: params.organizationId,
      clientId: params.clientId,
      appointmentId: params.appointmentId,
      channel: "EMAIL",
      direction: "OUTBOUND",
      messageType: params.messageType as never,
      subject: params.subject,
      content: params.text ?? params.html,
      status: "QUEUED",
    },
  });

  if (!RESEND_API_KEY) {
    console.log(`[EMAIL STUB] To: ${params.to} | Subject: ${params.subject}`);
    await prisma.communicationLog.update({
      where: { id: log.id },
      data: { status: "SENT", externalId: `stub-${log.id}` },
    });
    return log.id;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: replyTo,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      await prisma.communicationLog.update({
        where: { id: log.id },
        data: { status: "SENT", externalId: data.id },
      });
      return log.id;
    }

    await prisma.communicationLog.update({
      where: { id: log.id },
      data: { status: "FAILED" },
    });
    console.error("[EMAIL ERROR]", data);
    return null;
  } catch (err) {
    await prisma.communicationLog.update({
      where: { id: log.id },
      data: { status: "FAILED" },
    });
    console.error("[EMAIL ERROR]", err);
    return null;
  }
}

export function buildConfirmationEmail(appointment: {
  client: { firstName: string };
  service: { name: string; durationMinutes: number };
  staffMember: { displayName: string };
  startTime: Date;
  endTime: Date;
  organization: { name: string; address?: string | null; phone?: string | null };
  rescheduleUrl?: string;
}): { subject: string; html: string; text: string } {
  const { client, service, staffMember, startTime, organization } = appointment;
  const dateStr = startTime.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeStr = startTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const subject = `Confirmed: ${service.name} on ${dateStr}`;
  const googleCalendarUrl = buildGoogleCalendarUrl({
    title: `${service.name} with ${staffMember.displayName}`,
    startTime,
    endTime: appointment.endTime,
    details: `Appointment confirmed with ${organization.name}. Reply to this email to reschedule or cancel.`,
    location: organization.address ?? undefined,
  });

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 8px;">You're booked!</h2>
      <p style="color: #666; margin: 0 0 24px;">Hi ${client.firstName}, your appointment is confirmed.</p>
      <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px;"><strong>${service.name}</strong></p>
        <p style="margin: 0 0 4px; color: #666;">${dateStr} at ${timeStr}</p>
        <p style="margin: 0 0 4px; color: #666;">${service.durationMinutes} minutes with ${staffMember.displayName}</p>
        ${organization.address ? `<p style="margin: 8px 0 0; color: #666;">${organization.address}</p>` : ""}
      </div>
      <p style="color: #666; font-size: 14px; margin: 0;">
        Need to change something? Just <strong>reply to this email</strong> and our AI assistant will help you reschedule or cancel.
      </p>
      <p style="margin: 18px 0 0;">
        <a href="${googleCalendarUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #0f766e; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Add to Google Calendar
        </a>
      </p>
      ${
        appointment.rescheduleUrl
          ? `<p style="margin: 10px 0 0;">
        <a href="${appointment.rescheduleUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Reschedule appointment
        </a>
      </p>`
          : ""
      }
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #999; font-size: 12px; margin: 0;">${organization.name}${organization.phone ? ` | ${organization.phone}` : ""}</p>
    </div>
  `;

  const text = `You're booked!\n\nHi ${client.firstName}, your appointment is confirmed.\n\n${service.name}\n${dateStr} at ${timeStr}\n${service.durationMinutes} minutes with ${staffMember.displayName}\n${organization.address ?? ""}\n\nNeed to change something? Reply to this email.\nAdd to Google Calendar: ${googleCalendarUrl}${appointment.rescheduleUrl ? `\nReschedule appointment: ${appointment.rescheduleUrl}` : ""}\n\n${organization.name}`;

  return { subject, html, text };
}

export function buildReminderEmail(appointment: {
  client: { firstName: string };
  service: { name: string };
  staffMember: { displayName: string };
  startTime: Date;
  organization: { name: string };
}): { subject: string; html: string; text: string } {
  const { client, service, staffMember, startTime, organization } = appointment;
  const dateStr = startTime.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeStr = startTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const subject = `Reminder: ${service.name} tomorrow at ${timeStr}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 8px;">Appointment Reminder</h2>
      <p style="color: #666; margin: 0 0 24px;">Hi ${client.firstName}, just a friendly reminder about your upcoming appointment.</p>
      <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px;"><strong>${service.name}</strong></p>
        <p style="margin: 0 0 4px; color: #666;">${dateStr} at ${timeStr}</p>
        <p style="margin: 0; color: #666;">with ${staffMember.displayName}</p>
      </div>
      <p style="color: #666; font-size: 14px;">Reply <strong>"confirm"</strong> to confirm, or <strong>"cancel"</strong> to cancel. You can also reply with any questions.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #999; font-size: 12px; margin: 0;">${organization.name}</p>
    </div>
  `;

  const text = `Appointment Reminder\n\nHi ${client.firstName}, reminder about your upcoming appointment:\n\n${service.name}\n${dateStr} at ${timeStr}\nwith ${staffMember.displayName}\n\nReply "confirm" to confirm or "cancel" to cancel.\n\n${organization.name}`;

  return { subject, html, text };
}
