import { create } from 'zustand';
import type { WsConfig, WsStatus, WsMessage } from '../types';
import * as api from '../services/api';

interface WsConnection {
  id: string;
  name: string;
  url: string;
  status: WsStatus;
  messages: WsMessage[];
}

interface WsState {
  // State
  connections: WsConnection[];
  activeConnectionId: string | null;
  isConnecting: boolean;
  error: string | null;

  // Actions
  connect: (config: WsConfig) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  send: (id: string, message: string) => Promise<void>;
  refreshStatus: (id: string) => Promise<void>;
  refreshMessages: (id: string) => Promise<void>;
  clearMessages: (id: string) => Promise<void>;
  setActiveConnection: (id: string | null) => void;
  getActiveConnection: () => WsConnection | null;
  removeConnection: (id: string) => void;
}

export const useWsStore = create<WsState>((set, get) => ({
  // Initial state
  connections: [],
  activeConnectionId: null,
  isConnecting: false,
  error: null,

  // Actions
  connect: async (config) => {
    set({ isConnecting: true, error: null });

    // Add connection to state
    const newConnection: WsConnection = {
      id: config.id,
      name: config.name,
      url: config.url,
      status: 'connecting',
      messages: [],
    };

    set((state) => ({
      connections: [...state.connections.filter(c => c.id !== config.id), newConnection],
      activeConnectionId: config.id,
    }));

    try {
      await api.wsConnect(config);
      set({ isConnecting: false });

      // Start polling for status and messages
      get().refreshStatus(config.id);
    } catch (e) {
      set((state) => ({
        isConnecting: false,
        error: String(e),
        connections: state.connections.map(c =>
          c.id === config.id ? { ...c, status: 'error' as WsStatus } : c
        ),
      }));
    }
  },

  disconnect: async (id) => {
    try {
      await api.wsDisconnect(id);
      set((state) => ({
        connections: state.connections.map(c =>
          c.id === id ? { ...c, status: 'disconnected' as WsStatus } : c
        ),
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  send: async (id, message) => {
    try {
      await api.wsSend(id, message);
      // Refresh messages after sending
      await get().refreshMessages(id);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  refreshStatus: async (id) => {
    try {
      const status = await api.wsGetStatus(id);
      if (status) {
        set((state) => ({
          connections: state.connections.map(c =>
            c.id === id ? { ...c, status } : c
          ),
        }));
      }
    } catch {
      // Ignore errors
    }
  },

  refreshMessages: async (id) => {
    try {
      const messages = await api.wsGetMessages(id);
      set((state) => ({
        connections: state.connections.map(c =>
          c.id === id ? { ...c, messages } : c
        ),
      }));
    } catch {
      // Ignore errors
    }
  },

  clearMessages: async (id) => {
    try {
      await api.wsClearMessages(id);
      set((state) => ({
        connections: state.connections.map(c =>
          c.id === id ? { ...c, messages: [] } : c
        ),
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setActiveConnection: (id) => {
    set({ activeConnectionId: id });
  },

  getActiveConnection: () => {
    const { connections, activeConnectionId } = get();
    return connections.find(c => c.id === activeConnectionId) || null;
  },

  removeConnection: (id) => {
    set((state) => ({
      connections: state.connections.filter(c => c.id !== id),
      activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
    }));
  },
}));
