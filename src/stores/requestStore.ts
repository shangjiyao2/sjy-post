import { create } from 'zustand';
import type { RequestFile, HttpResponse } from '../types';
import { createNewRequest } from '../types';
import * as api from '../services/api';
import i18n from '../i18n';
import { useProjectStore } from './projectStore';

export type TabType = 'request' | 'websocket';

export interface RequestTab {
  id: string;
  title: string;
  type: TabType;
  request: RequestFile;
  response: HttpResponse | null;
  isLoading: boolean;
  isDirty: boolean;
  filePath?: string; // path relative to project root
  projectPath?: string; // absolute project path this tab belongs to
}

interface RequestState {
  // State
  tabs: RequestTab[];
  activeTabId: string | null;

  // Actions
  openNewTab: (type?: TabType) => void;
  openRequest: (filePath: string, request: RequestFile, projectPath?: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateRequest: (tabId: string, updates: Partial<RequestFile>) => void;
  sendRequest: (tabId: string, variables?: Record<string, string>) => Promise<HttpResponse | undefined>;
  saveRequest: (tabId: string, projectPath: string) => Promise<void>;
  saveNewRequest: (tabId: string, projectPath: string, folderPath: string, name: string) => Promise<string>;
  renameTab: (tabId: string, newName: string) => Promise<void>;
  getActiveTab: () => RequestTab | null;
}

const INVALID_REQUEST_NAME_PATTERN = /[\\/:*?"<>|]/;

function buildRequestFilePath(folderPath: string, name: string): string {
  const fileName = `${name}.req.json`;
  return folderPath === '.' ? fileName : `${folderPath}/${fileName}`;
}

function getRenamedRequestFilePath(filePath: string, newName: string): string {
  const normalizedPath = filePath.replaceAll('\\', '/');
  const lastSlashIndex = normalizedPath.lastIndexOf('/');
  if (lastSlashIndex < 0) {
    return `${newName}.req.json`;
  }

  return `${normalizedPath.slice(0, lastSlashIndex)}/${newName}.req.json`;
}

function applyInMemoryRename(tab: RequestTab, newName: string): RequestTab {
  return {
    ...tab,
    title: newName,
    request: { ...tab.request, name: newName },
    isDirty: true,
  };
}

export const useRequestStore = create<RequestState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openNewTab: (type: TabType = 'request') => {
    if (type === 'websocket') {
      const newTab: RequestTab = {
        id: crypto.randomUUID(),
        title: i18n.t('store.webSocket'),
        type: 'websocket',
        request: createNewRequest(i18n.t('store.webSocket')),
        response: null,
        isLoading: false,
        isDirty: false,
      };

      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      }));
    } else {
      const newRequest = createNewRequest(i18n.t('store.untitled'));
      const newTab: RequestTab = {
        id: newRequest.id,
        title: i18n.t('store.untitled'),
        type: 'request',
        request: newRequest,
        response: null,
        isLoading: false,
        isDirty: true,
      };

      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      }));
    }
  },

  openRequest: (filePath, request, projectPath?) => {
    // Check if already open (composite key: filePath + projectPath)
    const existingTab = get().tabs.find(
      t => t.filePath === filePath && t.projectPath === projectPath
    );
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    const newTab: RequestTab = {
      id: request.id,
      title: request.name,
      type: 'request',
      request,
      response: null,
      isLoading: false,
      isDirty: false,
      filePath,
      projectPath,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  closeTab: (tabId) => {
    set((state) => {
      const newTabs = state.tabs.filter(t => t.id !== tabId);
      let newActiveId = state.activeTabId;

      if (state.activeTabId === tabId) {
        const closedIndex = state.tabs.findIndex(t => t.id === tabId);
        if (newTabs.length > 0) {
          newActiveId = newTabs[Math.min(closedIndex, newTabs.length - 1)].id;
        } else {
          newActiveId = null;
        }
      }

      return { tabs: newTabs, activeTabId: newActiveId };
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  updateRequest: (tabId, updates) => {
    set((state) => ({
      tabs: state.tabs.map(tab =>
        tab.id === tabId
          ? {
              ...tab,
              request: { ...tab.request, ...updates },
              isDirty: true,
              title: updates.name || tab.title,
            }
          : tab
      ),
    }));
  },

  sendRequest: async (tabId, variables = {}) => {
    const tab = get().tabs.find(t => t.id === tabId);
    if (!tab) return;

    set((state) => ({
      tabs: state.tabs.map(t =>
        t.id === tabId ? { ...t, isLoading: true, response: null } : t
      ),
    }));

    try {
      const response = await api.sendRequest(tab.request, variables);
      set((state) => ({
        tabs: state.tabs.map(t =>
          t.id === tabId ? { ...t, isLoading: false, response } : t
        ),
      }));

      // Return the response for history recording
      return response;
    } catch (e) {
      set((state) => ({
        tabs: state.tabs.map(t =>
          t.id === tabId
            ? {
                ...t,
                isLoading: false,
                response: {
                  status: 0,
                  status_text: i18n.t('store.error'),
                  headers: {},
                  body: String(e),
                  body_type: 'text' as const,
                  time_ms: 0,
                  size_bytes: 0,
                },
              }
            : t
        ),
      }));
      throw e;
    }
  },

  saveRequest: async (tabId, projectPath) => {
    const tab = get().tabs.find(t => t.id === tabId);
    if (!tab?.filePath) return;

    // Use provided projectPath, or fall back to tab's own projectPath
    const resolvedPath = projectPath || tab.projectPath;
    if (!resolvedPath) return;

    await api.saveRequest(resolvedPath, tab.filePath, tab.request);
    await useProjectStore.getState().refreshTree(resolvedPath);

    set((state) => ({
      tabs: state.tabs.map(t =>
        t.id === tabId ? { ...t, isDirty: false } : t
      ),
    }));
  },

  saveNewRequest: async (tabId, projectPath, folderPath, name) => {
    const tab = get().tabs.find(t => t.id === tabId);
    if (!tab) throw new Error('Tab not found');

    // Build the file path
    const filePath = buildRequestFilePath(folderPath, name);

    // Update request name and save
    const updatedRequest = { ...tab.request, name };
    await api.saveRequest(projectPath, filePath, updatedRequest);
    await useProjectStore.getState().refreshTree(projectPath);

    // Update tab state with file path, project path, and new name
    set((state) => ({
      tabs: state.tabs.map(t =>
        t.id === tabId
          ? { ...t, request: updatedRequest, title: name, isDirty: false, filePath, projectPath }
          : t
      ),
    }));

    return filePath;
  },

  renameTab: async (tabId, newName) => {
    const tab = get().tabs.find(t => t.id === tabId);
    if (!tab) {
      throw new Error('Tab not found');
    }

    const trimmedName = newName.trim();
    const currentName = tab.request.name || tab.title;
    if (tab.type === 'websocket') {
      if (!trimmedName || trimmedName === currentName) {
        return;
      }

      set((state) => ({
        tabs: state.tabs.map(t => (t.id === tabId ? applyInMemoryRename(t, trimmedName) : t)),
      }));
      return;
    }

    if (!trimmedName) {
      throw new Error(i18n.t('workspace.enterRequestName'));
    }

    if (INVALID_REQUEST_NAME_PATTERN.test(trimmedName)) {
      throw new Error(i18n.t('sidebar.invalidNodeName'));
    }

    if (trimmedName === currentName) {
      return;
    }

    const isSavedRequestTab = Boolean(tab.filePath && tab.projectPath);
    if (!isSavedRequestTab) {
      set((state) => ({
        tabs: state.tabs.map(t => (t.id === tabId ? applyInMemoryRename(t, trimmedName) : t)),
      }));
      return;
    }

    const projectPath = tab.projectPath!;
    const oldFilePath = tab.filePath!;
    const newFilePath = getRenamedRequestFilePath(oldFilePath, trimmedName);
    const updatedRequest = { ...tab.request, name: trimmedName };

    await api.renameNode(projectPath, oldFilePath, trimmedName);

    try {
      await api.saveRequest(projectPath, newFilePath, updatedRequest);
      await useProjectStore.getState().refreshTree(projectPath);

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                title: trimmedName,
                request: updatedRequest,
                filePath: newFilePath,
                isDirty: false,
              }
            : t
        ),
      }));
    } catch (error) {
      await useProjectStore.getState().refreshTree(projectPath);

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                title: trimmedName,
                request: updatedRequest,
                filePath: newFilePath,
                isDirty: true,
              }
            : t
        ),
      }));

      throw error;
    }
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find(t => t.id === activeTabId) || null;
  },
}));
