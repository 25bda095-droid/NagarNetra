import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // lets a phone on the same Wi-Fi load the dev server (npm run dev -- -H 0.0.0.0)
  allowedDevOrigins: ["10.0.11.12"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
