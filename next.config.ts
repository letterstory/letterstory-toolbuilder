import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling these native Node modules used by
  // src/lib/brand/logo.ts (SVG→PNG rasterization + image normalization for
  // canonical logo resolution) — their .node binaries can't go through webpack.
  serverExternalPackages: ["@resvg/resvg-js", "sharp"],
};

export default nextConfig;
