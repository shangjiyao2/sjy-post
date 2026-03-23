import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeSkin = 'light' | 'dark' | 'black';

interface ThemeState {
  /** Single source of truth */
  skin: ThemeSkin;

  /** Backward-compatible derived value */
  isDark: boolean;

  setSkin: (skin: ThemeSkin) => void;

  /** Cycle: light → dark → black → light */
  cycleSkin: () => void;

  /** Backward-compatible alias (now cycles skins) */
  toggle: () => void;

  /** Backward-compatible setter */
  setTheme: (dark: boolean) => void;
}

export const isThemeSkin = (skin: string | null): skin is ThemeSkin =>
  skin === 'light' || skin === 'dark' || skin === 'black';

const isDarkSkin = (skin: ThemeSkin) => skin !== 'light';

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      skin: 'light',
      isDark: false,

      setSkin: (skin) => set({ skin, isDark: isDarkSkin(skin) }),

      cycleSkin: () => {
        const { skin } = get();
        let next: ThemeSkin;
        if (skin === 'light') next = 'dark';
        else if (skin === 'dark') next = 'black';
        else next = 'light';
        set({ skin: next, isDark: isDarkSkin(next) });
      },

      toggle: () => get().cycleSkin(),

      setTheme: (dark) => {
        const skin: ThemeSkin = dark ? 'dark' : 'light';
        set({ skin, isDark: dark });
      },
    }),
    {
      name: 'sjypost-theme',
      version: 2,
      migrate: (persistedState: any) => {
        if (!persistedState) return persistedState;

        // v2+ already
        if (persistedState.skin) {
          return {
            ...persistedState,
            isDark: isDarkSkin(persistedState.skin as ThemeSkin),
          };
        }

        // v1: { isDark: boolean }
        const dark = Boolean(persistedState.isDark);
        return {
          ...persistedState,
          skin: dark ? 'dark' : 'light',
          isDark: dark,
        };
      },
    }
  )
);
