import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { getAvailableSlots } from "@bookai/scheduling";

export const availabilityRouter = router({
  getSlots: publicProcedure
    .input(
      z.object({
        organizationId: z.string(),
        serviceId: z.string(),
        staffMemberId: z.string().optional(),
        date: z.string(),
        timezone: z.string().default("America/New_York"),
      })
    )
    .query(async ({ input }) => {
      return getAvailableSlots({
        organizationId: input.organizationId,
        serviceId: input.serviceId,
        staffMemberId: input.staffMemberId,
        date: input.date,
        timezone: input.timezone,
      });
    }),

  getMultipleDays: protectedProcedure
    .input(
      z.object({
        serviceId: z.string(),
        staffMemberId: z.string().optional(),
        startDate: z.string(),
        days: z.number().min(1).max(14).default(7),
      })
    )
    .query(async ({ ctx, input }) => {
      const org = await ctx.prisma.organization.findUniqueOrThrow({
        where: { id: ctx.organizationId },
      });

      const results: Record<string, Awaited<ReturnType<typeof getAvailableSlots>>> = {};
      const start = new Date(input.startDate);

      for (let i = 0; i < input.days; i++) {
        const date = new Date(start);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];

        results[dateStr] = await getAvailableSlots({
          organizationId: ctx.organizationId,
          serviceId: input.serviceId,
          staffMemberId: input.staffMemberId,
          date: dateStr,
          timezone: org.timezone,
        });
      }

      return results;
    }),
});
