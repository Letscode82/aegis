/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Trace files from the monorepo root so output bundles include workspace deps.
    outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
    // Force-include the Prisma query engine binaries in the serverless
    // function bundle. Next.js's tracer doesn't follow Prisma's runtime
    // fs.readFileSync(<engine.so.node>) — the binary is loaded at engine
    // init by path, not via require() — so the .so.node files are
    // missing from the bundle without an explicit include.
    //
    // Symptom on Vercel without this:
    //   PrismaClientInitializationError: Prisma Client could not locate
    //   the Query Engine for runtime "rhel-openssl-3.0.x"
    //
    // Reference: https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel
    //
    // pnpm hoists @prisma/client into .pnpm/<package>@<version_hash>/...
    // so the glob has to allow for the version-hash directory.
    // We include both:
    //   .prisma/client/  — generated client output (the .so.node files)
    //   @prisma/client/  — the runtime that loads them
    // for every API route, since /api/auth/*, /api/intake/*, and any
    // future /api/<module>/* path eventually queries Postgres through
    // @aegis/db.
    outputFileTracingIncludes: {
      "/api/**/*": [
        "../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*",
        "../../node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/**/*",
      ],
    },
  },
  // Workspace packages ship as source (.js/.jsx/.ts). Let Next.js transpile them.
  transpilePackages: ["@aegis/ui", "@aegis/ai", "@aegis/intake", "@aegis/db", "@aegis/auth"],
  eslint: {
    // We run ESLint via turbo; don't block production builds on lint.
    ignoreDuringBuilds: true,
  },
  webpack: (config, { webpack }) => {
    // pdfkit → fontkit → restructure do a *guarded optional* require of
    // `iconv-lite` (only for exotic string encodings we never hit):
    //   try { iconv = require('iconv-lite'); } catch {}
    // iconv-lite isn't installed, so it's a no-op at runtime — but
    // webpack tries to statically resolve the bare require and fails the
    // production build with "Module not found: Can't resolve 'iconv-lite'"
    // (surfaced on Vercel, where pnpm's strict node_modules can't hoist a
    // phantom dep). Tell webpack to ignore the optional module; the
    // try/catch handles its absence exactly as it does today.
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^iconv-lite$/ }),
    );
    return config;
  },
};

export default nextConfig;
