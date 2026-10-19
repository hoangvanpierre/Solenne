"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Expand } from "lucide-react";
import { ProductPicture } from "@/components/product/product-picture";
import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  images: string[];
  productName: string;
}

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const hasImages = images && images.length > 0;
  const galleryImages = hasImages ? images : [];
      
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="relative z-0 flex min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
      {/* Main Image */}
      <div className="group relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-muted">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-stone-200 to-stone-300"
          >
            {hasImages ? (
              <ProductPicture
                src={galleryImages[activeIndex]}
                alt={`${productName} - photo ${activeIndex + 1}`}
                fill
                priority={activeIndex === 0}
                loading={activeIndex === 0 ? "eager" : "lazy"}
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            ) : (
              /* Silhouette placeholder for the actual image */
              <div className="w-1/3 h-1/2 rounded-xl bg-black/5 backdrop-blur-sm" />
            )}
          </motion.div>
        </AnimatePresence>

        <button 
          className="absolute bottom-4 right-4 z-10 p-2 rounded-full bg-white/50 backdrop-blur-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white"
          aria-label={`Expand ${productName} image`}
        >
          <Expand className="h-5 w-5" />
        </button>
      </div>

      {/* Thumbnails */}
      {galleryImages.length > 1 && (
        <div className="flex w-full gap-4 overflow-x-auto pb-2 hide-scrollbar">
          {galleryImages.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIndex(idx)}
              aria-label={`View ${productName} photo ${idx + 1}`}
              className={cn(
                "relative aspect-[3/4] w-20 flex-shrink-0 overflow-hidden rounded-xl bg-muted transition-all duration-200",
                activeIndex === idx
                  ? "ring-2 ring-primary ring-offset-2 opacity-100"
                  : "opacity-60 hover:opacity-100"
              )}
            >
              {hasImages ? (
                <ProductPicture
                  src={img}
                  alt={`${productName} thumbnail ${idx + 1}`}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-stone-200 to-stone-300" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
