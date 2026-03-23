import { create } from 'zustand';
import type { Environment } from '../types';
import * as api from '../services/api';

let loadEnvironmentsPromise: Promise<void> | null = null;

interface GlobalEnvironmentState {
  environments: Environment[];
  activeEnvironmentId: string | null;
  isLoaded: boolean;

  // Actions
  loadEnvironments: () => Promise<void>;
  saveEnvironment: (env: Environment) => Promise<void>;
  deleteEnvironment: (envId: string) => Promise<void>;
  setActiveEnvironment: (envId: string) => Promise<void>;

  // Helpers
  getVariables: () => Record<string, string>;
}

export const useGlobalEnvironmentStore = create<GlobalEnvironmentState>((set, get) => ({
  environments: [],
  activeEnvironmentId: null,
  isLoaded: false,

  loadEnvironments: async () => {
    if (loadEnvironmentsPromise) {
      await loadEnvironmentsPromise;
      return;
    }

    loadEnvironmentsPromise = (async () => {
      try {
        const storage = await api.listGlobalEnvironments();
        set({
          environments: storage.environments,
          activeEnvironmentId: storage.activeEnvironmentId,
          isLoaded: true,
        });
      } catch {
        set({ isLoaded: true });
      } finally {
        loadEnvironmentsPromise = null;
      }
    })();

    await loadEnvironmentsPromise;
  },

  saveEnvironment: async (env) => {
    await api.saveGlobalEnvironment(env);
    await get().loadEnvironments();
  },

  deleteEnvironment: async (envId) => {
    await api.deleteGlobalEnvironment(envId);
    await get().loadEnvironments();
  },

  setActiveEnvironment: async (envId) => {
    await api.setActiveGlobalEnvironment(envId);
    set({ activeEnvironmentId: envId });
  },

  getVariables: () => {
    const { environments, activeEnvironmentId } = get();
    const env = environments.find(e => e.id === activeEnvironmentId);
    return env?.variables || {};
  },
}));
