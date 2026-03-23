import { create } from 'zustand';
import * as api from '../services/api';
import type { StoredJavaProject, ParsedJavaProject } from '../services/api';

export const buildEndpointCompositeKey = (controllerName: string, method: string, fullPath: string) =>
  `${controllerName}:${method}:${fullPath}`;

export const getEndpointCompositeKeys = (parsedData: ParsedJavaProject, endpointIds?: string[]) => {
  const endpointIdSet = endpointIds ? new Set(endpointIds) : null;

  return parsedData.controllers.flatMap((controller) =>
    controller.endpoints
      .filter((endpoint) => !endpointIdSet || endpointIdSet.has(endpoint.id))
      .map((endpoint) => buildEndpointCompositeKey(controller.name, endpoint.httpMethod, endpoint.fullPath)),
  );
};

export const getNewEndpointIds = (parsedData: ParsedJavaProject, seenEndpointIds: string[]) => {
  const seenSet = new Set(seenEndpointIds);

  return parsedData.controllers.flatMap((controller) =>
    controller.endpoints
      .filter((endpoint) => !seenSet.has(buildEndpointCompositeKey(controller.name, endpoint.httpMethod, endpoint.fullPath)))
      .map((endpoint) => endpoint.id),
  );
};

interface JavaProjectState {
  // State
  projects: StoredJavaProject[];
  currentProject: StoredJavaProject | null;
  parsedData: ParsedJavaProject | null;
  newEndpointIds: string[];
  importedEndpointIds: string[];
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;

  // Actions
  loadProjects: () => Promise<void>;
  addProject: (name: string, path: string, parsedData: ParsedJavaProject) => Promise<StoredJavaProject>;
  openProject: (projectId: string) => Promise<void>;
  closeProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  checkForUpdates: (projectId: string) => Promise<void>;
  markEndpointsSeen: (projectId: string, endpointIds: string[]) => Promise<void>;
  markImportedEndpoints: (endpointIds: string[]) => void;
  resetImportedEndpoints: () => void;
  setParsedData: (data: ParsedJavaProject | null) => void;
  setCurrentProject: (project: StoredJavaProject | null) => void;
}

export const useJavaProjectStore = create<JavaProjectState>((set, get) => ({
  // Initial state
  projects: [],
  currentProject: null,
  parsedData: null,
  newEndpointIds: [],
  importedEndpointIds: [],
  isLoading: false,
  isLoaded: false,
  error: null,

  // Actions
  loadProjects: async () => {
    const { isLoaded, isLoading } = get();
    if (isLoading || isLoaded) {
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const storage = await api.getJavaProjects();
      set({ projects: storage.projects, isLoading: false, isLoaded: true });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  addProject: async (name: string, path: string, parsedData: ParsedJavaProject) => {
    const now = new Date().toISOString();

    const seenEndpointIds = getEndpointCompositeKeys(parsedData);

    const project: StoredJavaProject = {
      id: crypto.randomUUID(),
      name,
      path,
      isOpen: true,
      lastParsedAt: now,
      seenEndpointIds,
    };

    await api.saveJavaProject(project);

    const { projects } = get();
    // Check if project with same path exists
    const existingIndex = projects.findIndex(p => p.path === path);
    if (existingIndex >= 0) {
      const updatedProjects = [...projects];
      updatedProjects[existingIndex] = project;
      set({ projects: updatedProjects, currentProject: project, parsedData, importedEndpointIds: [], isLoaded: true });

    } else {
      set({ projects: [...projects, project], currentProject: project, parsedData, importedEndpointIds: [], isLoaded: true });

    }

    return project;
  },

  openProject: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.setJavaProjectOpen(projectId, true);

      const { projects } = get();
      const project = projects.find(p => p.id === projectId);
      if (project) {
        // Re-parse the project to get latest data
        const response = await api.checkJavaProjectUpdates(projectId);

        const updatedProject = { ...project, isOpen: true };
        const updatedProjects = projects.map(p => p.id === projectId ? updatedProject : p);

        set({
          projects: updatedProjects,
          currentProject: updatedProject,
          parsedData: response.parsedData,
          newEndpointIds: response.newEndpointIds,
          importedEndpointIds: [],
          isLoading: false,
          isLoaded: true,
        });
      }
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  closeProject: async (projectId: string) => {
    try {
      await api.setJavaProjectOpen(projectId, false);

      const { projects, currentProject } = get();
      const updatedProjects = projects.map(p =>
        p.id === projectId ? { ...p, isOpen: false } : p
      );

      set({
        projects: updatedProjects,
        currentProject: currentProject?.id === projectId ? null : currentProject,
        parsedData: currentProject?.id === projectId ? null : get().parsedData,
        newEndpointIds: [],
        importedEndpointIds: currentProject?.id === projectId ? [] : get().importedEndpointIds,
        isLoaded: true,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteProject: async (projectId: string) => {
    try {
      await api.deleteJavaProject(projectId);

      const { projects, currentProject } = get();
      const updatedProjects = projects.filter(p => p.id !== projectId);

      set({
        projects: updatedProjects,
        currentProject: currentProject?.id === projectId ? null : currentProject,
        parsedData: currentProject?.id === projectId ? null : get().parsedData,
        newEndpointIds: [],
        importedEndpointIds: currentProject?.id === projectId ? [] : get().importedEndpointIds,
        isLoaded: true,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  checkForUpdates: async (projectId: string) => {
    try {
      const response = await api.checkJavaProjectUpdates(projectId);
      set({
        parsedData: response.parsedData,
        newEndpointIds: response.newEndpointIds,
        isLoaded: true,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  markEndpointsSeen: async (projectId: string, endpointIds: string[]) => {
    try {
      await api.markJavaEndpointsSeen(projectId, endpointIds);

      const { projects, currentProject, newEndpointIds } = get();

      // Update local state
      const updatedProjects = projects.map(p => {
        if (p.id === projectId) {
          return {
            ...p,
            seenEndpointIds: [...new Set([...p.seenEndpointIds, ...endpointIds])],
          };
        }
        return p;
      });

      // Remove marked IDs from newEndpointIds
      const remainingNewIds = newEndpointIds.filter(id => !endpointIds.includes(id));

      set({
        projects: updatedProjects,
        currentProject: currentProject?.id === projectId
          ? { ...currentProject, seenEndpointIds: [...new Set([...currentProject.seenEndpointIds, ...endpointIds])] }
          : currentProject,
        newEndpointIds: remainingNewIds,
        isLoaded: true,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  markImportedEndpoints: (endpointIds: string[]) => {
    const { importedEndpointIds } = get();
    set({ importedEndpointIds: [...new Set([...importedEndpointIds, ...endpointIds])] });
  },

  resetImportedEndpoints: () => {
    set({ importedEndpointIds: [] });
  },

  setParsedData: (data: ParsedJavaProject | null) => {
    set({ parsedData: data });
  },

  setCurrentProject: (project: StoredJavaProject | null) => {
    set({ currentProject: project });
  },
}));
