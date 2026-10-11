import Image from "next/image";
import { getOptimizedProductImage } from "@/lib/product-images";
import { cn } from "@/lib/utils";

export interface ProductPictureProps {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  loading?: "eager" | "lazy";
  className?: string;
  fill?: boolean;
  style?: React.CSSProperties;
}

export function ProductPicture({
  src,
  alt,
  sizes,
  priority = false,
  loading,
  className,
  fill = true,
  style,
}: ProductPictureProps) {
  const optimized = getOptimizedProductImage(src);

  if (optimized) {
    const isEager = priority || loading === "eager";
    return (
      <picture className="contents">
        <source type="image/avif" srcSet={optimized.avifSrcSet} sizes={sizes} />
        <source type="image/webp" srcSet={optimized.webpSrcSet} sizes={sizes} />
        <img
          src={optimized.fallbackSrc}
          alt={alt}
          loading={isEager ? "eager" : "lazy"}
          fetchPriority={isEager ? "high" : "auto"}
          decoding={isEager ? "sync" : "async"}
          style={{ ...(fill ? { height: "100%", width: "100%" } : undefined), ...style }}
          className={cn(fill && "absolute inset-0 h-full w-full object-cover", className)}
        />
      </picture>
    );
  }

  // Graceful fallback to Next.js Image for unoptimized/external image sources
  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      priority={priority}
      loading={loading}
      sizes={sizes}
      className={className}
      style={style}
    />
  );
}
