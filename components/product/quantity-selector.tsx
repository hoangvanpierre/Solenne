"use client";

import { Minus, Plus } from "lucide-react";

interface QuantitySelectorProps {
  quantity: number;
  onQuantityChange: (qty: number) => void;
  max?: number;
}

export function QuantitySelector({ 
  quantity, 
  onQuantityChange, 
  max = 10 
}: QuantitySelectorProps) {
  
  const handleDecrease = () => {
    if (quantity > 1) onQuantityChange(quantity - 1);
  };

  const handleIncrease = () => {
    if (quantity < max) onQuantityChange(quantity + 1);
  };

  return (
    <div className="flex h-10 w-28 items-center justify-between rounded-full border border-border px-2.5">
      <button
        type="button"
        onClick={handleDecrease}
        disabled={quantity <= 1}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
        aria-label="Decrease quantity"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      
      <span className="w-8 text-center text-[13px] font-normal tabular-nums">
        {quantity}
      </span>
      
      <button
        type="button"
        onClick={handleIncrease}
        disabled={quantity >= max}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
