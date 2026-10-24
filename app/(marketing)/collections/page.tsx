import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { CollectionsIntro, ScentCollectionCard } from "@/components/collections";
import { SCENT_CATEGORIES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Collections — Solenne",
  description:
    "Explore Solenne's curated candle collections, organized by scent family: floral, woody, fresh, and warm.",
};

export default async function CollectionsPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  return (
    <div className="py-24 lg:py-32">
      <Container>
        <div className="mb-16">
          <CollectionsIntro
            title={isVi ? "Các Bộ sưu tập Hương sắc" : "Collections"}
            intro={
              isVi
                ? "Mỗi bộ sưu tập được kiến tạo xoay quanh một họ hương đặc trưng, đưa bạn chạm vào miền cảm xúc hằng kiếm tìm. Đổ tay theo từng mẻ nhỏ từ sáp đậu nành thiên nhiên thuần khiết và tinh dầu nước hoa Pháp cao cấp."
                : "Each collection is composed around a scent family, so you can find the mood you're seeking. Hand-poured in small batches with natural soy wax and premium fragrance oils."
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
          {SCENT_CATEGORIES.map((category, index) => (
            <ScentCollectionCard
              key={category.id}
              category={category}
              index={index}
              isVi={isVi}
            />
          ))}
        </div>
      </Container>
    </div>
  );
}
