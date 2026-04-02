import React, { useState, useRef, useEffect } from 'react';
import { Tabs, Input, message } from 'antd';
import type { InputRef } from 'antd';
import { ApiOutlined } from '@ant-design/icons';
import { useRequestStore } from '../../stores/requestStore';
import { getHttpMethodColor } from '../../types';
import './TabBar.css';

const TabBar: React.FC = () => {
  const tabs = useRequestStore((s) => s.tabs);
  const activeTabId = useRequestStore((s) => s.activeTabId);
  const setActiveTab = useRequestStore((s) => s.setActiveTab);
  const closeTab = useRequestStore((s) => s.closeTab);
  const openNewTab = useRequestStore((s) => s.openNewTab);
  const renameTab = useRequestStore((s) => s.renameTab);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSubmittingRename, setIsSubmittingRename] = useState(false);
  const inputRef = useRef<InputRef>(null);
  const cancelRenameRef = useRef(false);

  // Focus input when editing starts
  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const onEdit = (targetKey: string | React.MouseEvent | React.KeyboardEvent, action: 'add' | 'remove') => {
    if (action === 'add') {
      openNewTab();
    } else if (typeof targetKey === 'string') {
      closeTab(targetKey);
    }
  };

  const handleDoubleClick = (tabId: string, currentTitle: string) => {
    setEditingTabId(tabId);
    setEditingName(currentTitle);
    cancelRenameRef.current = false;
  };

  const handleRenameConfirm = async (tabId: string) => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setEditingTabId(null);
      setEditingName('');
      setIsSubmittingRename(false);
      return;
    }

    const trimmedName = editingName.trim();
    if (trimmedName === tabs.find(t => t.id === tabId)?.title) {
      setEditingTabId(null);
      setEditingName('');
      return;
    }

    try {
      setIsSubmittingRename(true);
      await renameTab(tabId, editingName);
      setEditingTabId(null);
      setEditingName('');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } finally {
      setIsSubmittingRename(false);
    }
  };

  const handleRenameCancel = () => {
    setEditingTabId(null);
    setEditingName('');
    setIsSubmittingRename(false);
  };

  const renderTabLabel = (tab: typeof tabs[0]) => {
    const isEditing = editingTabId === tab.id;

    if (isEditing) {
      return (
        <span className="tab-label tab-editing">
          {tab.type === 'websocket' ? (
            <ApiOutlined style={{ color: '#9b59b6', marginRight: 4 }} />
          ) : (
            tab.request.method && (
              <span
                className="tab-method-indicator"
                style={{ backgroundColor: getHttpMethodColor(tab.request.method, 'transparent') }}
              />
            )
          )}
          <Input
            ref={inputRef}
            size="small"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={() => {
              void handleRenameConfirm(tab.id);
            }}
            onPressEnter={(e) => e.currentTarget.blur()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                cancelRenameRef.current = true;
                handleRenameCancel();
              }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 120, height: 20, fontSize: 13 }}
            disabled={isSubmittingRename}
          />
        </span>
      );
    }

    return (
      <button
        type="button"
        className="tab-label tab-label-button"
        onDoubleClick={(e) => {
          e.stopPropagation();
          handleDoubleClick(tab.id, tab.title);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            handleDoubleClick(tab.id, tab.title);
          }
        }}
      >
        {tab.type === 'websocket' ? (
          <ApiOutlined style={{ color: '#9b59b6', marginRight: 4 }} />
        ) : (
          tab.request.method && (
            <span
              className="tab-method-indicator"
              style={{ backgroundColor: getHttpMethodColor(tab.request.method, 'transparent') }}
            />
          )
        )}
        <span className="tab-title">{tab.title}</span>
        {tab.isDirty && <span className="tab-modified">●</span>}
      </button>
    );
  };

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="tab-bar">
      <Tabs
        type="editable-card"
        activeKey={activeTabId || undefined}
        onChange={setActiveTab}
        onEdit={onEdit}
        items={tabs.map(tab => ({
          key: tab.id,
          label: renderTabLabel(tab),
          closable: true,
        }))}
        size="small"
      />
    </div>
  );
};

export default TabBar;
