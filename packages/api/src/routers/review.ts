import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";

export const reviewRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }).default({}))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.review.findMany({
        where: { organizationId: ctx.organizationId },
        include: { client: true, appointment: { include: { service: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const reviews = await ctx.prisma.review.findMany({
      where: { organizationId: ctx.organizationId },
      select: { rating: true },
    });
    if (reviews.length === 0) return { averageRating: 0, totalReviews: 0, distribution: [0, 0, 0, 0, 0] };
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    const distribution = [1, 2, 3, 4, 5].map(r => reviews.filter(rev => rev.rating === r).length);
    return { averageRating: Math.round(avg * 10) / 10, totalReviews: reviews.length, distribution };
  }),

  reply: protectedProcedure
    .input(z.object({ reviewId: z.string(), reply: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.review.update({
        where: { id: input.reviewId },
        data: { ownerReply: input.reply, ownerRepliedAt: new Date() },
      });
    }),

  submit: publicProcedure
    .input(z.object({
      appointmentId: z.string(),
      rating: z.number().min(1).max(5),
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const appointment = await ctx.prisma.appointment.findUniqueOrThrow({
        where: { id: input.appointmentId },
      });
      return ctx.prisma.review.create({
        data: {
          organizationId: appointment.organizationId,
          clientId: appointment.clientId,
          appointmentId: input.appointmentId,
          rating: input.rating,
          comment: input.comment,
        },
      });
    }),

  getPublic: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.prisma.organization.findUniqueOrThrow({ where: { slug: input.slug } });
      return ctx.prisma.review.findMany({
        where: { organizationId: org.id, isPublic: true },
        include: { client: { select: { firstName: true } }, appointment: { include: { service: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    }),
});
