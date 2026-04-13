import { create } from 'zustand';
import type { Project, TreeNode, Environment, CollectionEntry } from '../types';
import * as api from '../services/api';
import { useGlobalEnvironmentStore } from './globalEnvironmentStore';

export const STORAGE_KEY = 'sjypost-collections';
const loadEnvironmentPromises = new Map<string, Promise<void>>();

interface ProjectState {
  // Multi-project state
  collections: Record<string, CollectionEntry>;
  activeProjectPath: string | null;

  // Global state
  isLoading: boolean;
  error: string | null;

  // Project lifecycle
  openProject: (path: string) => Promise<void>;
  createProject: (path: string, name: string) => Promise<void>;
  renameProject: (projectPath: string, name: string) => Promise<void>;
  closeCollection: (projectPath: string) => void;

  // Per-project tree operations
  refreshTree: (projectPath?: string) => Promise<void>;
  refreshAllTrees: () => Promise<void>;
  createFolder: (projectPath: string, parentPath: string, name: string) => Promise<TreeNode>;
  renameNode: (projectPath: string, nodePath: string, newName: string) => Promise<void>;
  deleteNode: (projectPath: string, nodePath: string) => Promise<void>;

  // Per-project environment operations
  loadEnvironments: (projectPath?: string) => Promise<void>;
  setActiveEnvironment: (projectPath: string, envId: string | null) => Promise<void>;
  saveEnvironment: (projectPath: string, env: Environment) => Promise<void>;
  deleteEnvironment: (projectPath: string, envId: string) => Promise<void>;

  // UI state
  setActiveProject: (projectPath: string) => void;
  toggleCollapse: (projectPath: string) => void;

  // Helpers
  getCollection: (projectPath: string) => CollectionEntry | undefined;
  getVariables: (projectPath?: string) => Record<string, string>;

  // Backward-compatible derived state
  project: Project | null;
  treeData: TreeNode[];
  environments: Environment[];
  activeEnvironment: string | null;

  // Restore saved collections on startup
  restoreCollections: () => Promise<void>;
}

// Persist open collection paths to localStorage
function persistCollectionPaths(collections: Record<string, CollectionEntry>, activeProjectPath: string | null) {
  try {
    const paths = Object.keys(collections);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ paths, activeProjectPath }));
  } catch {
    // Ignore localStorage errors
  }
}

function loadPersistedPaths(): { paths: string[]; activeProjectPath: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        paths: Array.isArray(parsed.paths) ? parsed.paths : [],
        activeProjectPath: parsed.activeProjectPath || null,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { paths: [], activeProjectPath: null };
}

function resolveActiveEnvironmentId(environments: Environment[], preferredId?: string | null): string | null {
  if (preferredId && environments.some((environment) => environment.id === preferredId)) {
    return preferredId;
  }

  return environments[0]?.id ?? null;
}

function sameEnvironments(left: Environment[], right: Environment[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((environment, index) => {
    const nextEnvironment = right[index];
    if (!nextEnvironment) {
      return false;
    }

    const leftKeys = Object.keys(environment.variables);
    const rightKeys = Object.keys(nextEnvironment.variables);
    if (
      environment.id !== nextEnvironment.id
      || environment.name !== nextEnvironment.name
      || leftKeys.length !== rightKeys.length
    ) {
      return false;
    }

    return leftKeys.every((key) => environment.variables[key] === nextEnvironment.variables[key]);
  });
}

// Helper to update a single collection entry
function updateCollection(
  state: { collections: Record<string, CollectionEntry> },
  path: string,
  updates: Partial<CollectionEntry>
) {
  const existing = state.collections[path];
  if (!existing) return state.collections;
  return {
    ...state.collections,
    [path]: { ...existing, ...updates },
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Initial state
  collections: {},
  activeProjectPath: null,
  isLoading: false,
  error: null,

  // Backward-compatible derived state (as plain values, updated reactively)
  project: null,
  treeData: [],
  environments: [],
  activeEnvironment: null,

  // Project lifecycle
  openProject: async (path) => {
    // If already open, just focus it
    if (get().collections[path]) {
      get().setActiveProject(path);
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const project = await api.openProject(path);
      const treeData = await api.readProjectTree(path);

      let environments: Environment[] = [];
      let activeEnv: string | null = null;
      try {
        environments = await api.listEnvironments(path);
        activeEnv = resolveActiveEnvironmentId(environments, project.config.active_environment);
      } catch {
        // Environments are optional
      }

      const entry: CollectionEntry = {
        project,
        treeData,
        environments,
        activeEnvironment: activeEnv,
        isCollapsed: false,
        isLoading: false,
      };

      set((state) => ({
        collections: { ...state.collections, [path]: entry },
        activeProjectPath: path,
        isLoading: false,
        // Update backward-compatible state
        project: entry.project,
        treeData: entry.treeData,
        environments: entry.environments,
        activeEnvironment: entry.activeEnvironment,
      }));

      persistCollectionPaths(get().collections, path);
    } catch (e) {
      set({ error: String(e), isLoading: false });
      throw e;
    }
  },

  createProject: async (path, name) => {
    set({ isLoading: true, error: null });
    try {
      const project = await api.createProject(path, name);

      let environments: Environment[] = [];
      try {
        environments = await api.listEnvironments(project.path);
      } catch {
        // Ignore
      }

      const activeEnvironment = resolveActiveEnvironmentId(environments, project.config.active_environment);
      const entry: CollectionEntry = {
        project,
        treeData: [],
        environments,
        activeEnvironment,
        isCollapsed: false,
        isLoading: false,
      };

      set((state) => ({
        collections: { ...state.collections, [project.path]: entry },
        activeProjectPath: project.path,
        isLoading: false,
        project: entry.project,
        treeData: entry.treeData,
        environments: entry.environments,
        activeEnvironment: entry.activeEnvironment,
      }));

      persistCollectionPaths(get().collections, project.path);
    } catch (e) {
      set({ error: String(e), isLoading: false });
      throw e;
    }
  },

  renameProject: async (projectPath, name) => {
    const entry = get().collections[projectPath];
    if (!entry) {
      throw new Error('No project open');
    }

    const project = await api.renameProject(projectPath, name);

    set((state) => {
      const currentEntry = state.collections[projectPath];
      if (!currentEntry) {
        return state;
      }

      const nextEntry: CollectionEntry = {
        ...currentEntry,
        project,
      };
      const collections = {
        ...state.collections,
        [projectPath]: nextEntry,
      };

      const updates: Partial<ProjectState> = { collections };
      if (state.activeProjectPath === projectPath) {
        updates.project = project;
      }

      return updates as ProjectState;
    });
  },

  closeCollection: (projectPath) => {
    set((state) => {
      const newCollections = { ...state.collections };
      delete newCollections[projectPath];

      const remainingPaths = Object.keys(newCollections);
      let newActivePath: string | null = null;
      if (state.activeProjectPath === projectPath && remainingPaths.length > 0) {
        newActivePath = remainingPaths[0];
      } else if (state.activeProjectPath !== projectPath) {
        newActivePath = state.activeProjectPath;
      }

      const activeEntry = newActivePath ? newCollections[newActivePath] : null;

      persistCollectionPaths(newCollections, newActivePath);
      return {
        collections: newCollections,
        activeProjectPath: newActivePath,
        project: activeEntry?.project ?? null,
        treeData: activeEntry?.treeData ?? [],
        environments: activeEntry?.environments ?? [],
        activeEnvironment: activeEntry?.activeEnvironment ?? null,
      };
    });
  },

  // Per-project tree operations
  refreshTree: async (projectPath?) => {
    const path = projectPath || get().activeProjectPath;
    if (!path || !get().collections[path]) return;

    try {
      const treeData = await api.readProjectTree(path);
      set((state) => {
        const newCollections = updateCollection(state, path, { treeData });
        const updates: Partial<ProjectState> = { collections: newCollections };
        if (state.activeProjectPath === path) {
          updates.treeData = treeData;
        }
        return updates as ProjectState;
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  refreshAllTrees: async () => {
    const paths = Object.keys(get().collections);
    await Promise.all(paths.map((path) => get().refreshTree(path)));
  },

  createFolder: async (projectPath, parentPath, name) => {
    if (!get().collections[projectPath]) throw new Error('No project open');

    const node = await api.createFolder(projectPath, parentPath, name);
    await get().refreshTree(projectPath);
    return node;
  },

  renameNode: async (projectPath, nodePath, newName) => {
    if (!get().collections[projectPath]) throw new Error('No project open');

    await api.renameNode(projectPath, nodePath, newName);
    await get().refreshTree(projectPath);
  },

  deleteNode: async (projectPath, nodePath) => {
    if (!get().collections[projectPath]) throw new Error('No project open');

    await api.deleteNode(projectPath, nodePath);
    await get().refreshTree(projectPath);
  },

  // Per-project environment operations
  loadEnvironments: async (projectPath?) => {
    const path = projectPath || get().activeProjectPath;
    if (!path || !get().collections[path]) return;

    const existingPromise = loadEnvironmentPromises.get(path);
    if (existingPromise) {
      await existingPromise;
      return;
    }

    const loadPromise = (async () => {
      try {
        const environments = await api.listEnvironments(path);
        const preferredActiveId = get().collections[path]?.activeEnvironment;
        const activeEnvironment = resolveActiveEnvironmentId(environments, preferredActiveId);

        set((state) => {
          const currentEntry = state.collections[path];
          if (!currentEntry) {
            return state;
          }

          const sameEntry = sameEnvironments(currentEntry.environments, environments)
            && currentEntry.activeEnvironment === activeEnvironment;
          if (sameEntry) {
            return state;
          }

          const newCollections = updateCollection(state, path, { environments, activeEnvironment });
          const updates: Partial<ProjectState> = { collections: newCollections };
          if (state.activeProjectPath === path) {
            updates.environments = environments;
            updates.activeEnvironment = activeEnvironment;
          }
          return updates as ProjectState;
        });
      } catch (e) {
        set({ error: String(e) });
      } finally {
        loadEnvironmentPromises.delete(path);
      }
    })();

    loadEnvironmentPromises.set(path, loadPromise);
    await loadPromise;
  },

  setActiveEnvironment: async (projectPath, envId) => {
    const entry = get().collections[projectPath];
    if (!entry || entry.activeEnvironment === envId) return;

    if (envId && !entry.environments.some((environment) => environment.id === envId)) {
      throw new Error('Environment not found');
    }

    await api.setActiveEnvironment(projectPath, envId);

    set((state) => {
      const newCollections = updateCollection(state, projectPath, { activeEnvironment: envId });
      const updates: Partial<ProjectState> = { collections: newCollections };
      if (state.activeProjectPath === projectPath) {
        updates.activeEnvironment = envId;
      }
      return updates as ProjectState;
    });
  },

  saveEnvironment: async (projectPath, env) => {
    if (!get().collections[projectPath]) throw new Error('No project open');

    await api.saveEnvironment(projectPath, env);
    await get().loadEnvironments(projectPath);
  },

  deleteEnvironment: async (projectPath, envId) => {
    if (!get().collections[projectPath]) throw new Error('No project open');

    await api.deleteEnvironment(projectPath, envId);
    await get().loadEnvironments(projectPath);
  },

  // UI state
  setActiveProject: (projectPath) => {
    const state = get();
    const entry = state.collections[projectPath];
    if (!entry || state.activeProjectPath === projectPath) return;

    set({
      activeProjectPath: projectPath,
      project: entry.project,
      treeData: entry.treeData,
      environments: entry.environments,
      activeEnvironment: entry.activeEnvironment,
    });
    persistCollectionPaths(state.collections, projectPath);
  },

  toggleCollapse: (projectPath) => {
    const entry = get().collections[projectPath];
    if (!entry) return;

    set((state) => ({
      collections: updateCollection(state, projectPath, { isCollapsed: !entry.isCollapsed }),
    }));
  },

  // Helpers
  getCollection: (projectPath) => {
    return get().collections[projectPath];
  },

  getVariables: (projectPath?) => {
    const globalVariables = useGlobalEnvironmentStore.getState().getVariables();
    void projectPath;
    return globalVariables;
  },

  // Restore saved collections on startup
  restoreCollections: async () => {
    const { paths, activeProjectPath } = loadPersistedPaths();
    if (paths.length === 0) return;

    for (const path of paths) {
      try {
        await get().openProject(path);
      } catch {
        // Skip projects that no longer exist
      }
    }

    // Restore active project if still valid
    if (activeProjectPath && get().collections[activeProjectPath]) {
      get().setActiveProject(activeProjectPath);
    }
  },
}));
