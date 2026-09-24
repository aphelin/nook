import path from "node:path";
import type { NextConfig } from "next";

// In local dev the browser talks to Next on :3000; forward /api to the Nest server.
// Under Docker, nginx routes /api before requests ever reach Next.
const API_DEV_URL = process.env.API_DEV_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  // Trace from the monorepo root so workspace packages land in the standalone bundle.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_DEV_URL}/api/:path*` }];
  },
};

export default nextConfig;
