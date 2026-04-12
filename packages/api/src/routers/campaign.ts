import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import type { Prisma } from "@prisma/client";

export const campaignRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.campaign.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        _count: { select: { executions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.campaign.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: {
          executions: {
            include: { client: true },
            orderBy: { createdAt: "desc" },
            take: 100,
          },
          _count: {
            select: {
              executions: { where: { status: "SENT" } },
            },
          },
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(["BIRTHDAY", "WINBACK", "POST_VISIT", "REBOOK_NUDGE", "CUSTOM"]),
        channel: z.enum(["EMAIL", "SMS", "WHATSAPP"]).default("EMAIL"),
        messageTemplate: z.string().optional(),
        useAi: z.boolean().default(true),
        triggerConfig: z.record(z.string(), z.unknown()).default({}),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.campaign.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          type: input.type,
          channel: input.channel,
          messageTemplate: input.messageTemplate,
          useAi: input.useAi,
          triggerConfig: input.triggerConfig ? JSON.stringify(input.triggerConfig) : "{}",
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          name: z.string().min(1).optional(),
          status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]).optional(),
          channel: z.enum(["EMAIL", "SMS", "WHATSAPP"]).optional(),
          messageTemplate: z.string().optional(),
          useAi: z.boolean().optional(),
          triggerConfig: z.record(z.string(), z.unknown()).optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {};
      if (input.data.name !== undefined) updateData.name = input.data.name;
      if (input.data.status !== undefined) updateData.status = input.data.status;
      if (input.data.channel !== undefined) updateData.channel = input.data.channel;
      if (input.data.messageTemplate !== undefined) updateData.messageTemplate = input.data.messageTemplate;
      if (input.data.useAi !== undefined) updateData.useAi = input.data.useAi;
      if (input.data.triggerConfig !== undefined)
        updateData.triggerConfig = JSON.stringify(input.data.triggerConfig);

      return ctx.prisma.campaign.update({
        where: { id: input.id },
        data: updateData,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.campaign.delete({
        where: { id: input.id },
      });
    }),

  // Get execution stats for a campaign
  getStats: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [sent, failed, pending] = await Promise.all([
        ctx.prisma.campaignExecution.count({
          where: { campaignId: input.id, status: "SENT" },
        }),
        ctx.prisma.campaignExecution.count({
          where: { campaignId: input.id, status: "FAILED" },
        }),
        ctx.prisma.campaignExecution.count({
          where: { campaignId: input.id, status: "PENDING" },
        }),
      ]);
      return { sent, failed, pending, total: sent + failed + pending };
    }),
});
