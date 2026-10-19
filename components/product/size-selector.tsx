"use client";

import { cn } from "@/lib/utils";
import { useAppLocale } from "@/hooks/use-locale";
import type { ProductVariant } from "@/types";

interface SizeSelectorProps {
  variants: ProductVariant[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function SizeSelector({ variants, selectedId, onSelect }: SizeSelectorProps) {
  const locale = useAppLocale();
  const isVi = locale === "vi";

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-[13px] font-normal text-foreground">
          {isVi ? "Kích cỡ / Dung tích" : "Size"}
        </span>
        {variants.find(v => v.id === selectedId)?.burnTime && (
          <span className="text-[11.5px] tabular-nums text-muted-foreground">
            {isVi
              ? `Thời gian tỏa hương ~${variants.find(v => v.id === selectedId)?.burnTime}`
              : `Approx. ${variants.find(v => v.id === selectedId)?.burnTime} burn time`}
          </span>
        )}
      </div>
      
      <div className="flex flex-wrap gap-3">
        {variants.map((variant) => {
          const isSelected = variant.id === selectedId;
          const isOutOfStock = variant.stockQuantity <= 0;

          return (
            <button
              key={variant.id}
              onClick={() => !isOutOfStock && onSelect(variant.id)}
              disabled={isOutOfStock}
              className={cn(
                "relative flex-1 min-w-[calc(50%-0.375rem)] sm:min-w-[110px] rounded-xl border px-3.5 py-2.5 text-[13px] font-normal transition-all duration-200",
                isSelected
                  ? "border-primary bg-primary/5 text-primary ring-1 ring-primary shadow-sm"
                  : "border-border bg-transparent text-foreground hover:border-primary/50",
                isOutOfStock && "opacity-50 cursor-not-allowed bg-muted hover:border-border"
              )}
            >
              <div className="flex flex-col items-center gap-1">
                <span className="font-normal">{variant.name}</span>
                {variant.size && (
                  <span className={cn(
                    "text-[11.5px] tabular-nums",
                    isSelected ? "text-primary/80" : "text-muted-foreground"
                  )}>
                    {variant.size}
                  </span>
                )}
              </div>
              
              {isOutOfStock && (
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                  <div className="h-px w-[150%] rotate-12 bg-border absolute" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
