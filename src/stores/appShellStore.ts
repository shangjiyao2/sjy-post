import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppShellState {
  hideWelcome: boolean;
  hasShownWelcome: boolean;
  markWelcomeShown: () => void;
  dismissWelcome: () => void;
}

const legacyHideWelcome =
  globalThis.window?.localStorage?.getItem('sjypost-hide-welcome') === '1';

export const useAppShellStore = create<AppShellState>()(
  persist(
    (set) => ({
      hideWelcome: legacyHideWelcome,
      hasShownWelcome: false,
      markWelcomeShown: () => set({ hasShownWelcome: true }),
      dismissWelcome: () => set({ hideWelcome: true, hasShownWelcome: true }),
    }),
    {
      name: 'sjypost-app-shell',
      partialize: (state) => ({ hideWelcome: state.hideWelcome }),
    },
  ),
);
