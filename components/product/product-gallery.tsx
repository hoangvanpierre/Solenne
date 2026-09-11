"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Expand } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  images: string[];
  productName: string;
}

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  // Use placeholder images if none provided
  const galleryImages = images.length > 0 
    ? images 
    : [
        "/placeholder-1.jpg", 
        "/placeholder-2.jpg", 
        "/placeholder-3.jpg"
      ];
      
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="flex flex-col gap-4 sticky top-24">
      {/* Main Image */}
      <div className="group relative aspect-square overflow-hidden rounded-2xl bg-muted">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-stone-200 to-stone-300"
          >
            {/* Silhouette placeholder for the actual image */}
            <div className="w-1/3 h-1/2 rounded-xl bg-black/5 backdrop-blur-sm" />
          </motion.div>
        </AnimatePresence>

        <button 
          className="absolute bottom-4 right-4 p-2 rounded-full bg-white/50 backdrop-blur-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white"
          aria-label={`Expand ${productName} image`}
        >
          <Expand className="h-5 w-5" />
        </button>
      </div>

      {/* Thumbnails */}
      <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
        {galleryImages.map((img, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            aria-label={`View ${productName} photo ${idx + 1}`}
            className={cn(
              "relative aspect-square w-20 flex-shrink-0 overflow-hidden rounded-xl bg-muted transition-all duration-200",
              activeIndex === idx 
                ? "ring-2 ring-primary ring-offset-2 opacity-100" 
                : "opacity-60 hover:opacity-100"
            )}
          >
             <div className="absolute inset-0 bg-gradient-to-br from-stone-200 to-stone-300" />
          </button>
        ))}
      </div>
    </div>
  );
}
