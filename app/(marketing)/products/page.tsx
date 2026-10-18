import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { ProductGrid } from "@/components/product";
import { getProducts } from "@/lib/products";

export default async function ProductsPage() {
  const products = await getProducts();
  const locale = await getLocale();
  const isVi = locale === "vi";

  return (
    <div className="py-24 lg:py-32">
      <Container>
        <div className="mb-12">
          <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground">
            {isVi ? "Tất Cả Tác Phẩm Nến Thơm" : "All Candles"}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl leading-relaxed">
            {isVi
              ? "Khám phá toàn bộ bộ sưu tập nến thơm nghệ nhân của Solenne. Mỗi tác phẩm đều được đổ tay thủ công từ sáp đậu nành thiên nhiên thuần khiết và tinh dầu nước hoa thượng hạng."
              : "Explore our complete collection of artisan scented candles. Each piece is hand-poured with natural soy wax and premium fragrance oils."}
          </p>
        </div>
        
        <ProductGrid products={products} />
      </Container>
    </div>
  );
}
