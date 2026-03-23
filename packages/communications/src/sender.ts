import type { OutboundMessage } from "@bookai/types";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { sendWhatsApp } from "./whatsapp";

export async function sendMessage(msg: OutboundMessage): Promise<string> {
  const channel = msg.channel.toUpperCase();

  try {
    if (channel === "EMAIL") {
      const id = await sendEmail({
        to: msg.to,
        subject: msg.subject ?? "BookAI Notification",
        html: msg.body,
        organizationId: msg.organizationId,
        clientId: msg.clientId,
        appointmentId: msg.appointmentId,
        messageType: msg.messageType,
        replyTo: msg.replyTo,
      });
      return id ?? "sent";
    }

    if (channel === "SMS") {
      const id = await sendSms({
        to: msg.to,
        body: msg.body,
        organizationId: msg.organizationId,
        clientId: msg.clientId,
        appointmentId: msg.appointmentId,
      });
      return id ?? "sent";
    }

    if (channel === "WHATSAPP") {
      const id = await sendWhatsApp({
        to: msg.to,
        body: msg.body,
        organizationId: msg.organizationId,
        clientId: msg.clientId,
        appointmentId: msg.appointmentId,
      });
      return id ?? "sent";
    }

    console.warn(`[SENDER] Unknown channel: ${msg.channel}`);
    return "unsupported-channel";
  } catch (error) {
    console.error(`[SEND ERROR] ${msg.channel} to ${msg.to}:`, error);
    throw error;
  }
}
