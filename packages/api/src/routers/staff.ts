import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getDay } from "date-fns";

export const staffRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.staffMember.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      include: {
        staffServices: { include: { service: true } },
        user: { select: { email: true } },
      },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.staffMember.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: {
          staffServices: { include: { service: true } },
          schedules: { orderBy: { dayOfWeek: "asc" } },
          scheduleOverrides: { orderBy: { date: "asc" } },
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1),
        bio: z.string().optional(),
        serviceIds: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.staffMember.create({
        data: {
          organizationId: ctx.organizationId,
          displayName: input.displayName,
          bio: input.bio,
          staffServices: {
            create: input.serviceIds.map((serviceId) => ({ serviceId })),
          },
        },
      });
    }),

  updateServices: protectedProcedure
    .input(
      z.object({
        staffMemberId: z.string(),
        serviceIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.staffService.deleteMany({
        where: { staffMemberId: input.staffMemberId },
      });

      if (input.serviceIds.length > 0) {
        await ctx.prisma.staffService.createMany({
          data: input.serviceIds.map((serviceId) => ({
            staffMemberId: input.staffMemberId,
            serviceId,
          })),
        });
      }

      return { success: true };
    }),

  getAvailabilityGrid: protectedProcedure
    .input(
      z.object({
        staffMemberId: z.string(),
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const staff = await ctx.prisma.staffMember.findFirstOrThrow({
        where: { id: input.staffMemberId, organizationId: ctx.organizationId },
        include: {
          schedules: true,
          scheduleOverrides: true,
        },
      });

      const appointments = await ctx.prisma.appointment.findMany({
        where: {
          organizationId: ctx.organizationId,
          staffMemberId: input.staffMemberId,
          startTime: { gte: new Date(input.startDate) },
          endTime: { lte: new Date(input.endDate + "T23:59:59") },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        include: { service: true, client: true },
      });

      const days: Array<{
        date: string;
        dayOfWeek: number;
        slots: Array<{
          time: string;
          status: "available" | "booked" | "blocked" | "outside" | "extra";
          appointmentId?: string;
          clientName?: string;
          serviceName?: string;
          overrideId?: string;
          reason?: string;
        }>;
      }> = [];

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const dow = getDay(d);

        const baseSchedule = staff.schedules.find(
          (s) => s.dayOfWeek === dow && s.isAvailable
        );

        const dayOverrides = staff.scheduleOverrides.filter(
          (o) => o.date.toISOString().split("T")[0] === dateStr
        );

        const wholeDayBlock = dayOverrides.find(
          (o) => !o.isAvailable && !o.startTime && !o.endTime
        );
        const slotBlocks = dayOverrides.filter(
          (o) => !o.isAvailable && o.startTime && o.endTime
        );
        const extraOverride = dayOverrides.find(
          (o) => o.isAvailable && o.startTime && o.endTime
        );

        let scheduleStart: number | null = null;
        let scheduleEnd: number | null = null;
        let isExtra = false;

        if (extraOverride) {
          scheduleStart = timeToMin(extraOverride.startTime!);
          scheduleEnd = timeToMin(extraOverride.endTime!);
          isExtra = !baseSchedule;
        }

        if (scheduleStart === null && baseSchedule && !wholeDayBlock) {
          scheduleStart = timeToMin(baseSchedule.startTime);
          scheduleEnd = timeToMin(baseSchedule.endTime);
        }

        const dayAppointments = appointments.filter((a) => {
          const apptDate = a.startTime.toISOString().split("T")[0];
          return apptDate === dateStr;
        });

        const slots: typeof days[0]["slots"] = [];

        for (let m = 6 * 60; m < 22 * 60; m += 30) {
          const time = minToTime(m);

          if (wholeDayBlock) {
            slots.push({
              time,
              status: "blocked",
              overrideId: wholeDayBlock.id,
              reason: wholeDayBlock.reason ?? undefined,
            });
            continue;
          }

          const slotBlock = slotBlocks.find((o) => {
            const blockStart = timeToMin(o.startTime!);
            const blockEnd = timeToMin(o.endTime!);
            return m >= blockStart && m < blockEnd;
          });

          if (slotBlock) {
            slots.push({
              time,
              status: "blocked",
              overrideId: slotBlock.id,
              reason: slotBlock.reason ?? undefined,
            });
            continue;
          }

          const inSchedule =
            scheduleStart !== null &&
            scheduleEnd !== null &&
            m >= scheduleStart &&
            m + 30 <= scheduleEnd;

          if (!inSchedule) {
            slots.push({ time, status: "outside" });
            continue;
          }

          const slotStart = new Date(`${dateStr}T${time}:00`);
          const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

          const bookedAppt = dayAppointments.find((a) => {
            return slotStart < a.endTime && slotEnd > a.startTime;
          });

          if (bookedAppt) {
            const clientName = bookedAppt.client
              ? `${bookedAppt.client.firstName} ${bookedAppt.client.lastName ?? ""}`.trim()
              : undefined;
            slots.push({
              time,
              status: "booked",
              appointmentId: bookedAppt.id,
              clientName,
              serviceName: bookedAppt.service?.name,
            });
          } else {
            slots.push({
              time,
              status: isExtra ? "extra" : "available",
            });
          }
        }

        days.push({ date: dateStr, dayOfWeek: dow, slots });
      }

      return { staffName: staff.displayName, days };
    }),

  createOverride: protectedProcedure
    .input(
      z.object({
        staffMemberId: z.string(),
        date: z.string(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        isAvailable: z.boolean(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isSlotLevel = !!input.startTime && !!input.endTime;

      if (isSlotLevel) {
        const existing = await ctx.prisma.staffScheduleOverride.findFirst({
          where: {
            staffMemberId: input.staffMemberId,
            date: new Date(input.date),
            startTime: input.startTime,
            endTime: input.endTime,
          },
        });

        if (existing) {
          return ctx.prisma.staffScheduleOverride.update({
            where: { id: existing.id },
            data: {
              isAvailable: input.isAvailable,
              reason: input.reason ?? null,
            },
          });
        }

        return ctx.prisma.staffScheduleOverride.create({
          data: {
            staffMemberId: input.staffMemberId,
            date: new Date(input.date),
            startTime: input.startTime!,
            endTime: input.endTime!,
            isAvailable: input.isAvailable,
            reason: input.reason ?? null,
          },
        });
      }

      const existing = await ctx.prisma.staffScheduleOverride.findFirst({
        where: {
          staffMemberId: input.staffMemberId,
          date: new Date(input.date),
          startTime: null,
          endTime: null,
        },
      });

      if (existing) {
        return ctx.prisma.staffScheduleOverride.update({
          where: { id: existing.id },
          data: {
            isAvailable: input.isAvailable,
            reason: input.reason ?? null,
          },
        });
      }

      return ctx.prisma.staffScheduleOverride.create({
        data: {
          staffMemberId: input.staffMemberId,
          date: new Date(input.date),
          startTime: null,
          endTime: null,
          isAvailable: input.isAvailable,
          reason: input.reason ?? null,
        },
      });
    }),

  deleteOverride: protectedProcedure
    .input(z.object({ overrideId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.staffScheduleOverride.delete({
        where: { id: input.overrideId },
      });
      return { success: true };
    }),

  deleteOverrideByDate: protectedProcedure
    .input(
      z.object({
        staffMemberId: z.string(),
        date: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.staffScheduleOverride.deleteMany({
        where: {
          staffMemberId: input.staffMemberId,
          date: new Date(input.date),
        },
      });
      return { success: true };
    }),

  getOverridesForRange: protectedProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.staffScheduleOverride.findMany({
        where: {
          staffMember: { organizationId: ctx.organizationId },
          date: {
            gte: new Date(input.startDate),
            lte: new Date(input.endDate),
          },
          isAvailable: false,
        },
        select: {
          id: true,
          staffMemberId: true,
          date: true,
          startTime: true,
          endTime: true,
          reason: true,
        },
      });
    }),

  updateSchedule: protectedProcedure
    .input(
      z.object({
        staffMemberId: z.string(),
        schedules: z.array(
          z.object({
            dayOfWeek: z.number().min(0).max(6),
            startTime: z.string(),
            endTime: z.string(),
            isAvailable: z.boolean(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.staffSchedule.deleteMany({
        where: { staffMemberId: input.staffMemberId },
      });

      return ctx.prisma.staffSchedule.createMany({
        data: input.schedules.map((s) => ({
          staffMemberId: input.staffMemberId,
          ...s,
        })),
      });
    }),
});

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
