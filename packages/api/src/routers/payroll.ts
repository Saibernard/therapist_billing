import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const payrollRouter = router({
  // Get earnings summary for all staff in a date range
  getStaffEarnings: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
        staffMemberId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      end.setHours(23, 59, 59, 999);

      const where: Record<string, unknown> = {
        organizationId: ctx.organizationId,
        status: "COMPLETED",
        startTime: { gte: start },
        endTime: { lte: end },
      };
      if (input.staffMemberId) where.staffMemberId = input.staffMemberId;

      const appointments = await ctx.prisma.appointment.findMany({
        where,
        include: {
          service: { select: { price: true, name: true, durationMinutes: true } },
          staffMember: {
            select: {
              id: true,
              displayName: true,
              commissionRate: true,
              commissionType: true,
              hourlyRate: true,
            },
          },
        },
      });

      // Group by staff member
      const staffMap = new Map<
        string,
        {
          staffMemberId: string;
          displayName: string;
          appointments: number;
          totalRevenue: number;
          commission: number;
          hourlyEarnings: number;
          totalMinutes: number;
        }
      >();

      for (const appt of appointments) {
        const staff = appt.staffMember;
        const existing = staffMap.get(staff.id) ?? {
          staffMemberId: staff.id,
          displayName: staff.displayName,
          appointments: 0,
          totalRevenue: 0,
          commission: 0,
          hourlyEarnings: 0,
          totalMinutes: 0,
        };

        const servicePrice = Number(appt.service.price);
        existing.appointments++;
        existing.totalRevenue += servicePrice;
        existing.totalMinutes += appt.service.durationMinutes;

        // Calculate commission
        if (staff.commissionRate) {
          const rate = Number(staff.commissionRate);
          if (staff.commissionType === "percentage") {
            existing.commission += servicePrice * (rate / 100);
          } else {
            existing.commission += rate; // flat per appointment
          }
        }

        // Calculate hourly earnings
        if (staff.hourlyRate) {
          existing.hourlyEarnings +=
            (appt.service.durationMinutes / 60) * Number(staff.hourlyRate);
        }

        staffMap.set(staff.id, existing);
      }

      return Array.from(staffMap.values()).map((s) => ({
        ...s,
        totalEarnings: s.commission + s.hourlyEarnings,
        totalRevenue: Math.round(s.totalRevenue * 100) / 100,
        commission: Math.round(s.commission * 100) / 100,
        hourlyEarnings: Math.round(s.hourlyEarnings * 100) / 100,
        totalHours: Math.round((s.totalMinutes / 60) * 10) / 10,
      }));
    }),

  // Update staff commission settings
  updateCommission: protectedProcedure
    .input(
      z.object({
        staffMemberId: z.string(),
        commissionRate: z.number().min(0).optional(),
        commissionType: z.enum(["percentage", "flat"]).optional(),
        hourlyRate: z.number().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.staffMember.update({
        where: { id: input.staffMemberId },
        data: {
          commissionRate: input.commissionRate,
          commissionType: input.commissionType,
          hourlyRate: input.hourlyRate,
        },
      });
    }),

  // Generate a payroll report for a period
  generateReport: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      end.setHours(23, 59, 59, 999);

      const staff = await ctx.prisma.staffMember.findMany({
        where: { organizationId: ctx.organizationId, isActive: true },
        select: {
          id: true,
          displayName: true,
          commissionRate: true,
          commissionType: true,
          hourlyRate: true,
        },
      });

      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: "COMPLETED",
          startTime: { gte: start },
          endTime: { lte: end },
        },
        include: {
          service: { select: { price: true, durationMinutes: true } },
        },
      });

      const totalRevenue = appointments.reduce(
        (sum, a) => sum + Number(a.service.price),
        0
      );
      const totalAppointments = appointments.length;

      return {
        period: { start: input.startDate, end: input.endDate },
        staffCount: staff.length,
        totalAppointments,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
      };
    }),
});
