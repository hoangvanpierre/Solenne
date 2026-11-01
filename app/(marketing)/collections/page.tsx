import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { CollectionsIntro, ScentCollectionCard } from "@/components/collections";
import { SCENT_CATEGORIES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Collections — Solenne",
  description:
    "Solenne candle collections, organised by scent family: floral, woody, fresh and warm.",
};

export default async function CollectionsPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  return (
    <div className="py-24 lg:py-32">
      <Container>
        <div className="mb-16">
          <CollectionsIntro
            title={isVi ? "Bộ sưu tập" : "Collections"}
            intro={
              isVi
                ? "Mỗi bộ sưu tập xoay quanh một họ hương, để bạn tìm được mùi hương mình muốn. Đổ tay theo mẻ nhỏ từ sáp đậu nành tự nhiên và tinh dầu không chứa phthalate."
                : "Each collection is built around one scent family, so you can find the mood you want. Hand-poured in small batches with natural soy wax and phthalate-free fragrance oils."
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
