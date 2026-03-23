import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { generateCompetitiveReport, getCompetitorDetails } from "@bookai/ai";

export const competitiveRouter = router({
  report: protectedProcedure
    .input(
      z
        .object({
          radiusKm: z.number().min(1).max(50).default(8),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return generateCompetitiveReport(
        ctx.organizationId,
        input?.radiusKm ?? 8
      );
    }),

  competitorDetail: protectedProcedure
    .input(z.object({ placeId: z.string() }))
    .query(async ({ input }) => {
      return getCompetitorDetails(input.placeId);
    }),

  updateCategory: protectedProcedure
    .input(z.object({ category: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.organization.update({
        where: { id: ctx.organizationId },
        data: { category: input.category },
      });
      return { success: true };
    }),
});
