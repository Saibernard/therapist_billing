import { prisma } from "@bookai/db";
import { generateCampaignMessage } from "@bookai/ai/src/campaigns";
import type { Prisma } from "@prisma/client";

interface CampaignRunResult {
  campaignId: string;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Run all active campaigns that are due for execution.
 */
export async function runActiveCampaigns(): Promise<CampaignRunResult[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    include: { organization: true },
  });

  const results: CampaignRunResult[] = [];

  for (const campaign of campaigns) {
    try {
      const result = await executeCampaign(campaign.id);
      results.push(result);
    } catch (err) {
      console.error(`Campaign ${campaign.id} failed:`, err);
      results.push({ campaignId: campaign.id, sent: 0, failed: 1, skipped: 0 });
    }
  }

  return results;
}

/**
 * Execute a single campaign: select eligible clients, generate messages, record executions.
 */
export async function executeCampaign(campaignId: string): Promise<CampaignRunResult> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { organization: true },
  });

  const eligibleClients = await selectEligibleClients(
    campaign.organizationId,
    campaign.type,
    campaign.triggerConfig as Record<string, unknown>,
    campaignId
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const client of eligibleClients) {
    try {
      let message: string;

      if (campaign.useAi) {
        message = await generateCampaignMessage(
          {
            firstName: client.firstName,
            lastName: client.lastName,
            lastVisitAt: client.lastVisitAt,
            totalVisits: client.totalVisits,
            totalSpent: Number(client.totalSpent),
            tags: client.tags,
          },
          {
            businessName: campaign.organization.name,
            campaignType: campaign.type,
            channel: campaign.channel,
            template: campaign.messageTemplate,
          }
        );
      } else {
        message = (campaign.messageTemplate ?? "")
          .replace("{{firstName}}", client.firstName)
          .replace("{{lastName}}", client.lastName ?? "")
          .replace("{{businessName}}", campaign.organization.name);
      }

      // Record the execution (actual sending would integrate with email/sms/whatsapp modules)
      await prisma.campaignExecution.create({
        data: {
          campaignId,
          clientId: client.id,
          status: "SENT",
          message,
          sentAt: new Date(),
        },
      });

      sent++;
    } catch (err) {
      await prisma.campaignExecution.create({
        data: {
          campaignId,
          clientId: client.id,
          status: "FAILED",
          error: err instanceof Error ? err.message : "Unknown error",
        },
      });
      failed++;
    }
  }

  // Update campaign last run
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { lastRunAt: new Date() },
  });

  return { campaignId, sent, failed, skipped };
}

/**
 * Select clients eligible for a campaign based on type and trigger config.
 */
async function selectEligibleClients(
  organizationId: string,
  type: string,
  triggerConfig: Record<string, unknown>,
  campaignId: string
) {
  // Get clients already targeted by this campaign (to avoid duplicates)
  const existingExecutions = await prisma.campaignExecution.findMany({
    where: { campaignId, status: { in: ["SENT", "PENDING"] } },
    select: { clientId: true },
  });
  const alreadySentIds = new Set(existingExecutions.map((e) => e.clientId));

  const now = new Date();

  let clients;

  switch (type) {
    case "BIRTHDAY": {
      const month = now.getMonth() + 1;
      const day = now.getDate();
      // Can't filter by birthday directly without a birthday field — select all and filter
      // For now, select all active clients (birthday filtering would need a birthday field)
      clients = await prisma.client.findMany({
        where: { organizationId },
      });
      break;
    }

    case "WINBACK": {
      const inactiveDays = (triggerConfig.inactiveDays as number) ?? 90;
      const cutoff = new Date(now.getTime() - inactiveDays * 24 * 60 * 60 * 1000);
      clients = await prisma.client.findMany({
        where: {
          organizationId,
          lastVisitAt: { lt: cutoff },
          totalVisits: { gt: 0 },
        },
      });
      break;
    }

    case "POST_VISIT": {
      const withinDays = (triggerConfig.withinDays as number) ?? 1;
      const since = new Date(now.getTime() - withinDays * 24 * 60 * 60 * 1000);
      const recentAppointments = await prisma.appointment.findMany({
        where: {
          organizationId,
          status: "COMPLETED",
          endTime: { gte: since, lte: now },
        },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      const clientIds = recentAppointments.map((a) => a.clientId);
      clients = await prisma.client.findMany({
        where: { id: { in: clientIds } },
      });
      break;
    }

    case "REBOOK_NUDGE": {
      const nudgeDays = (triggerConfig.daysSinceLastVisit as number) ?? 30;
      const cutoff = new Date(now.getTime() - nudgeDays * 24 * 60 * 60 * 1000);
      clients = await prisma.client.findMany({
        where: {
          organizationId,
          lastVisitAt: { lt: cutoff, gt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) },
        },
      });
      break;
    }

    default: {
      // CUSTOM: select all clients
      clients = await prisma.client.findMany({
        where: { organizationId },
      });
    }
  }

  // Filter out already-sent clients
  return clients.filter((c) => !alreadySentIds.has(c.id));
}
