import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["auslaw-mcp"],
  allowedDevOrigins: ["http://richeyserver:3002"],
};

export default nextConfig;
