import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@napi-rs/canvas"],
  async headers() {
    if (process.env.NODE_ENV !== "production") {
      return [];
    }
    return [
      // HTML + app routes: never cache (Safari/iPad keeps stale HTML after deploy → missing CSS)
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
      // Hashed build assets — long cache (listed after so this wins for /_next/static)
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
