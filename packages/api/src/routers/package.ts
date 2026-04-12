import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const packageRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.package.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      include: {
        _count: {
          select: {
            clientPackages: { where: { status: "ACTIVE" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.package.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: {
          clientPackages: {
            include: { client: true },
            orderBy: { createdAt: "desc" },
          },
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["VISIT_PACK", "MEMBERSHIP"]),
        price: z.number().min(0),
        totalVisits: z.number().int().min(1).optional(),
        validDays: z.number().int().min(1).optional(),
        billingInterval: z.enum(["monthly", "yearly"]).optional(),
        includedVisits: z.number().int().min(1).optional(),
        serviceIds: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.package.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          description: input.description,
          type: input.type,
          price: input.price,
          totalVisits: input.totalVisits,
          validDays: input.validDays,
          billingInterval: input.billingInterval,
          includedVisits: input.includedVisits,
          serviceIds: input.serviceIds,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          price: z.number().min(0).optional(),
          totalVisits: z.number().int().min(1).optional(),
          validDays: z.number().int().min(1).optional(),
          isActive: z.boolean().optional(),
          serviceIds: z.array(z.string()).optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.package.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.package.update({
        where: { id: input.id },
        data: { isActive: false },
      });
    }),

  assignToClient: protectedProcedure
    .input(
      z.object({
        packageId: z.string(),
        clientId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pkg = await ctx.prisma.package.findFirstOrThrow({
        where: { id: input.packageId, organizationId: ctx.organizationId },
      });

      const expiryDate = pkg.validDays
        ? new Date(Date.now() + pkg.validDays * 24 * 60 * 60 * 1000)
        : null;

      return ctx.prisma.clientPackage.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: input.clientId,
          packageId: input.packageId,
          visitsTotal: pkg.totalVisits,
          expiryDate,
        },
      });
    }),

  getClientPackages: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.clientPackage.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId: input.clientId,
        },
        include: { package: true },
        orderBy: { createdAt: "desc" },
      });
    }),

  deductVisit: protectedProcedure
    .input(z.object({ clientPackageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cp = await ctx.prisma.clientPackage.findFirstOrThrow({
        where: {
          id: input.clientPackageId,
          organizationId: ctx.organizationId,
          status: "ACTIVE",
        },
      });

      if (cp.visitsTotal && cp.visitsUsed >= cp.visitsTotal) {
        throw new Error("No visits remaining in this package");
      }

      const updated = await ctx.prisma.clientPackage.update({
        where: { id: cp.id },
        data: { visitsUsed: { increment: 1 } },
      });

      if (updated.visitsTotal && updated.visitsUsed >= updated.visitsTotal) {
        await ctx.prisma.clientPackage.update({
          where: { id: cp.id },
          data: { status: "EXPIRED" },
        });
      }

      return updated;
    }),

  pauseMembership: protectedProcedure
    .input(z.object({ clientPackageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.clientPackage.update({
        where: { id: input.clientPackageId },
        data: { status: "PAUSED" },
      });
    }),

  cancelMembership: protectedProcedure
    .input(z.object({ clientPackageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.clientPackage.update({
        where: { id: input.clientPackageId },
        data: { status: "CANCELLED" },
      });
    }),
});
