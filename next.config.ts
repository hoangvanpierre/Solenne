import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "gsap"],
  },
};

export default withNextIntl(nextConfig);

// Only `next dev` needs the Cloudflare platform proxy (it backs
// `getCloudflareContext()` locally). `next build` and `next typegen` also load
// this config, and running the proxy there made production builds depend on a
// Cloudflare login or `CLOUDFLARE_API_TOKEN` — which hermetic CI must not have.
// See docs/quality/production-readiness.md.
if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}
