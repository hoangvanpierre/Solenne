"use client";

import { BrandLogo } from "@/components/layout/brand-logo";

export interface AdminBrandLogoProps {
  isVi: boolean;
}

export function AdminBrandLogo({ isVi }: AdminBrandLogoProps) {
  return (
    <BrandLogo
      href="/admin"
      className="group flex items-center gap-2.5 sm:gap-3 transition-opacity hover:opacity-90"
    >
      <span className="font-serif text-xl sm:text-2xl font-normal tracking-[0.04em] text-foreground">
        Solenne
      </span>
      <span className="inline-flex items-center rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground shadow-xs">
        {isVi ? "Quản trị" : "Administration"}
      </span>
    </BrandLogo>
  );
}
