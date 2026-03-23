import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { prisma } from "@bookai/db";

export interface TRPCContext {
  prisma: typeof prisma;
  userId: string | null;
  organizationId: string | null;
}

export async function createTRPCContext(opts: {
  userId?: string | null;
  organizationId?: string | null;
}): Promise<TRPCContext> {
  return {
    prisma,
    userId: opts.userId ?? null,
    organizationId: opts.organizationId ?? null,
  };
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.userId || !ctx.organizationId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);
