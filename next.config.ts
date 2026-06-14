import type { NextConfig } from "next";

const isCapacitor = process.env.CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = {
  ...(isCapacitor
    ? {
        output: "export",
        images: { unoptimized: true },
      }
    : {
        async headers() {
          return [
            {
              source: "/(.*)",
              headers: [
                {
                  key: "Link",
                  value: '<manifest.json>; rel="manifest"',
                },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
