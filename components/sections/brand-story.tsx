"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger);

const LINES = [
  "Crafted with intention.",
  "Born from nature.",
  "Made for moments of peace.",
];

export function BrandStory() {
  const containerRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement[]>([]);

  useGSAP(
    () => {
      const container = containerRef.current;
      if (!container) return;

      // Each line animates from dim to full opacity as scroll progresses
      linesRef.current.forEach((line, i) => {
        gsap.fromTo(
          line,
          { opacity: 0.15, y: 20 },
          {
            opacity: 1,
            y: 0,
            ease: "power2.out",
            scrollTrigger: {
              trigger: container,
              start: `${(i * 30) + 10}% center`,
              end: `${(i * 30) + 30}% center`,
              scrub: 1,
            },
          }
        );
      });
    },
    { scope: containerRef }
  );

  return (
    <section
      ref={containerRef}
      className="relative min-h-[250vh] flex items-start justify-center bg-background"
    >
      <div className="sticky top-0 flex h-screen w-full items-center justify-center px-4">
        <div className="max-w-4xl text-center space-y-6">
          {LINES.map((line, i) => (
            <div
              key={i}
              ref={(el) => {
                if (el) linesRef.current[i] = el;
              }}
              className="opacity-[0.15]"
            >
              <p className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-semibold text-foreground leading-tight">
                {line}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
