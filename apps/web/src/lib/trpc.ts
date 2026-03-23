import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@bookai/api";

export const trpc = createTRPCReact<AppRouter>();
