import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx"],
  typedRoutes: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
