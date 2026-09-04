import { create } from 'zustand';

interface UIState {
  isMobileNavOpen: boolean;
  isSearchOpen: boolean;
  currency: 'VND' | 'USD';
  locale: 'en' | 'vi';

  toggleMobileNav: () => void;
  closeMobileNav: () => void;
  toggleSearch: () => void;
  setCurrency: (currency: 'VND' | 'USD') => void;
  setLocale: (locale: 'en' | 'vi') => void;
}

export const useUIStore = create<UIState>()((set) => ({
  isMobileNavOpen: false,
  isSearchOpen: false,
  currency: 'USD',
  locale: 'en',

  toggleMobileNav: () =>
    set((state) => ({ isMobileNavOpen: !state.isMobileNavOpen })),
  closeMobileNav: () => set({ isMobileNavOpen: false }),
  toggleSearch: () =>
    set((state) => ({ isSearchOpen: !state.isSearchOpen })),
  setCurrency: (currency) => set({ currency }),
  setLocale: (locale) => set({ locale }),
}));
