import { appRouter } from "../../packages/api/src/root";
import { createTRPCContext } from "../../packages/api/src/trpc";

const ORG_ID = process.env.ORG_ID ?? "cmn2agdcr0000ynnlcjaernt2";
const SERVICE_ID = process.env.SERVICE_ID ?? "cmn2agdmh0006ynnlp1igd64q";
const STAFF_ID = process.env.STAFF_ID ?? "cmn2agdm10004ynnleww9twff";
const ORG_SLUG = process.env.ORG_SLUG ?? "demo-studio";

async function main() {
  const ctx = await createTRPCContext({
    userId: "sim-owner",
    organizationId: ORG_ID,
  });
  const prisma = ctx.prisma;
  const caller = appRouter.createCaller(ctx);

  const ts = Date.now();
  const emailA = `conflict.db.a.${ts}@example.com`;
  const emailB = `conflict.db.b.${ts}@example.com`;

  const clientA = await prisma.client.create({
    data: {
      organizationId: ORG_ID,
      firstName: "ConflictA",
      lastName: "DB",
      email: emailA,
      source: "MANUAL",
    },
  });

  const clientB = await prisma.client.create({
    data: {
      organizationId: ORG_ID,
      firstName: "ConflictB",
      lastName: "DB",
      email: emailB,
      source: "MANUAL",
    },
  });

  // Fixed synthetic slots to deterministically force a conflict.
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 5);
  base.setUTCHours(14, 0, 0, 0);

  const aStart = new Date(base);
  const aEnd = new Date(base.getTime() + 60 * 60 * 1000);
  const bStart = new Date(base.getTime() + 60 * 60 * 1000);
  const bEnd = new Date(base.getTime() + 120 * 60 * 1000);

  const appointmentA = await prisma.appointment.create({
    data: {
      organizationId: ORG_ID,
      clientId: clientA.id,
      serviceId: SERVICE_ID,
      staffMemberId: STAFF_ID,
      startTime: aStart,
      endTime: aEnd,
      status: "CONFIRMED",
      source: "MANUAL",
    },
  });

  const appointmentB = await prisma.appointment.create({
    data: {
      organizationId: ORG_ID,
      clientId: clientB.id,
      serviceId: SERVICE_ID,
      staffMemberId: STAFF_ID,
      startTime: bStart,
      endTime: bEnd,
      status: "CONFIRMED",
      source: "MANUAL",
    },
  });

  const conversation = await prisma.aiConversation.create({
    data: {
      organizationId: ORG_ID,
      clientId: clientA.id,
      channel: "EMAIL",
      status: "ESCALATED",
      aiEnabled: false,
      messages: [
        {
          role: "user",
          content: `Can we move my appointment to ${bStart.toISOString()}?`,
          timestamp: new Date().toISOString(),
        },
      ],
    },
  });

  const actionLog = await prisma.aiActionLog.create({
    data: {
      organizationId: ORG_ID,
      conversationId: conversation.id,
      actionType: "ESCALATED_TO_HUMAN",
      description: "Pending approval: reschedule request (forced conflict)",
      metadata: {
        status: "PENDING_APPROVAL",
        source: "inbound_email",
        channel: "email",
        functionName: "reschedule_appointment",
        functionArgs: JSON.stringify({
          appointmentId: appointmentA.id,
          newDateTime: bStart.toISOString(),
        }),
        requestType: "reschedule_appointment",
        priority: "high",
        appointmentId: appointmentA.id,
        clientMessage: `Can we move to ${bStart.toISOString()}?`,
        createdAt: new Date().toISOString(),
      },
    },
  });

  const resolution = await caller.ai.resolvePendingApproval({
    actionLogId: actionLog.id,
    decision: "APPROVE",
  });

  const updatedLog = await prisma.aiActionLog.findUniqueOrThrow({
    where: { id: actionLog.id },
  });
  const updatedMeta = (updatedLog.metadata ?? {}) as Record<string, any>;

  const outbound = await prisma.communicationLog.findFirst({
    where: {
      organizationId: ORG_ID,
      clientId: clientA.id,
      appointmentId: appointmentA.id,
      channel: "EMAIL",
      messageType: "AI_REPLY",
    },
    orderBy: { createdAt: "desc" },
  });

  const outboundContent = outbound?.content ?? "";
  const hasRescheduleLink = new RegExp(
    `/book/${ORG_SLUG}\\?rescheduleToken=`
  ).test(outboundContent);

  console.log(
    JSON.stringify(
      {
        setup: {
          appointmentAId: appointmentA.id,
          appointmentBId: appointmentB.id,
          appointmentAStart: appointmentA.startTime.toISOString(),
          appointmentBStart: appointmentB.startTime.toISOString(),
          conversationId: conversation.id,
          actionLogId: actionLog.id,
        },
        resolution,
        verification: {
          finalStatus: updatedMeta.status,
          executionResult: updatedMeta.executionResult,
          outboundMessageType: outbound?.messageType ?? null,
          outboundChannel: outbound?.channel ?? null,
          outboundHasRescheduleLink: hasRescheduleLink,
          outboundPreview: outboundContent.slice(0, 260),
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
