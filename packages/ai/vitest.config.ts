import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@bookai/db": path.resolve(__dirname, "src/__tests__/mocks/db.ts"),
      "@bookai/scheduling": path.resolve(__dirname, "src/__tests__/mocks/scheduling.ts"),
      "@bookai/utils": path.resolve(__dirname, "src/__tests__/mocks/utils.ts"),
    },
  },
});
