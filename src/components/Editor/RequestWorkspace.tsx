import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input, TreeSelect, message } from 'antd';
import { useRequestStore } from '../../stores/requestStore';
import { useProjectStore } from '../../stores/projectStore';
import { useHistoryStore } from '../../stores/historyStore';
import RequestEditor from './RequestEditor';
import ResponseViewer from './ResponseViewer';
import WebSocketPanel from '../WebSocket/WebSocketPanel';
import type { HistoryEntry, RequestFile, AssertResult, TreeNode } from '../../types';
import * as api from '../../services/api';
import './RequestWorkspace.css';

// Helper to get body content as string
const getBodyString = (request: RequestFile): string | undefined => {
  switch (request.body.type) {
    case 'json':
      return request.body.content;
    case 'raw':
      return request.body.content.content;
    case 'form':
      return JSON.stringify(request.body.content);
    default:
      return undefined;
  }
};

// Convert TreeNode to TreeSelect format (only folders)
interface TreeSelectNode {
  value: string;
  title: string;
  children?: TreeSelectNode[];
}

const convertToTreeSelect = (nodes: TreeNode[]): TreeSelectNode[] => {
  return nodes
    .filter(node => node.node_type === 'folder')
    .map(node => ({
      value: node.path,
      title: node.name,
      children: node.children ? convertToTreeSelect(node.children) : undefined,
    }));
};

const RequestWorkspace: React.FC = () => {
  const { t } = useTranslation();
  const { getActiveTab, updateRequest, sendRequest, saveRequest, saveNewRequest } = useRequestStore();
  const { activeProjectPath, collections, getVariables, refreshTree } = useProjectStore();
  const { addEntry } = useHistoryStore();
  const [assertResults, setAssertResults] = useState<AssertResult[]>([]);

  // Save As modal state
  const [saveAsModalVisible, setSaveAsModalVisible] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsFolder, setSaveAsFolder] = useState('.');

  // Resizable divider state (percentage of request panel height)
  const [requestPanelRatio, setRequestPanelRatio] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingRatioRef = useRef<number | null>(null);

  const applyRequestPanelRatio = useCallback((nextRatio: number) => {
    setRequestPanelRatio((currentRatio) => (currentRatio === nextRatio ? currentRatio : nextRatio));
  }, []);

  function scheduleRequestPanelRatio(nextRatio: number) {
    pendingRatioRef.current = nextRatio;
    if (dragFrameRef.current !== null) {
      return;
    }
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      if (pendingRatioRef.current !== null) {
        applyRequestPanelRatio(pendingRatioRef.current);
        pendingRatioRef.current = null;
      }
    });
  }

  const handleDividerMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const startY = e.clientY;
    const containerRect = container.getBoundingClientRect();
    const containerHeight = containerRect.height;
    const startRatio = requestPanelRatio;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaRatio = (deltaY / containerHeight) * 100;
      const newRatio = Math.min(Math.max(startRatio + deltaRatio, 20), 80);
      scheduleRequestPanelRatio(newRatio);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      if (pendingRatioRef.current !== null) {
        applyRequestPanelRatio(pendingRatioRef.current);
        pendingRatioRef.current = null;
      }
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [requestPanelRatio]);

  const activeTab = getActiveTab();

  // Resolve project path for this tab
  const tabProjectPath = activeTab?.projectPath || activeProjectPath;
  const tabCollection = tabProjectPath ? collections[tabProjectPath] : undefined;

  // Build folder tree for TreeSelect from the tab's collection
  const folderTreeData = useMemo(() => {
    const tree = tabCollection?.treeData || [];
    const folders = convertToTreeSelect(tree);
    return [{ value: '.', title: t('workspace.rootFolder'), children: folders }];
  }, [tabCollection?.treeData, t]);

  if (!activeTab) {
    return (
      <div className="request-workspace empty">
        <div className="empty-message">
          <h2>{t('workspace.noRequest')}</h2>
          <p>{t('workspace.noRequestHint')}</p>
        </div>
      </div>
    );
  }

  // Render WebSocket panel for websocket tabs
  if (activeTab.type === 'websocket') {
    return (
      <div className="request-workspace">
        <WebSocketPanel />
      </div>
    );
  }

  const handleChange = (updates: Partial<typeof activeTab.request>) => {
    updateRequest(activeTab.id, updates);
  };

  const handleSend = async () => {
    const variables = getVariables(tabProjectPath || undefined);
    setAssertResults([]); // Clear previous results
    try {
      const response = await sendRequest(activeTab.id, variables);

      // Run assertions if we have a response and assertions defined
      if (response && activeTab.request.assertions.length > 0) {
        try {
          const results = await api.runAssertions(activeTab.request.assertions, response);
          setAssertResults(results);
        } catch {
          // Assertion errors don't block the response display
        }
      }

      // Add to history if we have a project and response
      if (tabProjectPath && response) {
        const request = activeTab.request;
        const historyEntry: HistoryEntry = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          method: request.method,
          url: request.url,
          status: response.status,
          time_ms: response.time_ms,
          size_bytes: response.size_bytes,
          request_name: request.name,
          request_headers: request.headers,
          request_body: getBodyString(request),
          response_headers: response.headers,
          response_body: response.body,
        };

        addEntry(tabProjectPath, historyEntry);
      }
    } catch {
      // Error already handled in store
    }
  };

  const handleSave = () => {
    if (!tabProjectPath) {
      message.warning(t('workspace.noProjectOpen'));
      return;
    }

    if (activeTab.filePath) {
      // Existing file - save directly
      saveRequest(activeTab.id, tabProjectPath);
      message.success(t('workspace.saved'));
    } else {
      // New request - show Save As dialog
      setSaveAsName(activeTab.request.name || t('store.untitled'));
      setSaveAsFolder('.');
      setSaveAsModalVisible(true);
    }
  };

  const handleSaveAs = async () => {
    if (!tabProjectPath) return;

    const trimmedName = saveAsName.trim();
    if (!trimmedName) {
      message.warning(t('workspace.enterRequestName'));
      return;
    }

    try {
      await saveNewRequest(activeTab.id, tabProjectPath, saveAsFolder, trimmedName);
      await refreshTree(tabProjectPath);
      message.success(t('workspace.saved'));
      setSaveAsModalVisible(false);
    } catch (e) {
      message.error(t('workspace.saveFailed', { error: String(e) }));
    }
  };

  return (
    <div className="request-workspace" ref={containerRef}>
      <div className="workspace-panel request-panel" style={{ flex: `0 0 ${requestPanelRatio}%` }}>
        <RequestEditor
          title={activeTab.title || t('sidebar.newRequest')}
          request={activeTab.request}
          isLoading={activeTab.isLoading}
          onChange={handleChange}
          onSend={handleSend}
          onSave={tabProjectPath ? handleSave : undefined}
          variables={getVariables(tabProjectPath || undefined)}
        />
      </div>
      <button
        type="button"
        className="workspace-divider"
        onMouseDown={handleDividerMouseDown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            setRequestPanelRatio((currentRatio) => {
              const nextRatio = e.key === 'ArrowUp' ? currentRatio - 5 : currentRatio + 5;
              return Math.min(Math.max(nextRatio, 20), 80);
            });
          }
        }}
        aria-label="Resize request and response panels"
      />
      <div className="workspace-panel response-panel" style={{ flex: 1 }}>
        <ResponseViewer
          response={activeTab.response}
          isLoading={activeTab.isLoading}
          assertResults={assertResults}
        />
      </div>

      {/* Save As Modal */}
      <Modal
        title={t('workspace.saveAs')}
        open={saveAsModalVisible}
        onOk={handleSaveAs}
        onCancel={() => setSaveAsModalVisible(false)}
        okText={t('workspace.save')}
        cancelText={t('workspace.cancel')}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('workspace.requestName')}
          </label>
          <Input
            value={saveAsName}
            onChange={(e) => setSaveAsName(e.target.value)}
            placeholder={t('workspace.enterRequestName')}
            onPressEnter={handleSaveAs}
            autoFocus
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('workspace.saveLocation')}
          </label>
          <TreeSelect
            style={{ width: '100%' }}
            value={saveAsFolder}
            onChange={(value) => setSaveAsFolder(value)}
            treeData={folderTreeData}
            treeDefaultExpandAll
            placeholder={t('workspace.selectFolder')}
          />
        </div>
      </Modal>
    </div>
  );
};

export default RequestWorkspace;
