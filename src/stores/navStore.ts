import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NavRailItem } from '../components/NavRail/NavRail';

export type ConfigurableNavRailItem = Exclude<NavRailItem, 'settings'>;

export const DEFAULT_VISIBLE_NAV_ITEMS: ConfigurableNavRailItem[] = [
  'collections',
  'history',
  'environments',
  'javaImport',
  'apiDocs',
  'permissionConfig',
];

function sanitizeVisibleNavItems(items?: NavRailItem[]): ConfigurableNavRailItem[] {
  const visibleItems = new Set<ConfigurableNavRailItem>(['collections']);

  if (Array.isArray(items)) {
    for (const item of DEFAULT_VISIBLE_NAV_ITEMS) {
      if (item === 'collections' || items.includes(item)) {
        visibleItems.add(item);
      }
    }
  } else {
    for (const item of DEFAULT_VISIBLE_NAV_ITEMS) {
      visibleItems.add(item);
    }
  }

  return DEFAULT_VISIBLE_NAV_ITEMS.filter((item) => visibleItems.has(item));
}

interface NavState {
  activeNavItem: NavRailItem;
  visibleNavItems: ConfigurableNavRailItem[];
  setActiveNavItem: (item: NavRailItem) => void;
  setNavItemVisible: (item: ConfigurableNavRailItem, visible: boolean) => void;
}

export const useNavStore = create<NavState>()(
  persist(
    (set) => ({
      activeNavItem: 'collections',
      visibleNavItems: DEFAULT_VISIBLE_NAV_ITEMS,
      setActiveNavItem: (item) =>
        set((state) => ({
          activeNavItem:
            item === 'settings' || item === 'collections' || state.visibleNavItems.includes(item as ConfigurableNavRailItem)
              ? item
              : 'collections',
        })),
      setNavItemVisible: (item, visible) =>
        set((state) => {
          if (item === 'collections') {
            return {};
          }

          const nextVisibleItems = visible
            ? sanitizeVisibleNavItems([...state.visibleNavItems, item])
            : sanitizeVisibleNavItems(state.visibleNavItems.filter((entry) => entry !== item));

          return {
            activeNavItem: !visible && state.activeNavItem === item ? 'collections' : state.activeNavItem,
            visibleNavItems: nextVisibleItems,
          };
        }),
    }),
    {
      name: 'sjypost-nav-rail',
      partialize: (state) => ({ visibleNavItems: state.visibleNavItems }),
      merge: (persistedState, currentState) => {
        const nextState = (persistedState as Partial<NavState> | undefined) ?? {};
        return {
          ...currentState,
          ...nextState,
          visibleNavItems: sanitizeVisibleNavItems(nextState.visibleNavItems),
        };
      },
    },
  ),
);
