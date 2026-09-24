/** @type {import('next').NextConfig} */
const isMobile = process.env.BUILD_TARGET === "capacitor";

const nextConfig = {
  reactStrictMode: true,
  ...(isMobile
    ? {
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

module.exports = nextConfig;
