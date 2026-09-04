import { create } from 'zustand';
import type { ScentCategory } from '@/types/product';

type SortOption = 'newest' | 'price-asc' | 'price-desc' | 'popular';

interface FilterState {
  category?: ScentCategory;
  priceRange?: [number, number];
  sortBy: SortOption;
  search: string;

  setCategory: (category?: ScentCategory) => void;
  setPriceRange: (range?: [number, number]) => void;
  setSortBy: (sortBy: SortOption) => void;
  setSearch: (search: string) => void;
  resetFilters: () => void;
}

export const useFilterStore = create<FilterState>()((set) => ({
  category: undefined,
  priceRange: undefined,
  sortBy: 'newest',
  search: '',

  setCategory: (category) => set({ category }),
  setPriceRange: (priceRange) => set({ priceRange }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSearch: (search) => set({ search }),
  resetFilters: () =>
    set({
      category: undefined,
      priceRange: undefined,
      sortBy: 'newest',
      search: '',
    }),
}));
