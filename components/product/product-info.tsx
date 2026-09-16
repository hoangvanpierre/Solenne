"use client";

import { useState } from "react";
import { Star, Heart, Check, Plus, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useCart } from "@/hooks/use-cart";
import { SizeSelector } from "./size-selector";
import { QuantitySelector } from "./quantity-selector";
import { ScentNotes } from "./scent-notes";
import type { Product } from "@/types";
import { SCENT_CATEGORIES } from "@/lib/constants";
import { useAppLocale } from "@/hooks/use-locale";
import { motion, AnimatePresence } from "framer-motion";

interface ProductInfoProps {
  product: Product;
}

export function ProductInfo({ product }: ProductInfoProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    product.variants[0]?.id || ""
  );
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>("description");

  const { addItem, openCart, format } = useCart();
  const locale = useAppLocale();

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);
  const isSale = product.compareAtPrice && product.compareAtPrice > product.basePrice;

  const cat = SCENT_CATEGORIES.find(
    (c) => c.id === product.category || c.name.toLowerCase() === product.category.toLowerCase()
  );
  const catName = cat ? (locale === "vi" ? cat.nameVi : cat.name) : product.category;

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    
    addItem(product, selectedVariant, quantity);
    setIsAdded(true);
    openCart();
    
    setTimeout(() => setIsAdded(false), 2000);
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (!selectedVariant) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Badge className="mb-4">{catName}</Badge>
        <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-2">
          {product.name}
        </h1>
        {product.tagline && (
          <p className="text-lg text-muted-foreground">{product.tagline}</p>
        )}
      </div>

      {/* Price & Rating */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-medium">
            {format(selectedVariant.price)}
          </span>
          {isSale && (
            <span className="text-lg text-muted-foreground line-through">
              {format(product.compareAtPrice!)}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1.5 text-sm">
          <div className="flex text-primary">
            <Star className="h-4 w-4 fill-current" />
            <Star className="h-4 w-4 fill-current" />
            <Star className="h-4 w-4 fill-current" />
            <Star className="h-4 w-4 fill-current" />
            <Star className="h-4 w-4 fill-current opacity-50" />
          </div>
          <span className="text-muted-foreground ml-1">4.8 (24)</span>
        </div>
      </div>

      <hr className="border-border" />

      {/* Selectors */}
      <div className="space-y-6">
        <SizeSelector 
          variants={product.variants}
          selectedId={selectedVariantId}
          onSelect={setSelectedVariantId}
        />

        <div className="flex items-center gap-4">
          <QuantitySelector 
            quantity={quantity}
            onQuantityChange={setQuantity}
            max={selectedVariant.stockQuantity}
          />
          <span className="text-sm text-muted-foreground">
            {selectedVariant.stockQuantity > 0 
              ? locale === "vi"
                ? `Còn ${selectedVariant.stockQuantity} tác phẩm`
                : `${selectedVariant.stockQuantity} in stock` 
              : locale === "vi"
                ? "Tạm thời hết hàng"
                : "Out of stock"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 mt-4">
        <Button 
          size="lg" 
          className="w-full h-14 text-base relative overflow-hidden transition-all duration-300"
          onClick={handleAddToCart}
          disabled={selectedVariant.stockQuantity <= 0}
        >
          <AnimatePresence mode="wait">
            {isAdded ? (
              <motion.div
                key="added"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                className="flex items-center gap-2"
              >
                <Check className="h-5 w-5" />{" "}
                {locale === "vi" ? "Đã thêm vào giỏ" : "Added to Cart"}
              </motion.div>
            ) : (
              <motion.div
                key="add"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
              >
                {locale === "vi" ? "Thêm vào giỏ" : "Add to Cart"} — {format(selectedVariant.price * quantity)}
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
        
        <Button variant="ghost" className="w-full text-muted-foreground gap-2">
          <Heart className="h-4 w-4" />{" "}
          {locale === "vi" ? "Lưu vào danh sách ước" : "Add to Wishlist"}
        </Button>
      </div>

      {/* Accordions */}
      <div className="mt-8 border-t border-border">
        {/* Description Accordion */}
        <div className="border-b border-border">
          <button 
            onClick={() => toggleSection('description')}
            className="flex w-full items-center justify-between py-4 text-left font-medium"
          >
            {locale === "vi" ? "Miêu tả hương sắc" : "Description"}
            {expandedSection === 'description' ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
          <AnimatePresence>
            {expandedSection === 'description' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <p className="pb-4 text-sm text-muted-foreground leading-relaxed">
                  {product.description}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Scent Notes Accordion */}
        <div className="border-b border-border">
          <button 
            onClick={() => toggleSection('scent')}
            className="flex w-full items-center justify-between py-4 text-left font-medium"
          >
            {locale === "vi" ? "Cấu trúc nốt hương" : "Scent Notes"}
            {expandedSection === 'scent' ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
          <AnimatePresence>
            {expandedSection === 'scent' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden pb-4"
              >
                <ScentNotes 
                  top={product.scentTop} 
                  heart={product.scentHeart} 
                  base={product.scentBase} 
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Details Accordion */}
        <div className="border-b border-border">
          <button 
            onClick={() => toggleSection('details')}
            className="flex w-full items-center justify-between py-4 text-left font-medium"
          >
            {locale === "vi" ? "Thành phần & Nghi thức chăm sóc" : "Ingredients & Care"}
            {expandedSection === 'details' ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
          <AnimatePresence>
            {expandedSection === 'details' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <ul className="pb-4 space-y-2 text-sm text-muted-foreground list-disc pl-4">
                  {locale === "vi" ? (
                    <>
                      <li>100% sáp đậu nành tự nhiên thuần khiết</li>
                      <li>Hương liệu nước hoa tinh tuyển (không chứa phthalate)</li>
                      <li>Bấc cotton dệt thủ công không chì</li>
                      <li>Cắt tỉa bấc nến còn 0.6cm trước mỗi lần thắp</li>
                      <li>Để bề mặt sáp tan chảy đều đến mép ly trong lần thắp đầu</li>
                    </>
                  ) : (
                    <>
                      <li>100% natural soy wax blend</li>
                      <li>Premium fragrance oils (phthalate-free)</li>
                      <li>Lead-free cotton wicks</li>
                      <li>Trim wick to 1/4&quot; before each use</li>
                      <li>Allow wax to melt to the edges on first burn</li>
                    </>
                  )}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
