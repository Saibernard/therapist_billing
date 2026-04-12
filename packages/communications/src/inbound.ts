import { prisma } from "@bookai/db";
import type { Prisma } from "@prisma/client";
import type { InboundMessage } from "@bookai/types";
import { processMessage, buildAiContext } from "@bookai/ai";
import { decodeReplyAddress } from "./reply-address";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { sendWhatsApp } from "./whatsapp";
import {
  REQUEST_AUTOMATION_FUNCTIONS,
  normalizeRequestAutomationPolicy,
} from "./request-policy";

const OWNER_APPROVAL_FUNCTIONS = new Set(REQUEST_AUTOMATION_FUNCTIONS);

function parseSettings(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

async function getRequestAutomationPolicy(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!org) return normalizeRequestAutomationPolicy(undefined);
  const settings =
    typeof org.settings === "string" ? parseSettings(org.settings) : {};
  return normalizeRequestAutomationPolicy(settings.requestAutomationPolicy);
}

function inferRequestPriority(functionName: string): "urgent" | "high" | "medium" | "low" {
  if (functionName === "cancel_appointment") return "urgent";
  if (functionName === "reschedule_appointment") return "high";
  if (functionName === "create_appointment") return "medium";
  return "low";
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/**
 * Try to merge a client found on a different channel.
 * e.g. someone who booked via email now texts -- link their phone to the profile.
 */
async function enrichClientFromChannel(
  clientId: string,
  channel: string,
  contactValue: string
) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;

  const updates: Record<string, string> = {};
  if (channel === "email" && !client.email) {
    updates.email = contactValue;
  } else if ((channel === "sms" || channel === "whatsapp") && !client.phone) {
    updates.phone = contactValue.replace("whatsapp:", "");
  }
  if (!client.preferredChannel) {
    updates.preferredChannel = channel.toUpperCase();
  }
  if (Object.keys(updates).length > 0) {
    await prisma.client.update({ where: { id: clientId }, data: updates });
  }
}

export async function handleInboundMessage(msg: InboundMessage): Promise<void> {
  let orgId = msg.organizationId;
  let clientId = msg.clientId;
  let appointmentId = msg.appointmentId;

  if (msg.channel === "email" && msg.to) {
    const decoded = decodeReplyAddress(msg.to);
    if (decoded) {
      orgId = decoded.organizationId;
      clientId = decoded.clientId;
      appointmentId = decoded.appointmentId;
    }
  }

  if (!orgId && (msg.channel === "sms" || msg.channel === "whatsapp")) {
    const phoneClean = msg.to.replace(/\D/g, "");
    const org = await prisma.organization.findFirst({
      where: { phone: { contains: phoneClean } },
    });
    orgId = org?.id;
  }

  if (!orgId) {
    console.warn("[INBOUND] Could not resolve organization for message from", msg.from);
    return;
  }

  if (!clientId) {
    const cleanPhone = msg.from.replace("whatsapp:", "");
    const client = await prisma.client.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          { phone: msg.from },
          { phone: cleanPhone },
          { email: msg.from },
        ],
      },
    });
    clientId = client?.id;

    if (!clientId) {
      const newClient = await prisma.client.create({
        data: {
          organizationId: orgId,
          firstName: msg.from,
          phone: msg.channel !== "email" ? cleanPhone : undefined,
          email: msg.channel === "email" ? msg.from : undefined,
          preferredChannel: msg.channel.toUpperCase() as "EMAIL" | "SMS" | "WHATSAPP",
          source: "AI",
        },
      });
      clientId = newClient.id;
    }
  }

  await enrichClientFromChannel(
    clientId,
    msg.channel,
    msg.from
  );

  await prisma.communicationLog.create({
    data: {
      organizationId: orgId,
      clientId,
      appointmentId,
      channel: msg.channel.toUpperCase() as "EMAIL" | "SMS" | "WHATSAPP",
      direction: "INBOUND",
      messageType: "AI_REPLY",
      subject: msg.subject,
      content: msg.body,
      status: "DELIVERED",
      externalId: msg.externalId,
    },
  });

  let conversation = await prisma.aiConversation.findFirst({
    where: {
      organizationId: orgId,
      clientId,
      status: { in: ["ACTIVE", "PAUSED", "ESCALATED"] },
      channel: msg.channel.toUpperCase() as "EMAIL" | "SMS" | "WHATSAPP",
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.aiConversation.create({
      data: {
        organizationId: orgId,
        clientId,
        channel: msg.channel.toUpperCase() as "EMAIL" | "SMS" | "WHATSAPP",
        status: "ACTIVE",
        messages: [],
      },
    });
  }

  const history: Array<{ role: string; content: string; timestamp: string; functionCalls?: unknown }> =
    (Array.isArray(conversation.messages) ? conversation.messages : []) as Array<{ role: string; content: string; timestamp: string }>;

  if (!conversation.aiEnabled) {
    const updatedMessages = [
      ...history,
      { role: "user", content: msg.body, timestamp: new Date().toISOString() },
    ];
    await prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { messages: JSON.stringify(updatedMessages) },
    });
    return;
  }

  const context = await buildAiContext(orgId, clientId);
  const automationPolicy = await getRequestAutomationPolicy(orgId);
  const approvalRequiredFunctions = REQUEST_AUTOMATION_FUNCTIONS.filter(
    (fn) => automationPolicy[fn] === "require_approval"
  );

  const result = await processMessage({
    message: msg.body,
    context,
    conversationHistory: history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: m.timestamp,
    })),
    mode: "client",
    executionMode: "plan_mutations",
    approvalRequiredFunctions,
  });

  const pendingApprovals = result.functionCalls.filter(
    (call) =>
      OWNER_APPROVAL_FUNCTIONS.has(call.name) &&
      call.result.toLowerCase().includes("pending owner approval")
  );

  const assistantResponse =
    pendingApprovals.length > 0
      ? "Thanks for your message. I have sent this request to the business owner for approval, and they will confirm with you shortly."
      : result.response;

  const updatedMessages = [
    ...history,
    { role: "user", content: msg.body, timestamp: new Date().toISOString() },
    {
      role: "assistant",
      content: assistantResponse,
      timestamp: new Date().toISOString(),
      functionCalls: result.functionCalls,
    },
  ];

  await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: {
      messages: JSON.stringify(updatedMessages),
      ...(pendingApprovals.length > 0
        ? {
            status: "ESCALATED",
            aiEnabled: false,
            escalationReason: "Pending owner approval for client-requested appointment change.",
          }
        : {}),
    },
  });

  if (pendingApprovals.length > 0) {
    const recentEscalations = await prisma.aiActionLog.findMany({
      where: {
        organizationId: orgId,
        conversationId: conversation.id,
        actionType: "ESCALATED_TO_HUMAN",
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const waitingClientContext = recentEscalations.find((row) => {
      const rowMeta = parseMetadata(row.metadata);
      return (
        rowMeta.status === "WAITING_CLIENT" &&
        rowMeta.functionName === "reschedule_appointment"
      );
    });
    const waitingMeta = waitingClientContext
      ? parseMetadata(waitingClientContext.metadata)
      : null;

    for (const pending of pendingApprovals) {
      let functionArgsRaw = pending.arguments;
      if (pending.name === "reschedule_appointment" && waitingMeta?.functionArgs) {
        try {
          const currentArgs = JSON.parse(pending.arguments) as Record<string, unknown>;
          const priorArgs = JSON.parse(String(waitingMeta.functionArgs)) as Record<
            string,
            unknown
          >;
          if (typeof priorArgs.appointmentId === "string" && priorArgs.appointmentId) {
            currentArgs.appointmentId = priorArgs.appointmentId;
            functionArgsRaw = JSON.stringify(currentArgs);
          }
        } catch {
          // Fall back to model-provided args when parsing fails.
        }
      }

      await prisma.aiActionLog.create({
        data: {
          organizationId: orgId,
          conversationId: conversation.id,
          actionType: "ESCALATED_TO_HUMAN",
          description: `Pending owner approval: ${pending.name}`,
          metadata: {
            status: "PENDING_APPROVAL",
            source: "inbound_client_message",
            channel: msg.channel,
            functionName: pending.name,
            functionArgs: functionArgsRaw,
            linkedRequestId: waitingClientContext?.id ?? null,
            requestType: pending.name,
            priority: inferRequestPriority(pending.name),
            clientMessage: msg.body,
            suggestedResponse: result.response,
            appointmentId,
            subject: msg.subject ?? null,
            createdAt: new Date().toISOString(),
          },
        },
      });
    }
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;

  // If the client's firstName still looks like a phone/email (auto-created),
  // try to extract a real name from their message.
  const nameIsPlaceholder =
    client.firstName.includes("@") ||
    client.firstName.includes("+") ||
    /^\d{5,}$/.test(client.firstName);
  if (nameIsPlaceholder) {
    const nameMatch = msg.body.match(
      /(?:(?:my name is|i'm|i am|this is|call me|it's)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
    );
    if (nameMatch) {
      const parts = nameMatch[1].trim().split(/\s+/);
      await prisma.client.update({
        where: { id: clientId },
        data: {
          firstName: parts[0],
          ...(parts[1] && { lastName: parts[1] }),
        },
      });
    }
  }

  switch (msg.channel) {
    case "email":
      if (client.email) {
        await sendEmail({
          to: client.email,
          subject: `Re: ${msg.subject ?? "Your appointment"}`,
          html: `<p>${assistantResponse.replace(/\n/g, "<br>")}</p>`,
          text: assistantResponse,
          organizationId: orgId,
          clientId,
          appointmentId,
          messageType: "AI_REPLY",
        });
      }
      break;
    case "sms":
      if (client.phone) {
        await sendSms({
          to: client.phone,
          body: assistantResponse,
          organizationId: orgId,
          clientId,
          appointmentId,
          messageType: "AI_REPLY",
        });
      }
      break;
    case "whatsapp":
      if (client.phone) {
        await sendWhatsApp({
          to: client.phone,
          body: assistantResponse,
          organizationId: orgId,
          clientId,
          appointmentId,
          messageType: "AI_REPLY",
        });
      }
      break;
  }
}
