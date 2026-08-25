import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Render runs Central as a regular Node.js service. The standalone
  // artifact avoids loading the Cloudflare Worker-only `cloudflare:` modules
  // from dist/server/index.js during Node startup.
  output: "standalone",
};

export default nextConfig;
