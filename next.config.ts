import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'epub2'],
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
