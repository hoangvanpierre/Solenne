import dynamic from "next/dynamic";
import { Hero } from "@/components/sections/hero";

// Dynamically import below-the-fold components to reduce initial JS bundle
const BrandStory = dynamic(() => import("@/components/sections/brand-story").then(mod => mod.BrandStory), { ssr: true });
const FeaturedProducts = dynamic(() => import("@/components/sections/featured-products").then(mod => mod.FeaturedProducts), { ssr: true });
const CraftSection = dynamic(() => import("@/components/sections/craft-section").then(mod => mod.CraftSection), { ssr: true });
const ScentExplorer = dynamic(() => import("@/components/sections/scent-explorer").then(mod => mod.ScentExplorer), { ssr: true });
const Testimonials = dynamic(() => import("@/components/sections/testimonials").then(mod => mod.Testimonials), { ssr: true });
const Newsletter = dynamic(() => import("@/components/sections/newsletter").then(mod => mod.Newsletter), { ssr: true });

export default function HomePage() {
  return (
    <>
      <Hero />
      <BrandStory />
      <FeaturedProducts />
      <CraftSection />
      <ScentExplorer />
      <Testimonials />
      <Newsletter />
    </>
  );
}
