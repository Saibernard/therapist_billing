import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getGoogleAuthUrl } from "@bookai/scheduling";

export const calendarSyncRouter = router({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const sync = await ctx.prisma.calendarSync.findFirst({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
    });

    if (!sync) return { connected: false as const };

    return {
      connected: true as const,
      provider: sync.provider,
      calendarId: sync.calendarId,
      syncDirection: sync.syncDirection,
      lastSyncAt: sync.lastSyncAt,
      isActive: sync.isActive,
    };
  }),

  getConnectUrl: protectedProcedure
    .input(z.object({ staffMemberId: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const redirectUri = `${baseUrl}/api/auth/google-calendar`;
      const state = [ctx.userId, ctx.organizationId, input?.staffMemberId ?? ""].join("_");
      return { url: getGoogleAuthUrl(redirectUri, state) };
    }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.calendarSync.updateMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
      data: { isActive: false },
    });
    return { success: true };
  }),

  updateDirection: protectedProcedure
    .input(
      z.object({
        direction: z.enum(["ONE_WAY_PUSH", "ONE_WAY_PULL", "TWO_WAY"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.calendarSync.updateMany({
        where: { organizationId: ctx.organizationId, userId: ctx.userId },
        data: { syncDirection: input.direction },
      });
    }),
});
