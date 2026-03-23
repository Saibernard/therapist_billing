import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createTRPCContext } from "@bookai/api";
import { auth } from "@/lib/auth";

const handler = async (req: Request) => {
  const session = await auth();

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () =>
      createTRPCContext({
        userId: session?.user?.id ?? null,
        organizationId:
          (session as { organizationId?: string })?.organizationId ?? null,
      }),
  });
};

export { handler as GET, handler as POST };
