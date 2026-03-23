import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { generateCoachInsights } from "@bookai/ai";

export const insightsRouter = router({
  coach: protectedProcedure.query(async ({ ctx }) => {
    return generateCoachInsights(ctx.organizationId);
  }),

  executeAction: protectedProcedure
    .input(
      z.object({
        insightId: z.string(),
        actionType: z.string(),
        payload: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Route actions to the appropriate handler
      switch (input.actionType) {
        case "fill_empty_slots": {
          const slots = (input.payload?.slots ?? []) as Array<{
            date: string;
            staffId: string;
            staffName: string;
          }>;

          // Find at-risk clients who could fill these slots
          const atRiskClients = await ctx.prisma.client.findMany({
            where: {
              organizationId: ctx.organizationId,
              totalVisits: { gte: 1 },
              lastVisitAt: {
                lte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
              },
            },
            take: 10,
            orderBy: { totalSpent: "desc" },
          });

          return {
            success: true,
            action: "fill_empty_slots",
            message: `Ready to contact ${atRiskClients.length} clients about ${slots.length} open slots. The AI will send personalized offers via their preferred channel.`,
            details: {
              clientCount: atRiskClients.length,
              slotCount: slots.length,
              clients: atRiskClients.map((c) => ({
                id: c.id,
                name: `${c.firstName} ${c.lastName ?? ""}`.trim(),
                channel: c.preferredChannel,
              })),
            },
          };
        }

        case "winback_campaign": {
          const clientIds = (input.payload?.clientIds ?? []) as string[];
          const clients = await ctx.prisma.client.findMany({
            where: {
              id: { in: clientIds },
              organizationId: ctx.organizationId,
            },
          });

          return {
            success: true,
            action: "winback_campaign",
            message: `Win-back campaign ready for ${clients.length} client${clients.length > 1 ? "s" : ""}. The AI will send a personalized "we miss you" message with a special offer.`,
            details: {
              clientCount: clients.length,
              clients: clients.map((c) => ({
                id: c.id,
                name: `${c.firstName} ${c.lastName ?? ""}`.trim(),
                channel: c.preferredChannel,
              })),
            },
          };
        }

        case "referral_campaign": {
          const targetClients = (input.payload?.targetClients ?? []) as string[];
          return {
            success: true,
            action: "referral_campaign",
            message: `Referral campaign ready for ${targetClients.length} loyal clients. Each will get a personalized message with a shareable booking link.`,
            details: { clientCount: targetClients.length },
          };
        }

        case "add_saturday_slots":
          return {
            success: true,
            action: "add_saturday_slots",
            message:
              "I'll open this in your staff schedule editor. Add your preferred Saturday hours and save — the booking page will show them immediately.",
            details: { redirect: "/dashboard/staff" },
          };

        case "optimize_schedule":
          return {
            success: true,
            action: "optimize_schedule",
            message:
              "Based on your booking patterns, consider tightening your availability to your peak hours and running a 10% discount for off-peak times.",
            details: { redirect: "/dashboard/staff" },
          };

        case "review_pricing":
          return {
            success: true,
            action: "review_pricing",
            message:
              "At 90%+ utilization, you have pricing power. Consider a 10-15% increase on your most popular services — most clients won't notice, but your revenue will.",
            details: { redirect: "/dashboard/services" },
          };

        case "enable_deposits":
          return {
            success: true,
            action: "enable_deposits",
            message:
              "Deposits reduce no-shows by up to 80%. I recommend requiring a $10-25 deposit for new clients or clients with prior no-shows.",
            details: { redirect: "/dashboard/settings" },
          };

        case "revenue_boost":
          return {
            success: true,
            action: "revenue_boost",
            message:
              "I can send a flash promotion to clients who haven't booked this week. A limited-time 15% off for bookings in the next 3 days typically fills 2-4 extra slots.",
            details: {},
          };

        default:
          return {
            success: false,
            action: input.actionType,
            message: "Unknown action type.",
            details: {},
          };
      }
    }),

  askAdvisor: protectedProcedure
    .input(z.object({ question: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      // Build context data for the advisor
      const [insights, org, serviceCount, clientCount, staffCount] =
        await Promise.all([
          generateCoachInsights(ctx.organizationId),
          ctx.prisma.organization.findUnique({
            where: { id: ctx.organizationId },
          }),
          ctx.prisma.service.count({
            where: { organizationId: ctx.organizationId, isActive: true },
          }),
          ctx.prisma.client.count({
            where: { organizationId: ctx.organizationId },
          }),
          ctx.prisma.staffMember.count({
            where: { organizationId: ctx.organizationId, isActive: true },
          }),
        ]);

      // Build a data-rich prompt for the advisor
      const dataContext = `
BUSINESS DATA FOR ${org?.name ?? "this business"}:
- Revenue this week: $${insights.revenue.thisWeek}
- Revenue last week: $${insights.revenue.lastWeek}
- Revenue this month (30d): $${insights.revenue.thisMonth}
- Revenue last month (30d): $${insights.revenue.lastMonth}
- Projected week revenue: $${insights.revenue.projected}
- Average revenue per appointment: $${insights.revenue.perSlotAvg}
- Weekly utilization: ${insights.weeklyUtilization}%
- Total clients: ${clientCount}
- Active services: ${serviceCount}
- Active staff: ${staffCount}
- At-risk clients: ${insights.atRiskClients.length}
- Open hours this week: ${insights.emptySlots.reduce((s, e) => s + e.openHours, 0)}h
- Busiest day: ${insights.peakAnalysis.busiestDay}
- Busiest hour: ${insights.peakAnalysis.busiestHour}
- Quietest day: ${insights.peakAnalysis.quietestDay}
- Quietest hour: ${insights.peakAnalysis.quietestHour}
${insights.peakAnalysis.saturdayDemandMultiplier ? `- Saturday demand: ${insights.peakAnalysis.saturdayDemandMultiplier}x weekday average` : ""}
- Top services: ${insights.topServices.map((s) => `${s.name} (${s.bookings} bookings, $${s.revenue})`).join(", ")}
`;

      // Use OpenAI if available, otherwise build a rule-based response
      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY || "placeholder",
        });

        if (!process.env.OPENAI_API_KEY) {
          throw new Error("No API key");
        }

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.7,
          max_tokens: 600,
          messages: [
            {
              role: "system",
              content: `You are a world-class business advisor for small service businesses (personal trainers, salons, wellness practitioners). You have deep expertise in pricing strategy, client retention, scheduling optimization, and revenue growth.

You have access to the business's real data. Give specific, actionable, data-backed advice. Include actual numbers and projected outcomes. Be direct and confident — you're the $10K/month consultant they can't normally afford.

Keep answers concise (3-5 sentences). Use specific numbers from their data. End with a clear recommendation.

${dataContext}`,
            },
            { role: "user", content: input.question },
          ],
        });

        return {
          answer:
            completion.choices[0]?.message?.content ??
            "I couldn't generate a response right now.",
          dataUsed: true,
        };
      } catch {
        // Fallback: generate a data-driven response without OpenAI
        const q = input.question.toLowerCase();

        if (q.includes("saturday") || q.includes("weekend")) {
          const sat = insights.peakAnalysis.saturdayDemandMultiplier;
          return {
            answer: sat
              ? `Based on your last 3 months — Saturday has ${sat}x the demand of your average weekday. Adding 2 slots at $${insights.revenue.perSlotAvg} each would generate ~$${Math.round(insights.revenue.perSlotAvg * 2 * 4)}/month in new revenue. Yes, I'd add them.`
              : `I don't have enough Saturday booking data yet to give you a strong recommendation. Try adding 1-2 Saturday slots for a month as a test — if they fill consistently, make it permanent.`,
            dataUsed: true,
          };
        }

        if (q.includes("price") || q.includes("pricing") || q.includes("raise") || q.includes("charge")) {
          return {
            answer: `Your utilization is at ${insights.weeklyUtilization}%. ${insights.weeklyUtilization > 75 ? `At this level, you have pricing power. A 10-15% increase on your top service would add ~$${Math.round(insights.topServices[0]?.revenue * 0.1 || 0)}/month with minimal client loss. Most clients won't switch providers over $5-10.` : `Your utilization is still building, so I'd hold prices steady for now and focus on filling your schedule first. Once you're consistently above 75%, that's your signal to raise prices.`}`,
            dataUsed: true,
          };
        }

        if (q.includes("slot") || q.includes("schedule") || q.includes("hours") || q.includes("availability")) {
          return {
            answer: `Your busiest time is ${insights.peakAnalysis.busiestDay}s around ${insights.peakAnalysis.busiestHour}. Your quietest is ${insights.peakAnalysis.quietestDay}s around ${insights.peakAnalysis.quietestHour}. You have ${insights.emptySlots.reduce((s, e) => s + e.openHours, 0)} open hours this week. Consider tightening your availability window to ${insights.peakAnalysis.busiestDay}-focused blocks, and offering a 10% off-peak discount for ${insights.peakAnalysis.quietestDay} slots to improve utilization.`,
            dataUsed: true,
          };
        }

        return {
          answer: `Here's your snapshot: $${insights.revenue.thisWeek} revenue this week (${insights.revenue.thisWeek >= insights.revenue.lastWeek ? "up" : "down"} from $${insights.revenue.lastWeek} last week), ${insights.weeklyUtilization}% utilization, ${insights.atRiskClients.length} at-risk clients. Your top service is ${insights.topServices[0]?.name ?? "still building data"}. Ask me something specific — pricing, scheduling, growth, retention — and I'll give you a data-backed recommendation.`,
          dataUsed: true,
        };
      }
    }),
});
