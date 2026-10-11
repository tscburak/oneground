import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal self-contained server in .next/standalone (Docker, npm bin).
  // Docs: dist/docs/.../05-config/01-next-config-js/output.md
  output: "standalone",
  // Never ship dev databases or the local master key: nft statically
  // evaluates the settings-key path at build time and would otherwise copy
  // the maintainer's data/.settings.key into every published bundle.
  // Docs: dist/docs/.../05-config/01-next-config-js/output.md
  outputFileTracingExcludes: {
    "/*": ["data/**/*", "**/*.sqlite*", "**/*.sqlite-*", "**/.settings.key"],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
