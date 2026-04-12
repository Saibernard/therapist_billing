import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { router, protectedProcedure } from "../trpc";
import { processMessage, buildAiContext, executeFunctionCall } from "@bookai/ai";
import { getAvailableSlots } from "@bookai/scheduling";
import {
  sendEmail,
  sendSms,
  sendWhatsApp,
  buildConfirmationEmail,
  buildConfirmationSms,
  buildRescheduleBookingUrl,
  REQUEST_AUTOMATION_FUNCTIONS,
  normalizeRequestAutomationPolicy,
} from "@bookai/communications";

type PendingApprovalMetadata = {
  status?:
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "REJECTED"
    | "WAITING_CLIENT";
  source?: string;
  channel?: "email" | "sms" | "whatsapp";
  functionName?: string;
  functionArgs?: string;
  requestType?: string;
  priority?: "urgent" | "high" | "medium" | "low";
  assigneeUserId?: string | null;
  snoozedUntil?: string | null;
  linkedRequestId?: string | null;
  clientMessage?: string;
  suggestedResponse?: string;
  appointmentId?: string | null;
  subject?: string | null;
  createdAt?: string;
  resolvedAt?: string;
  decisionBy?: "owner";
  ownerMessage?: string;
  executionResult?: string;
};

function parsePendingApprovalMetadata(raw: unknown): PendingApprovalMetadata {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as PendingApprovalMetadata;
  }
  return {};
}

function parseSettings(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function inferPriority(meta: PendingApprovalMetadata): "urgent" | "high" | "medium" | "low" {
  if (meta.priority) return meta.priority;
  if (meta.functionName === "cancel_appointment") return "urgent";
  if (meta.functionName === "reschedule_appointment") return "high";
  if (meta.functionName === "create_appointment") return "medium";
  return "low";
}

async function getAutomationPolicy(ctx: { prisma: any; organizationId: string }) {
  const org = await ctx.prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { settings: true },
  });
  const settings = org?.settings ? parseSettings(org.settings) : {};
  return normalizeRequestAutomationPolicy(settings.requestAutomationPolicy);
}

async function setAutomationPolicy(
  ctx: { prisma: any; organizationId: string },
  policyInput: Partial<Record<(typeof REQUEST_AUTOMATION_FUNCTIONS)[number], "require_approval" | "auto_execute">>
) {
  const org = await ctx.prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { settings: true },
  });
  const currentSettings = org?.settings ? parseSettings(org.settings) : {};
  const currentPolicy = normalizeRequestAutomationPolicy(
    currentSettings.requestAutomationPolicy
  );
  const merged = normalizeRequestAutomationPolicy({
    ...currentPolicy,
    ...policyInput,
  });
  await ctx.prisma.organization.update({
    where: { id: ctx.organizationId },
    data: {
      settings: {
        ...currentSettings,
        requestAutomationPolicy: merged,
      },
    },
  });
  return merged;
}

function toTwelveHour(time24: string): string {
  const [h, m] = time24.split(":").map((v) => Number(v));
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function buildAlternativeMessage(
  options: Array<{ date: string; startTime: string }>,
  rescheduleUrl?: string
): string {
  if (rescheduleUrl) {
    return `I tried to reschedule to your requested time, but that slot was taken just now.\n\nPlease pick your new time directly here:\n${rescheduleUrl}\n\nOnce submitted, you'll receive an updated confirmation right away.`;
  }
  if (options.length === 0) {
    return "I tried to reschedule to your requested slot, but it is no longer available. Please reply with a different preferred day/time and we'll find the best match.";
  }
  const list = options
    .map((opt) => `- ${opt.date} at ${toTwelveHour(opt.startTime)}`)
    .join("\n");
  return `I tried to reschedule to your requested time, but that slot was taken just now.\n\nHere are the next available options:\n${list}\n\nReply with your preferred option and we will confirm it.`;
}

function extractIsoDateFromText(input?: string): string | null {
  if (!input) return null;
  const isoMatch =
    input.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/) ??
    input.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  return isoMatch?.[0] ?? null;
}

async function findRescheduleAlternatives(params: {
  prisma: any;
  organizationId: string;
  appointmentId: string;
  requestedDateTime?: string;
}): Promise<Array<{ date: string; startTime: string; endTime: string; staffName: string }>> {
  const appointment = await params.prisma.appointment.findFirst({
    where: {
      id: params.appointmentId,
      organizationId: params.organizationId,
    },
    include: {
      staffMember: true,
      service: true,
    },
  });
  if (!appointment) return [];

  const org = await params.prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: { timezone: true },
  });
  const timezone = org?.timezone ?? "America/New_York";

  const baseline = params.requestedDateTime
    ? new Date(params.requestedDateTime)
    : appointment.startTime;
  const options: Array<{ date: string; startTime: string; endTime: string; staffName: string }> = [];

  for (let dayOffset = 0; dayOffset < 10 && options.length < 5; dayOffset++) {
    const d = new Date(baseline);
    d.setDate(d.getDate() + dayOffset);
    const date = d.toISOString().split("T")[0];
    const slots = await getAvailableSlots({
      organizationId: params.organizationId,
      serviceId: appointment.serviceId,
      staffMemberId: appointment.staffMemberId,
      date,
      timezone,
    });
    for (const slot of slots) {
      options.push({
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        staffName: slot.staffName,
      });
      if (options.length >= 5) break;
    }
  }

  return options;
}

export const aiRouter = router({
  chat: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(5000),
        conversationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const context = await buildAiContext(ctx.organizationId);

      let conversation = input.conversationId
        ? await ctx.prisma.aiConversation.findUnique({
            where: { id: input.conversationId },
          })
        : null;

      if (!conversation) {
        conversation = await ctx.prisma.aiConversation.create({
          data: {
            organizationId: ctx.organizationId,
            channel: "EMAIL",
            status: "ACTIVE",
            messages: [],
          },
        });
      }

      const history: Array<{ role: string; content: string; timestamp: string }> =
        (Array.isArray(conversation.messages) ? conversation.messages : []) as Array<{ role: string; content: string; timestamp: string }>;

      const result = await processMessage({
        message: input.message,
        context,
        conversationHistory: history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: m.timestamp,
        })),
        mode: "business",
      });

      const updatedMessages = [
        ...history,
        { role: "user", content: input.message, timestamp: new Date().toISOString() },
        {
          role: "assistant",
          content: result.response,
          timestamp: new Date().toISOString(),
          functionCalls: result.functionCalls,
          uiBlocks: result.uiBlocks,
        },
      ];

      await ctx.prisma.aiConversation.update({
        where: { id: conversation.id },
        data: { messages: JSON.stringify(updatedMessages) },
      });

      return {
        conversationId: conversation.id,
        response: result.response,
        functionCalls: result.functionCalls,
        uiBlocks: result.uiBlocks ?? [],
      };
    }),

  getConversations: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.aiConversation.findMany({
      where: { organizationId: ctx.organizationId },
      include: { client: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
  }),

  getConversationById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.aiConversation.findUnique({
        where: { id: input.id },
        include: { client: true },
      });

      if (!conversation) return null;

      const messages: Array<{ role: string; content: string; timestamp: string; functionCalls?: unknown }> =
        (Array.isArray(conversation.messages) ? conversation.messages : []) as Array<{ role: string; content: string; timestamp: string }>;

      return { ...conversation, messages };
    }),

  getPendingApprovals: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const logs = await ctx.prisma.aiActionLog.findMany({
        where: {
          organizationId: ctx.organizationId,
          conversationId: input.conversationId,
          actionType: "ESCALATED_TO_HUMAN",
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return logs
        .map((log) => {
          const meta = parsePendingApprovalMetadata(log.metadata);
          return {
            id: log.id,
            description: log.description,
            createdAt: log.createdAt,
            status: meta.status ?? null,
            functionName: meta.functionName ?? null,
            functionArgs: meta.functionArgs ?? null,
            clientMessage: meta.clientMessage ?? null,
            suggestedResponse: meta.suggestedResponse ?? null,
            channel: meta.channel ?? null,
          };
        })
        .filter((item) => item.status === "PENDING_APPROVAL" && !!item.functionName);
    }),

  getRequestQueue: protectedProcedure
    .input(
      z.object({
        status: z
          .enum([
            "ALL",
            "PENDING_APPROVAL",
            "WAITING_CLIENT",
            "APPROVED",
            "REJECTED",
          ])
          .default("PENDING_APPROVAL"),
        channel: z.enum(["ALL", "EMAIL", "SMS", "WHATSAPP"]).default("ALL"),
        requestType: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const logs = await ctx.prisma.aiActionLog.findMany({
        where: {
          organizationId: ctx.organizationId,
          actionType: "ESCALATED_TO_HUMAN",
        },
        include: {
          conversation: {
            include: {
              client: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(input.limit * 3, 400),
      });

      const base = logs
        .map((log) => {
          const meta = parsePendingApprovalMetadata(log.metadata);
          if (!meta.functionName) return null;
          const channel = (log.conversation?.channel ?? meta.channel?.toUpperCase()) as
            | "EMAIL"
            | "SMS"
            | "WHATSAPP"
            | undefined;
          const client = log.conversation?.client;
          const clientName = client
            ? `${client.firstName} ${client.lastName ?? ""}`.trim()
            : "Unknown client";
          const requestType = meta.requestType ?? meta.functionName;
          return {
            id: log.id,
            conversationId: log.conversationId,
            createdAt: log.createdAt,
            status: meta.status ?? "PENDING_APPROVAL",
            requestType,
            functionName: meta.functionName ?? null,
            functionArgs: meta.functionArgs ?? null,
            channel: channel ?? "EMAIL",
            priority: inferPriority(meta),
            assigneeUserId: meta.assigneeUserId ?? null,
            snoozedUntil: meta.snoozedUntil ?? null,
            description: log.description,
            clientMessage: meta.clientMessage ?? "",
            suggestedResponse: meta.suggestedResponse ?? "",
            executionResult: meta.executionResult ?? null,
            clientName,
            clientEmail: client?.email ?? null,
            clientPhone: client?.phone ?? null,
          };
        })
        .filter((item): item is NonNullable<typeof item> => !!item);

      const assigneeIds = Array.from(
        new Set(base.map((item) => item.assigneeUserId).filter((id): id is string => !!id))
      );
      const assignees =
        assigneeIds.length > 0
          ? await ctx.prisma.user.findMany({
              where: {
                organizationId: ctx.organizationId,
                id: { in: assigneeIds },
              },
              select: { id: true, name: true, email: true },
            })
          : [];
      const assigneeMap = new Map(assignees.map((u) => [u.id, u]));

      const search = input.search?.trim().toLowerCase();
      const filtered = base.filter((item) => {
        if (input.status !== "ALL" && item.status !== input.status) return false;
        if (input.channel !== "ALL" && item.channel !== input.channel) return false;
        if (input.requestType && item.requestType !== input.requestType) return false;
        if (search) {
          const haystack = [
            item.clientName,
            item.clientEmail ?? "",
            item.clientPhone ?? "",
            item.description,
            item.clientMessage,
            item.requestType,
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      });

      return filtered.slice(0, input.limit).map((item) => ({
        ...item,
        assignee: item.assigneeUserId ? assigneeMap.get(item.assigneeUserId) ?? null : null,
      }));
    }),

  getRequestQueueStats: protectedProcedure.query(async ({ ctx }) => {
    const logs = await ctx.prisma.aiActionLog.findMany({
      where: {
        organizationId: ctx.organizationId,
        actionType: "ESCALATED_TO_HUMAN",
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const now = Date.now();
    let pending = 0;
    let waitingClient = 0;
    let approved = 0;
    let rejected = 0;
    let overdue = 0;

    for (const log of logs) {
      const meta = parsePendingApprovalMetadata(log.metadata);
      if (!meta.functionName) continue;
      const status = meta.status ?? "PENDING_APPROVAL";
      if (status === "PENDING_APPROVAL") {
        pending++;
        const snoozedUntil = meta.snoozedUntil ? new Date(meta.snoozedUntil).getTime() : null;
        if (!snoozedUntil || snoozedUntil < now) {
          const ageMs = now - new Date(log.createdAt).getTime();
          if (ageMs > 2 * 60 * 60 * 1000) overdue++;
        }
      } else if (status === "WAITING_CLIENT") {
        waitingClient++;
      } else if (status === "APPROVED") {
        approved++;
      } else if (status === "REJECTED") {
        rejected++;
      }
    }

    return { pending, waitingClient, approved, rejected, overdue };
  }),

  updateRequestItem: protectedProcedure
    .input(
      z.object({
        actionLogId: z.string(),
        priority: z.enum(["urgent", "high", "medium", "low"]).optional(),
        assigneeUserId: z.string().nullable().optional(),
        snoozedUntil: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const log = await ctx.prisma.aiActionLog.findFirst({
        where: {
          id: input.actionLogId,
          organizationId: ctx.organizationId,
          actionType: "ESCALATED_TO_HUMAN",
        },
      });
      if (!log) throw new Error("Request item not found.");

      if (input.assigneeUserId) {
        const assignee = await ctx.prisma.user.findFirst({
          where: {
            id: input.assigneeUserId,
            organizationId: ctx.organizationId,
          },
        });
        if (!assignee) throw new Error("Assignee not found in organization.");
      }

      const meta = parsePendingApprovalMetadata(log.metadata);
      const nextMeta: PendingApprovalMetadata = {
        ...meta,
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assigneeUserId !== undefined
          ? { assigneeUserId: input.assigneeUserId }
          : {}),
        ...(input.snoozedUntil !== undefined
          ? { snoozedUntil: input.snoozedUntil }
          : {}),
      };

      await ctx.prisma.aiActionLog.update({
        where: { id: input.actionLogId },
        data: { metadata: nextMeta },
      });

      return { success: true };
    }),

  getRequestAutomationPolicy: protectedProcedure.query(async ({ ctx }) => {
    return getAutomationPolicy(ctx);
  }),

  setRequestAutomationPolicy: protectedProcedure
    .input(
      z.object({
        create_appointment: z.enum(["require_approval", "auto_execute"]).optional(),
        reschedule_appointment: z.enum(["require_approval", "auto_execute"]).optional(),
        cancel_appointment: z.enum(["require_approval", "auto_execute"]).optional(),
        confirm_appointment: z.enum(["require_approval", "auto_execute"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const policy = await setAutomationPolicy(ctx, input);
      return { success: true, policy };
    }),

  resolvePendingApproval: protectedProcedure
    .input(
      z.object({
        actionLogId: z.string(),
        decision: z.enum(["APPROVE", "REJECT"]),
        ownerMessage: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const log = await ctx.prisma.aiActionLog.findFirst({
        where: {
          id: input.actionLogId,
          organizationId: ctx.organizationId,
        },
      });

      if (!log) {
        throw new Error("Pending approval item not found.");
      }

      const meta = parsePendingApprovalMetadata(log.metadata);
      if (meta.status !== "PENDING_APPROVAL" || !meta.functionName) {
        throw new Error("This approval item is already resolved.");
      }

      const conversation = log.conversationId
        ? await ctx.prisma.aiConversation.findUnique({
            where: { id: log.conversationId },
            include: { client: true },
          })
        : null;

      let executionResultMessage: string | null = null;
      let executionSucceeded = false;
      let approvedAppointmentId: string | null = null;
      let requestedNewDateTime: string | undefined;
      let finalStatus: PendingApprovalMetadata["status"] =
        input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      if (input.decision === "APPROVE") {
        const parsedArgs: Record<string, unknown> = meta.functionArgs
          ? JSON.parse(meta.functionArgs)
          : {};
        requestedNewDateTime =
          typeof parsedArgs.newDateTime === "string"
            ? parsedArgs.newDateTime
            : undefined;

        if (
          conversation?.clientId &&
          ["reschedule_appointment", "cancel_appointment", "confirm_appointment"].includes(
            meta.functionName
          )
        ) {
          const maybeAppointmentId = parsedArgs.appointmentId as string | undefined;
          let appointmentById = maybeAppointmentId
            ? await ctx.prisma.appointment.findFirst({
                where: {
                  id: maybeAppointmentId,
                  organizationId: ctx.organizationId,
                  clientId: conversation.clientId,
                },
              })
            : null;

          if (!appointmentById && meta.linkedRequestId) {
            const linked = await ctx.prisma.aiActionLog.findFirst({
              where: {
                id: meta.linkedRequestId,
                organizationId: ctx.organizationId,
                conversationId: conversation.id,
                actionType: "ESCALATED_TO_HUMAN",
              },
            });
            if (linked) {
              const linkedMeta = parsePendingApprovalMetadata(linked.metadata);
              const linkedArgs = linkedMeta.functionArgs
                ? (JSON.parse(linkedMeta.functionArgs) as Record<string, unknown>)
                : {};
              const linkedAppointmentId = linkedArgs.appointmentId as string | undefined;
              if (linkedAppointmentId) {
                const linkedAppointment = await ctx.prisma.appointment.findFirst({
                  where: {
                    id: linkedAppointmentId,
                    organizationId: ctx.organizationId,
                    clientId: conversation.clientId,
                  },
                });
                if (linkedAppointment) appointmentById = linkedAppointment;
              }
            }
          }

          if (!appointmentById) {
            const waitingClientLogs = await ctx.prisma.aiActionLog.findMany({
              where: {
                organizationId: ctx.organizationId,
                conversationId: conversation.id,
                actionType: "ESCALATED_TO_HUMAN",
              },
              orderBy: { createdAt: "desc" },
              take: 15,
            });
            for (const row of waitingClientLogs) {
              const rowMeta = parsePendingApprovalMetadata(row.metadata);
              if (
                rowMeta.status !== "WAITING_CLIENT" ||
                rowMeta.functionName !== meta.functionName
              ) {
                continue;
              }
              const rowArgs = rowMeta.functionArgs
                ? (JSON.parse(rowMeta.functionArgs) as Record<string, unknown>)
                : {};
              const priorAppointmentId = rowArgs.appointmentId as string | undefined;
              if (!priorAppointmentId) continue;
              const prior = await ctx.prisma.appointment.findFirst({
                where: {
                  id: priorAppointmentId,
                  organizationId: ctx.organizationId,
                  clientId: conversation.clientId,
                },
              });
              if (prior) {
                appointmentById = prior;
                break;
              }
            }
          }

          if (!appointmentById && maybeAppointmentId) {
            const hintedIso = extractIsoDateFromText(maybeAppointmentId);
            if (hintedIso) {
              const hintedDate = new Date(hintedIso);
              const windowStart = new Date(hintedDate.getTime() - 60 * 60 * 1000);
              const windowEnd = new Date(hintedDate.getTime() + 60 * 60 * 1000);
              appointmentById = await ctx.prisma.appointment.findFirst({
                where: {
                  organizationId: ctx.organizationId,
                  clientId: conversation.clientId,
                  status: { in: ["PENDING", "CONFIRMED"] },
                  startTime: { gte: windowStart, lte: windowEnd },
                },
                orderBy: { startTime: "asc" },
              });
            }
          }

          if (!appointmentById) {
            const fallbackAppointment = await ctx.prisma.appointment.findFirst({
              where: {
                organizationId: ctx.organizationId,
                clientId: conversation.clientId,
                status: { in: ["PENDING", "CONFIRMED"] },
                startTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              },
              orderBy: { startTime: "asc" },
            });
            if (fallbackAppointment) {
              appointmentById = fallbackAppointment;
            }
          }

          if (appointmentById) {
            parsedArgs.appointmentId = appointmentById.id;
          }
        }

        if (
          typeof parsedArgs.appointmentId === "string" &&
          parsedArgs.appointmentId.trim().length > 0
        ) {
          approvedAppointmentId = parsedArgs.appointmentId;
        }

        const execution = await executeFunctionCall(
          meta.functionName,
          parsedArgs,
          ctx.organizationId,
          conversation?.clientId ?? undefined
        );
        executionSucceeded = execution.success;
        executionResultMessage = execution.message;

        if (!approvedAppointmentId && execution.data && typeof execution.data === "object") {
          const maybeId = (execution.data as { id?: unknown }).id;
          if (typeof maybeId === "string" && maybeId.trim().length > 0) {
            approvedAppointmentId = maybeId;
          }
        }

        if (!executionSucceeded) {
          const isConflictFailure =
            meta.functionName === "reschedule_appointment" &&
            (executionResultMessage ?? "").toLowerCase().includes("conflict");
          if (isConflictFailure && approvedAppointmentId) {
            finalStatus = "WAITING_CLIENT";
          } else {
            throw new Error(
              `Could not complete this request: ${
                executionResultMessage ?? "Unknown execution error"
              }`
            );
          }
        }
      }

      let outboundText =
        input.ownerMessage?.trim() ||
        (input.decision === "APPROVE"
          ? executionSucceeded
            ? `Approved and completed. ${executionResultMessage ?? ""}`.trim()
            : `I reviewed this request, but couldn't complete the change yet: ${executionResultMessage ?? "Please suggest a different time."}`.trim()
          : "Thanks for your message. The business owner reviewed this and asked for a different time or more details.");

      if (
        input.decision === "APPROVE" &&
        finalStatus === "WAITING_CLIENT" &&
        approvedAppointmentId
      ) {
        const alternatives = await findRescheduleAlternatives({
          prisma: ctx.prisma,
          organizationId: ctx.organizationId,
          appointmentId: approvedAppointmentId,
          requestedDateTime: requestedNewDateTime,
        });
        const appointmentForLink = await ctx.prisma.appointment.findFirst({
          where: {
            id: approvedAppointmentId,
            organizationId: ctx.organizationId,
          },
          select: {
            id: true,
            organizationId: true,
            clientId: true,
            organization: {
              select: {
                slug: true,
              },
            },
          },
        });
        const rescheduleUrl = appointmentForLink
          ? buildRescheduleBookingUrl({
              slug: appointmentForLink.organization.slug,
              organizationId: appointmentForLink.organizationId,
              clientId: appointmentForLink.clientId,
              appointmentId: appointmentForLink.id,
            })
          : undefined;
        outboundText = buildAlternativeMessage(
          alternatives.slice(0, 3).map((opt) => ({
            date: opt.date,
            startTime: opt.startTime,
          })),
          rescheduleUrl
        );
      }

      if (conversation?.client) {
        let sentStructuredConfirmation = false;
        const canSendFreshConfirmation =
          input.decision === "APPROVE" &&
          executionSucceeded &&
          !!approvedAppointmentId &&
          (meta.functionName === "reschedule_appointment" ||
            meta.functionName === "create_appointment");

        if (canSendFreshConfirmation) {
          const appointment = await ctx.prisma.appointment.findFirst({
            where: {
              id: approvedAppointmentId!,
              organizationId: ctx.organizationId,
              clientId: conversation.clientId ?? undefined,
            },
            include: {
              client: true,
              service: true,
              staffMember: true,
              organization: true,
            },
          });

          if (appointment) {
            if (conversation.channel === "EMAIL" && conversation.client.email) {
              const confirmation = buildConfirmationEmail({
                client: { firstName: appointment.client.firstName },
                service: {
                  name: appointment.service.name,
                  durationMinutes: appointment.service.durationMinutes,
                },
                staffMember: { displayName: appointment.staffMember.displayName },
                startTime: appointment.startTime,
                endTime: appointment.endTime,
                organization: {
                  name: appointment.organization.name,
                  address: appointment.organization.address,
                  phone: appointment.organization.phone,
                },
                rescheduleUrl: buildRescheduleBookingUrl({
                  slug: appointment.organization.slug,
                  organizationId: appointment.organizationId,
                  clientId: appointment.clientId,
                  appointmentId: appointment.id,
                }),
              });
              await sendEmail({
                to: conversation.client.email,
                subject:
                  meta.functionName === "reschedule_appointment"
                    ? `Updated: ${confirmation.subject}`
                    : confirmation.subject,
                html: confirmation.html,
                text: confirmation.text,
                organizationId: ctx.organizationId,
                clientId: conversation.clientId ?? undefined,
                appointmentId: appointment.id,
                messageType: "CONFIRMATION",
              });
              sentStructuredConfirmation = true;
            } else if (conversation.channel === "SMS" && conversation.client.phone) {
              const sms = buildConfirmationSms({
                client: { firstName: appointment.client.firstName },
                service: { name: appointment.service.name },
                staffMember: { displayName: appointment.staffMember.displayName },
                startTime: appointment.startTime,
                organization: { name: appointment.organization.name },
              });
              await sendSms({
                to: conversation.client.phone,
                body: sms,
                organizationId: ctx.organizationId,
                clientId: conversation.clientId ?? undefined,
                appointmentId: appointment.id,
                messageType: "CONFIRMATION",
              });
              sentStructuredConfirmation = true;
            }
          }
        }

        const shouldSendGenericReply = !sentStructuredConfirmation || !!input.ownerMessage?.trim();
        if (shouldSendGenericReply) {
          if (conversation.channel === "EMAIL" && conversation.client.email) {
            await sendEmail({
              to: conversation.client.email,
              subject: "Re: Your appointment",
              html: `<p>${outboundText.replace(/\n/g, "<br>")}</p>`,
              text: outboundText,
              organizationId: ctx.organizationId,
              clientId: conversation.clientId ?? undefined,
              appointmentId: approvedAppointmentId ?? meta.appointmentId ?? undefined,
              messageType: "AI_REPLY",
            });
          } else if (conversation.channel === "SMS" && conversation.client.phone) {
            await sendSms({
              to: conversation.client.phone,
              body: outboundText,
              organizationId: ctx.organizationId,
              clientId: conversation.clientId ?? undefined,
              appointmentId: approvedAppointmentId ?? meta.appointmentId ?? undefined,
              messageType: "AI_REPLY",
            });
          } else if (conversation.channel === "WHATSAPP" && conversation.client.phone) {
            await sendWhatsApp({
              to: conversation.client.phone,
              body: outboundText,
              organizationId: ctx.organizationId,
              clientId: conversation.clientId ?? undefined,
              appointmentId: approvedAppointmentId ?? meta.appointmentId ?? undefined,
              messageType: "AI_REPLY",
            });
          }
        }
      }

      await ctx.prisma.aiActionLog.update({
        where: { id: input.actionLogId },
        data: {
          metadata: {
            ...meta,
            status: finalStatus,
            resolvedAt: new Date().toISOString(),
            decisionBy: "owner",
            ownerMessage: input.ownerMessage ?? null,
            executionResult: executionResultMessage,
          },
          description: `${log.description} (${input.decision.toLowerCase()})`,
        },
      });

      if (conversation) {
        const history: Array<{ role: string; content: string; timestamp: string }> =
          (Array.isArray(conversation.messages) ? conversation.messages : []) as Array<{ role: string; content: string; timestamp: string }>;

        const ownerLogText =
          input.decision === "APPROVE" && finalStatus === "WAITING_CLIENT"
            ? `Approved request, but requested slot conflicted. Sent alternative options to client.`
            : input.decision === "APPROVE"
              ? `Approved request. ${outboundText}`
            : `Rejected request. ${outboundText}`;

        const updatedMessages = [
          ...history,
          {
            role: "owner",
            content: ownerLogText,
            timestamp: new Date().toISOString(),
          },
        ];

        const remainingLogs = await ctx.prisma.aiActionLog.findMany({
          where: {
            organizationId: ctx.organizationId,
            conversationId: conversation.id,
            actionType: "ESCALATED_TO_HUMAN",
          },
        });

        const hasMorePending = remainingLogs.some((row) => {
          const rowMeta = parsePendingApprovalMetadata(row.metadata);
          return rowMeta.status === "PENDING_APPROVAL";
        });

        await ctx.prisma.aiConversation.update({
          where: { id: conversation.id },
          data: {
            messages: JSON.stringify(updatedMessages),
            status: hasMorePending ? "ESCALATED" : "ACTIVE",
            aiEnabled: !hasMorePending,
            escalationReason: hasMorePending
              ? "Waiting for owner approval on pending requests."
              : null,
          },
        });
      }

      return {
        success: true,
        decision: input.decision,
        executionResult: executionResultMessage,
      };
    }),

  sendManualReply: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        message: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.aiConversation.findUniqueOrThrow({
        where: { id: input.conversationId },
        include: { client: true },
      });

      const history: Array<{ role: string; content: string; timestamp: string }> =
        (Array.isArray(conversation.messages) ? conversation.messages : []) as Array<{ role: string; content: string; timestamp: string }>;

      const updatedMessages = [
        ...history,
        {
          role: "owner",
          content: input.message,
          timestamp: new Date().toISOString(),
        },
      ];

      await ctx.prisma.aiConversation.update({
        where: { id: input.conversationId },
        data: { messages: JSON.stringify(updatedMessages) },
      });

      const messageType = "AI_REPLY";
      const channel = conversation.channel;

      if (channel === "EMAIL" && conversation.client?.email) {
        await sendEmail({
          to: conversation.client.email,
          subject: "Re: Your appointment",
          html: `<p>${input.message.replace(/\n/g, "<br>")}</p>`,
          text: input.message,
          organizationId: ctx.organizationId,
          clientId: conversation.clientId ?? undefined,
          messageType,
        });
      } else if (channel === "SMS" && conversation.client?.phone) {
        await sendSms({
          to: conversation.client.phone,
          body: input.message,
          organizationId: ctx.organizationId,
          clientId: conversation.clientId ?? undefined,
          messageType,
        });
      } else if (channel === "WHATSAPP" && conversation.client?.phone) {
        await sendWhatsApp({
          to: conversation.client.phone,
          body: input.message,
          organizationId: ctx.organizationId,
          clientId: conversation.clientId ?? undefined,
          messageType,
        });
      }

      await ctx.prisma.aiActionLog.create({
        data: {
          organizationId: ctx.organizationId,
          conversationId: input.conversationId,
          actionType: "MESSAGE_SENT",
          description: `Owner sent manual ${channel.toLowerCase()} reply`,
        },
      });

      return { success: true };
    }),

  toggleAi: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.aiConversation.update({
        where: { id: input.conversationId },
        data: {
          aiEnabled: input.enabled,
          status: input.enabled ? "ACTIVE" : "PAUSED",
        },
      });
      return { success: true };
    }),

  escalate: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.aiConversation.update({
        where: { id: input.conversationId },
        data: {
          status: "ESCALATED",
          aiEnabled: false,
          escalationReason: input.reason ?? "Manually escalated by owner",
        },
      });
      return { success: true };
    }),

  resolve: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.aiConversation.update({
        where: { id: input.conversationId },
        data: { status: "RESOLVED" },
      });
      return { success: true };
    }),

  getActionLog: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.aiActionLog.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  getNotificationCount: protectedProcedure.query(async ({ ctx }) => {
    const escalatedCount = await ctx.prisma.aiConversation.count({
      where: {
        organizationId: ctx.organizationId,
        status: "ESCALATED",
      },
    });
    const pendingRequestCount = await ctx.prisma.aiActionLog.count({
      where: {
        organizationId: ctx.organizationId,
        actionType: "ESCALATED_TO_HUMAN",
        metadata: { path: ["status"], equals: "PENDING_APPROVAL" },
      },
    });
    return { escalatedCount, pendingRequestCount };
  }),
});
