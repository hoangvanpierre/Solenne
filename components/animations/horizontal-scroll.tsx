"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger);

interface HorizontalScrollProps {
  children: React.ReactNode;
  className?: string;
}

export function HorizontalScroll({
  children,
  className,
}: HorizontalScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const container = containerRef.current;
      const scrollContent = scrollRef.current;
      if (!container || !scrollContent) return;

      // Disable on mobile
      const mm = gsap.matchMedia();

      mm.add("(min-width: 768px)", () => {
        const scrollWidth =
          scrollContent.scrollWidth - container.offsetWidth;

        gsap.to(scrollContent, {
          x: -scrollWidth,
          ease: "none",
          scrollTrigger: {
            trigger: container,
            start: "top top",
            end: () => `+=${scrollWidth}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            anticipatePin: 1,
          },
        });
      });

      return () => mm.revert();
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className={cn("relative overflow-hidden", className)}>
      <div ref={scrollRef} className="flex gap-8 will-change-transform">
        {children}
      </div>
    </div>
  );
}
