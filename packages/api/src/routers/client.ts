import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { createClientSchema, updateClientSchema } from "@bookai/validators";

function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags as string[];
  return [];
}

export const clientRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        organizationId: ctx.organizationId,
      };

      if (input.search) {
        where.OR = [
          { firstName: { contains: input.search } },
          { lastName: { contains: input.search } },
          { email: { contains: input.search } },
          { phone: { contains: input.search } },
        ];
      }

      const clients = await ctx.prisma.client.findMany({
        where,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (clients.length > input.limit) {
        const next = clients.pop();
        nextCursor = next?.id;
      }

      const parsed = clients.map((c) => ({
        ...c,
        tags: parseTags(c.tags),
      }));

      return { clients: parsed, nextCursor };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const client = await ctx.prisma.client.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: {
          appointments: {
            take: 10,
            orderBy: { startTime: "desc" },
            include: { service: true, staffMember: true },
          },
        },
      });
      return { ...client, tags: parseTags(client.tags) };
    }),

  create: protectedProcedure
    .input(createClientSchema)
    .mutation(async ({ ctx, input }) => {
      const { tags, ...rest } = input;
      return ctx.prisma.client.create({
        data: {
          ...rest,
          tags: tags ?? [],
          organizationId: ctx.organizationId,
        },
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: updateClientSchema }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.client.update({
        where: { id: input.id },
        data: input.data,
      });
    }),
});
