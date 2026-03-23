import React, { useState, useRef, useEffect } from 'react';
import { Tabs, Input } from 'antd';
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
  const inputRef = useRef<InputRef>(null);

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
  };

  const handleRenameConfirm = (tabId: string) => {
    const trimmedName = editingName.trim();
    if (trimmedName && trimmedName !== tabs.find(t => t.id === tabId)?.title) {
      renameTab(tabId, trimmedName);
    }
    setEditingTabId(null);
    setEditingName('');
  };

  const handleRenameCancel = () => {
    setEditingTabId(null);
    setEditingName('');
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
            onBlur={() => handleRenameConfirm(tab.id)}
            onPressEnter={() => handleRenameConfirm(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleRenameCancel();
              }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 120, height: 20, fontSize: 13 }}
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
