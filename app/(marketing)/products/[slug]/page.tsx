import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ProductGallery, ProductInfo } from "@/components/product";
import { getProductBySlug } from "@/lib/products";

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

  return (
    <div className="py-24 lg:py-32">
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24">
          <ProductGallery 
            images={product.images} 
            productName={product.name} 
          />
          
          <div className="lg:py-12">
            <ProductInfo product={product} />
          </div>
        </div>
      </Container>
    </div>
  );
}
