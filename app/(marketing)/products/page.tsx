import { Container } from "@/components/ui/container";
import { ProductGrid } from "@/components/product";
import { getProducts } from "@/lib/products";

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <div className="py-24 lg:py-32">
      <Container>
        <div className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            All Candles
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Explore our complete collection of artisan scented candles. Each piece is hand-poured with natural soy wax and premium fragrance oils.
          </p>
        </div>
        
        <ProductGrid products={products} />
      </Container>
    </div>
  );
}
