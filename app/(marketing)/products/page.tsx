import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { ProductGrid } from "@/components/product";
import { getProducts } from "@/lib/products";

interface ProductsPageProps {
  searchParams?: Promise<{
    category?: string;
    sort?: string;
    search?: string;
    q?: string;
  }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = searchParams ? await searchParams : {};
  let products = await getProducts();
  const locale = await getLocale();
  const isVi = locale === "vi";

  // Filter by category if provided (e.g. ?category=woody or ?category=candles)
  if (params.category && params.category !== "all" && params.category !== "candles") {
    const targetCat = params.category.toLowerCase();
    products = products.filter(
      (p) => p.category.toLowerCase() === targetCat
    );
  }

  // Filter by search query if provided (e.g. ?q=amber or ?search=amber)
  const searchQuery = (params.q || params.search)?.toLowerCase().trim();
  if (searchQuery) {
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery) ||
        (p.description && p.description.toLowerCase().includes(searchQuery)) ||
        p.category.toLowerCase().includes(searchQuery)
    );
  }

  // Sort if requested (e.g. ?sort=price or ?sort=price-asc / price-desc / popular)
  if (params.sort) {
    if (params.sort === "price" || params.sort === "price-asc") {
      products.sort((a, b) => a.basePrice - b.basePrice);
    } else if (params.sort === "price-desc") {
      products.sort((a, b) => b.basePrice - a.basePrice);
    } else if (params.sort === "popular") {
      products.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));
    }
  }

  return (
    <div className="py-24 lg:py-32">
      <Container>
        <div className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            {isVi ? "Tất Cả Tác Phẩm Nến Thơm" : "All Candles"}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
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

