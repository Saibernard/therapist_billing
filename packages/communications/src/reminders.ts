import { prisma } from "@bookai/db";
import { sendEmail, buildReminderEmail } from "./email";
import { sendSms, buildReminderSms } from "./sms";
import { sendWhatsApp } from "./whatsapp";

export async function sendPendingReminders(): Promise<number> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      startTime: { gte: in24h, lt: in25h },
      status: { in: ["CONFIRMED", "PENDING"] },
      reminderSent: false,
    },
    include: {
      client: true,
      service: true,
      staffMember: true,
      organization: true,
    },
  });

  let sentCount = 0;

  for (const apt of appointments) {
    try {
      const channel = apt.client.preferredChannel;

      if (channel === "EMAIL" && apt.client.email) {
        const { subject, html, text } = buildReminderEmail({
          client: apt.client,
          service: apt.service,
          staffMember: apt.staffMember,
          startTime: apt.startTime,
          organization: apt.organization,
        });
        await sendEmail({
          to: apt.client.email,
          subject,
          html,
          text,
          organizationId: apt.organizationId,
          clientId: apt.clientId,
          appointmentId: apt.id,
          messageType: "REMINDER",
        });
      } else if (channel === "SMS" && apt.client.phone) {
        const body = buildReminderSms({
          client: apt.client,
          service: apt.service,
          startTime: apt.startTime,
          organization: apt.organization,
        });
        await sendSms({
          to: apt.client.phone,
          body,
          organizationId: apt.organizationId,
          clientId: apt.clientId,
          appointmentId: apt.id,
          messageType: "REMINDER",
        });
      } else if (channel === "WHATSAPP" && apt.client.phone) {
        const body = buildReminderSms({
          client: apt.client,
          service: apt.service,
          startTime: apt.startTime,
          organization: apt.organization,
        });
        await sendWhatsApp({
          to: apt.client.phone,
          body,
          organizationId: apt.organizationId,
          clientId: apt.clientId,
          appointmentId: apt.id,
          messageType: "REMINDER",
        });
      }

      await prisma.appointment.update({
        where: { id: apt.id },
        data: { reminderSent: true },
      });
      sentCount++;
    } catch (err) {
      console.error(`[REMINDER ERROR] Appointment ${apt.id}:`, err);
    }
  }

  return sentCount;
}
