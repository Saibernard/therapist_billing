import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const locationRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.location.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        _count: {
          select: {
            staffMemberLocations: true,
            appointments: true,
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.location.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: {
          staffMemberLocations: {
            include: { staffMember: true },
          },
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        timezone: z.string().optional(),
        isPrimary: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.isPrimary) {
        // Unset any existing primary
        await ctx.prisma.location.updateMany({
          where: { organizationId: ctx.organizationId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return ctx.prisma.location.create({
        data: {
          organizationId: ctx.organizationId,
          ...input,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          name: z.string().min(1).optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          zipCode: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().email().optional(),
          timezone: z.string().optional(),
          isPrimary: z.boolean().optional(),
          isActive: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.data.isPrimary) {
        await ctx.prisma.location.updateMany({
          where: { organizationId: ctx.organizationId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return ctx.prisma.location.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.location.update({
        where: { id: input.id },
        data: { isActive: false },
      });
    }),

  assignStaff: protectedProcedure
    .input(
      z.object({
        locationId: z.string(),
        staffMemberIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Replace all staff assignments for this location
      await ctx.prisma.staffMemberLocation.deleteMany({
        where: { locationId: input.locationId },
      });

      if (input.staffMemberIds.length > 0) {
        await ctx.prisma.staffMemberLocation.createMany({
          data: input.staffMemberIds.map((staffMemberId) => ({
            staffMemberId,
            locationId: input.locationId,
          })),
        });
      }

      return { success: true };
    }),
});
