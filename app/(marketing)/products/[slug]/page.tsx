import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ProductGallery, ProductInfo } from "@/components/product";
import { WishlistProvider } from "@/components/wishlist";
import { getProductBySlug } from "@/lib/products";
import { getWishlistProductIdsForViewer } from "@/lib/wishlist";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  // Same shared store as the grid, so the detail heart and the card hearts
  // never disagree after a save.
  const wishlistIds = await getWishlistProductIdsForViewer();

  return (
    <div className="py-24 lg:py-32">
      <Container>
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-24">
          <ProductGallery 
            images={product.images} 
            productName={product.name} 
          />
          
          <div className="relative z-10 min-w-0 lg:py-12">
            <WishlistProvider initialIds={wishlistIds}>
              <ProductInfo product={product} />
            </WishlistProvider>
          </div>
        </div>
      </Container>
    </div>
  );
}
