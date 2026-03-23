import { create } from 'zustand';
import * as api from '../services/api';
import type { ApiDocListItem } from '../services/api';

interface ApiDocState {
  // State
  docs: ApiDocListItem[];
  currentDocContent: string | null;
  currentDocFileName: string | null;
  currentProjectPath: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadDocs: (projectPath: string) => Promise<void>;
  viewDoc: (projectPath: string, fileName: string) => Promise<void>;
  deleteDoc: (projectPath: string, fileName: string) => Promise<void>;
  batchDeleteDocs: (projectPath: string, fileNames: string[]) => Promise<void>;
  clearCurrentDoc: () => void;
}

export const useApiDocStore = create<ApiDocState>((set) => ({
  // Initial state
  docs: [],
  currentDocContent: null,
  currentDocFileName: null,
  currentProjectPath: null,
  isLoading: false,
  error: null,

  // Actions
  loadDocs: async (projectPath: string) => {
    set({ isLoading: true, error: null, currentProjectPath: projectPath });
    try {
      const docs = await api.listApiDocs(projectPath);
      set({ docs, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  viewDoc: async (projectPath: string, fileName: string) => {
    set({ isLoading: true, error: null });
    try {
      const content = await api.readApiDoc(projectPath, fileName);
      set({ currentDocContent: content, currentDocFileName: fileName, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  deleteDoc: async (projectPath: string, fileName: string) => {
    try {
      await api.deleteApiDoc(projectPath, fileName);
      const { docs, currentDocFileName } = useApiDocStore.getState();
      set({
        docs: docs.filter((d) => d.fileName !== fileName),
        currentDocContent: currentDocFileName === fileName ? null : useApiDocStore.getState().currentDocContent,
        currentDocFileName: currentDocFileName === fileName ? null : currentDocFileName,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  batchDeleteDocs: async (projectPath: string, fileNames: string[]) => {
    try {
      await api.batchDeleteApiDocs(projectPath, fileNames);
      const fileNameSet = new Set(fileNames);
      const { docs, currentDocFileName } = useApiDocStore.getState();
      set({
        docs: docs.filter((d) => !fileNameSet.has(d.fileName)),
        currentDocContent: currentDocFileName && fileNameSet.has(currentDocFileName) ? null : useApiDocStore.getState().currentDocContent,
        currentDocFileName: currentDocFileName && fileNameSet.has(currentDocFileName) ? null : currentDocFileName,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearCurrentDoc: () => {
    set({ currentDocContent: null, currentDocFileName: null });
  },
}));
