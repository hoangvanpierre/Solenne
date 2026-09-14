import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SCENT_CATEGORIES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Collections — Solenne",
  description:
    "Explore Solenne's curated candle collections, organized by scent family: floral, woody, fresh, and warm.",
};

export default function CollectionsPage() {
  return (
    <div className="py-24 lg:py-32">
      <Container>
        <div className="mb-16">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            Collections
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Each collection is composed around a scent family, so you can find
            the mood you&apos;re seeking. Hand-poured in small batches with
            natural soy wax and premium fragrance oils.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
          {SCENT_CATEGORIES.map((category) => (
            <Link
              key={category.id}
              href={`/collections/${category.id}`}
              className="group relative overflow-hidden rounded-2xl border border-border p-10 sm:p-14 transition-colors hover:border-foreground/20"
            >
              <div
                className={`absolute inset-0 ${category.bgColor} opacity-60 transition-opacity group-hover:opacity-100`}
                aria-hidden="true"
              />
              <div className="relative">
                <h2 className="font-serif text-3xl font-semibold text-foreground">
                  {category.name}
                </h2>
                <p className="mt-3 max-w-md text-muted-foreground">
                  {category.description}
                </p>
                <p className="mt-6 text-sm font-medium text-foreground underline-offset-4 group-hover:underline">
                  Explore the {category.name} collection
                </p>
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </div>
  );
}
