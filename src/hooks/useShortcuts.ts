import { useEffect, useCallback } from 'react';
import { useRequestStore } from '../stores/requestStore';
import { useProjectStore } from '../stores/projectStore';

interface ShortcutHandlers {
  onSend?: () => void;
  onSave?: () => void;
  onNewRequest?: () => void;
  onCloseTab?: () => void;
  onSearch?: () => void;
}

export const useShortcuts = (handlers?: ShortcutHandlers) => {
  const { openNewTab, closeTab, getActiveTab, sendRequest, saveRequest } = useRequestStore();
  const { activeProjectPath, getVariables } = useProjectStore();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    // Ctrl+Enter: Send request
    if (isCtrl && e.key === 'Enter') {
      e.preventDefault();
      if (handlers?.onSend) {
        handlers.onSend();
      } else {
        const activeTab = getActiveTab();
        if (activeTab) {
          const tabProjectPath = activeTab.projectPath || activeProjectPath;
          const variables = getVariables(tabProjectPath || undefined);
          sendRequest(activeTab.id, variables);
        }
      }
      return;
    }

    // Ctrl+S: Save request
    if (isCtrl && e.key === 's') {
      e.preventDefault();
      if (handlers?.onSave) {
        handlers.onSave();
      } else {
        const activeTab = getActiveTab();
        const tabProjectPath = activeTab?.projectPath || activeProjectPath;
        if (activeTab && activeTab.filePath && tabProjectPath) {
          saveRequest(activeTab.id, tabProjectPath);
        }
      }
      return;
    }

    // Ctrl+N: New request
    if (isCtrl && e.key === 'n') {
      e.preventDefault();
      if (handlers?.onNewRequest) {
        handlers.onNewRequest();
      } else {
        openNewTab();
      }
      return;
    }

    // Ctrl+W: Close current tab
    if (isCtrl && e.key === 'w') {
      e.preventDefault();
      if (handlers?.onCloseTab) {
        handlers.onCloseTab();
      } else {
        const activeTab = getActiveTab();
        if (activeTab) {
          closeTab(activeTab.id);
        }
      }
      return;
    }

    // Ctrl+Shift+F or Ctrl+F: Focus search (when implemented)
    if (isCtrl && (e.key === 'f' || (isShift && e.key === 'F'))) {
      if (handlers?.onSearch) {
        e.preventDefault();
        handlers.onSearch();
      }
      return;
    }
  }, [handlers, getActiveTab, getVariables, sendRequest, saveRequest, activeProjectPath, openNewTab, closeTab]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
};

export default useShortcuts;
