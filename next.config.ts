import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Standalone output produces a self-contained server bundle (server.js +
	// only the node_modules actually used) — this is what the Dockerfile
	// copies into the runtime image for Porter, instead of shipping the full
	// repo + dev dependencies.
	output: "standalone",
	// Prevent Next.js from bundling these native Node modules used by
	// src/lib/brand/logo.ts (SVG→PNG rasterization + image normalization for
	// canonical logo resolution) — their .node binaries can't go through webpack.
	serverExternalPackages: ["@resvg/resvg-js", "sharp"],
};

export default nextConfig;
