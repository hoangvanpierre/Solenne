import { create } from 'zustand';

export interface AssistantPrefillRequest {
  id: number;
  prefill: string;
}

interface UIState {
  isMobileNavOpen: boolean;
  isSearchOpen: boolean;
  assistantRequest: AssistantPrefillRequest | null;
  currency: 'VND' | 'USD';
  locale: 'en' | 'vi';

  toggleMobileNav: () => void;
  closeMobileNav: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  requestAssistant: (prefill: string) => void;
  clearAssistantRequest: () => void;
  setCurrency: (currency: 'VND' | 'USD') => void;
  setLocale: (locale: 'en' | 'vi') => void;
}

let assistantRequestId = 0;

export const useUIStore = create<UIState>()((set) => ({
  isMobileNavOpen: false,
  isSearchOpen: false,
  assistantRequest: null,
  currency: 'USD',
  locale: 'en',

  toggleMobileNav: () =>
    set((state) => ({ isMobileNavOpen: !state.isMobileNavOpen })),
  closeMobileNav: () => set({ isMobileNavOpen: false }),
  // The navbar search icon lives above the mobile navigation in the DOM but
  // the mobile panel covers it. Opening search from a shortcut while the panel
  // is open should never leave two competing overlays behind.
  openSearch: () => set({ isSearchOpen: true, isMobileNavOpen: false }),
  closeSearch: () => set({ isSearchOpen: false }),
  toggleSearch: () =>
    set((state) => ({
      isSearchOpen: !state.isSearchOpen,
      ...(state.isSearchOpen ? {} : { isMobileNavOpen: false }),
    })),
  requestAssistant: (prefill) =>
    set({
      assistantRequest: {
        id: (assistantRequestId += 1),
        prefill,
      },
    }),
  clearAssistantRequest: () => set({ assistantRequest: null }),
  setCurrency: (currency) => set({ currency }),
  setLocale: (locale) => set({ locale }),
}));
