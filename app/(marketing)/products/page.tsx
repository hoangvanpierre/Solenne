import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { TextReveal } from "@/components/animations/text-reveal";
import { ProductGrid } from "@/components/product";
import { WishlistProvider } from "@/components/wishlist";
import { getProducts } from "@/lib/products";
import { getWishlistProductIdsForViewer } from "@/lib/wishlist";
import styles from "./products.module.css";

export default async function ProductsPage() {
  const products = await getProducts();
  const locale = await getLocale();
  const isVi = locale === "vi";
  // Single hydration for every heart on the page (guests cost no query).
  const wishlistIds = await getWishlistProductIdsForViewer();

  return (
    <div className="py-24 lg:py-32">
      <Container>
        <div className={`mb-12 ${styles.header}`}>
          <TextReveal
            as="h1"
            text={isVi ? "Tất cả nến thơm" : "All candles"}
            className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground"
          />
          <ScrollReveal className={styles.intro} delay={0.15}>
            <p className="text-muted-foreground text-sm sm:text-base max-w-2xl leading-relaxed">
              {isVi
                ? "Khám phá bộ sưu tập nến thơm của Solenne. Nến được đổ tay từ sáp đậu nành tự nhiên và tinh dầu không chứa phthalate."
                : "Explore the full Solenne collection. Every candle is hand-poured with natural soy wax and phthalate-free fragrance oils."}
            </p>
          </ScrollReveal>
        </div>

        <WishlistProvider initialIds={wishlistIds}>
          <ProductGrid products={products} />
        </WishlistProvider>
      </Container>
    </div>
  );
}
