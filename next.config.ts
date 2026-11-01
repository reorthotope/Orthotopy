import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the whole site is generated into ./out and can be hosted
  // on any static platform (Cloudflare Pages, GitHub Pages, Netlify…).
  output: "export",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
