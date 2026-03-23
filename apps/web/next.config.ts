import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@bookai/api",
    "@bookai/db",
    "@bookai/types",
    "@bookai/validators",
    "@bookai/scheduling",
    "@bookai/ai",
    "@bookai/communications",
    "@bookai/utils",
  ],
};

export default nextConfig;
