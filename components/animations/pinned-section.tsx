"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger);

interface PinnedSectionProps {
  children: React.ReactNode;
  className?: string;
  pinSpacing?: boolean;
  start?: string;
  end?: string;
}

export function PinnedSection({
  children,
  className,
  pinSpacing = true,
  start = "top top",
  end = "bottom bottom",
}: PinnedSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;

      ScrollTrigger.create({
        trigger: section,
        start,
        end,
        pin: true,
        pinSpacing,
        anticipatePin: 1,
      });
    },
    { scope: sectionRef }
  );

  return (
    <div ref={sectionRef} className={cn(className)}>
      {children}
    </div>
  );
}
