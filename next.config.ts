import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
