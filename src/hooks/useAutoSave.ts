import { useEffect, useRef, useCallback } from 'react';
import { useRequestStore } from '../stores/requestStore';

interface AutoSaveOptions {
  delay?: number; // Delay in milliseconds before auto-saving (default: 2000)
  enabled?: boolean; // Whether auto-save is enabled (default: true)
}

export const useAutoSave = (options: AutoSaveOptions = {}) => {
  const { delay = 2000, enabled = true } = options;
  const { tabs, saveRequest } = useRequestStore();
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastSavedContent = useRef<Map<string, string>>(new Map());

  const scheduleSave = useCallback((tabId: string, filePath: string, projectPath: string) => {
    if (!enabled) return;

    // Clear existing timeout for this tab
    const existingTimeout = timeoutRefs.current.get(tabId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new save
    const timeout = setTimeout(async () => {
      try {
        await saveRequest(tabId, projectPath);
        console.log(`Auto-saved: ${filePath}`);
      } catch (error) {
        console.error(`Auto-save failed for ${filePath}:`, error);
      }
      timeoutRefs.current.delete(tabId);
    }, delay);

    timeoutRefs.current.set(tabId, timeout);
  }, [enabled, delay, saveRequest]);

  useEffect(() => {
    if (!enabled) return;

    // Check for dirty tabs with file paths and project paths, schedule saves
    tabs.forEach(tab => {
      if (tab.isDirty && tab.filePath && tab.projectPath) {
        const currentContent = JSON.stringify(tab.request);
        const lastContent = lastSavedContent.current.get(tab.id);

        // Only schedule save if content has changed
        if (currentContent !== lastContent) {
          lastSavedContent.current.set(tab.id, currentContent);
          scheduleSave(tab.id, tab.filePath, tab.projectPath);
        }
      }
    });
  }, [tabs, enabled, scheduleSave]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      timeoutRefs.current.clear();
    };
  }, []);

  // Force save all dirty tabs (useful before closing app)
  const saveAllDirty = useCallback(async () => {
    const dirtyTabs = tabs.filter(tab => tab.isDirty && tab.filePath && tab.projectPath);

    await Promise.all(
      dirtyTabs.map(async tab => {
        try {
          await saveRequest(tab.id, tab.projectPath!);
        } catch (error) {
          console.error(`Failed to save ${tab.filePath}:`, error);
        }
      })
    );
  }, [tabs, saveRequest]);

  return { saveAllDirty };
};

export default useAutoSave;
