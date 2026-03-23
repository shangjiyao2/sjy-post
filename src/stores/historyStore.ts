import { create } from 'zustand';
import type { HistoryEntry } from '../types';
import * as api from '../services/api';

interface HistoryState {
  // State
  entries: HistoryEntry[];
  isLoading: boolean;
  error: string | null;
  selectedEntryId: string | null;

  // Actions
  loadHistory: (projectPath: string, limit?: number) => Promise<void>;
  addEntry: (projectPath: string, entry: HistoryEntry) => Promise<void>;
  deleteEntry: (projectPath: string, entryId: string) => Promise<void>;
  clearHistory: (projectPath: string) => Promise<void>;
  selectEntry: (entryId: string | null) => void;
  getSelectedEntry: () => HistoryEntry | null;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  // Initial state
  entries: [],
  isLoading: false,
  error: null,
  selectedEntryId: null,

  // Actions
  loadHistory: async (projectPath, limit) => {
    set({ isLoading: true, error: null });
    try {
      const entries = await api.getHistoryEntries(projectPath, limit);
      set({ entries, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  addEntry: async (projectPath, entry) => {
    try {
      await api.addHistoryEntry(projectPath, entry);
      // Reload history to get updated list
      await get().loadHistory(projectPath);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteEntry: async (projectPath, entryId) => {
    try {
      await api.deleteHistoryEntry(projectPath, entryId);
      // Update local state
      set((state) => ({
        entries: state.entries.filter((e) => e.id !== entryId),
        selectedEntryId: state.selectedEntryId === entryId ? null : state.selectedEntryId,
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearHistory: async (projectPath) => {
    try {
      await api.clearHistory(projectPath);
      set({ entries: [], selectedEntryId: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  selectEntry: (entryId) => {
    set({ selectedEntryId: entryId });
  },

  getSelectedEntry: () => {
    const { entries, selectedEntryId } = get();
    return entries.find((e) => e.id === selectedEntryId) || null;
  },
}));
