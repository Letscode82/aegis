/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Trace files from the monorepo root so output bundles include workspace deps.
    outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  },
  // Workspace packages ship as source (.js/.jsx). Let Next.js transpile them.
  transpilePackages: ["@aegis/ui", "@aegis/ai", "@aegis/intake"],
  eslint: {
    // We run ESLint via turbo; don't block production builds on lint.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
