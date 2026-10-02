import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [{ source: "/imagery/2024/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? "127.0.0.1").split(",").map(host => host.trim()).filter(Boolean),
};
export default nextConfig;
