import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ProductGallery, ProductInfo } from "@/components/product";
import { ProductReviews } from "@/components/reviews";
import { WishlistProvider } from "@/components/wishlist";
import { getProductBySlug } from "@/lib/products";
import { getProductReviewsPageData } from "@/lib/reviews";
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

  // One server pass for the whole reviews section: published reviews, the
  // aggregate, the viewer's own review, eligibility and report state.
  const reviewData = await getProductReviewsPageData(product.id);

  // Guests are sent to the login form and returned to this section afterwards.
  // The slug comes from the database, and the login action re-validates `next`
  // through sanitizeNextPath().
  const loginHref = `/login?next=${encodeURIComponent(
    `/products/${product.slug}#reviews`
  )}`;

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
              <ProductInfo
                product={product}
                reviewSummary={reviewData.summary}
              />
            </WishlistProvider>
          </div>
        </div>

        <div
          id="reviews"
          className="mt-24 border-t border-border pt-16 lg:mt-32"
        >
          <ProductReviews
            productId={product.id}
            productName={product.name}
            data={reviewData}
            loginHref={loginHref}
          />
        </div>
      </Container>
    </div>
  );
}
