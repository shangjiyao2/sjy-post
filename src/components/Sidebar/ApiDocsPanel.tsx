import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Spin, Dropdown, message, Modal, Checkbox, Button } from 'antd';
import type { MenuProps } from 'antd';
import { DeleteOutlined, RightOutlined, DownOutlined } from '@ant-design/icons';
import { useApiDocStore } from '../../stores/apiDocStore';
import { useProjectStore } from '../../stores/projectStore';
import { getHttpMethodColor } from '../../types';

const ApiDocsPanel: React.FC = () => {
  const { t } = useTranslation();
  const { activeProjectPath } = useProjectStore();
  const { docs, currentDocFileName, currentProjectPath, isLoading, loadDocs, viewDoc, deleteDoc, batchDeleteDocs } = useApiDocStore();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Effective path: prefer activeProjectPath, fallback to currentProjectPath from store
  const effectivePath = activeProjectPath || currentProjectPath;

  useEffect(() => {
    if (activeProjectPath) {
      loadDocs(activeProjectPath);
    }
  }, [activeProjectPath, loadDocs]);

  // Clear selection when docs change
  useEffect(() => {
    setSelectedFiles(new Set());
  }, [docs]);

  const handleView = (fileName: string) => {
    if (!effectivePath) return;
    viewDoc(effectivePath, fileName);
  };

  const handleDelete = (fileName: string) => {
    if (!effectivePath) return;
    Modal.confirm({
      title: t('apiDocs.deleteConfirm'),
      content: t('apiDocs.deleteMessage'),
      okText: t('apiDocs.delete'),
      okType: 'danger',
      cancelText: t('apiDocs.cancel'),
      onOk: async () => {
        await deleteDoc(effectivePath, fileName);
        message.success(t('apiDocs.deleted'));
      },
    });
  };

  const handleBatchDelete = () => {
    if (!effectivePath || selectedFiles.size === 0) return;
    const count = selectedFiles.size;
    Modal.confirm({
      title: t('apiDocs.deleteConfirm'),
      content: t('apiDocs.batchDeleteMessage', { count }),
      okText: t('apiDocs.delete'),
      okType: 'danger',
      cancelText: t('apiDocs.cancel'),
      onOk: async () => {
        await batchDeleteDocs(effectivePath, Array.from(selectedFiles));
        setSelectedFiles(new Set());
        message.success(t('apiDocs.batchDeleted', { count }));
      },
    });
  };

  const handleToggleSelect = (fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) {
        next.delete(fileName);
      } else {
        next.add(fileName);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedFiles.size === docs.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(docs.map((d) => d.fileName)));
    }
  };

  const toggleGroup = (controllerName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(controllerName)) {
        next.delete(controllerName);
      } else {
        next.add(controllerName);
      }
      return next;
    });
  };

  const getContextMenuItems = (): MenuProps['items'] => [
    { key: 'delete', label: t('apiDocs.delete'), icon: <DeleteOutlined />, danger: true },
  ];

  if (!effectivePath) {
    return (
      <div className="api-docs-panel" style={{ padding: 16 }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('apiDocs.openProjectFirst')}
        />
      </div>
    );
  }

  if (isLoading && docs.length === 0) {
    return (
      <div className="api-docs-panel" style={{ padding: 16, textAlign: 'center' }}>
        <Spin size="small" />
      </div>
    );
  }

  // Group docs by controllerName, preserving description from first doc in each group
  const grouped: { controllerName: string; displayName: string; docs: typeof docs }[] = [];
  const groupMap = new Map<string, { displayName: string; docs: typeof docs }>();

  for (const doc of docs) {
    const existing = groupMap.get(doc.controllerName);
    if (existing) {
      existing.docs.push(doc);
    } else {
      const displayName = doc.controllerDescription || doc.controllerName;
      const group = { displayName, docs: [doc] };
      groupMap.set(doc.controllerName, group);
      grouped.push({ controllerName: doc.controllerName, ...group });
    }
  }

  if (docs.length === 0) {
    return (
      <div className="api-docs-panel" style={{ padding: 16 }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('apiDocs.noDocs')}
        />
      </div>
    );
  }

  return (
    <div className="api-docs-panel" style={{ padding: '8px 0' }}>
      {/* Batch action bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 12px 8px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <Checkbox
          checked={selectedFiles.size === docs.length && docs.length > 0}
          indeterminate={selectedFiles.size > 0 && selectedFiles.size < docs.length}
          onChange={handleSelectAll}
        />
        {selectedFiles.size > 0 && (
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={handleBatchDelete}
          >
            {t('apiDocs.batchDelete', { count: selectedFiles.size })}
          </Button>
        )}
      </div>

      {grouped.map(({ controllerName, displayName, docs: controllerDocs }) => {
        const isCollapsed = collapsedGroups.has(controllerName);
        return (
          <div key={controllerName} className="api-docs-group">
            <button
              type="button"
              className="api-docs-group-header"
              style={{
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                userSelect: 'none',
                width: '100%',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
              }}
              aria-expanded={!isCollapsed}
              onClick={() => toggleGroup(controllerName)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggleGroup(controllerName);
                }
              }}
              title={controllerName}
            >
              {isCollapsed ? (
                <RightOutlined style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
              ) : (
                <DownOutlined style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
              )}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  fontWeight: 400,
                  flexShrink: 0,
                }}
              >
                {controllerDocs.length}
              </span>
            </button>
            {!isCollapsed && controllerDocs.map((doc) => (
              <Dropdown
                key={doc.fileName}
                menu={{
                  items: getContextMenuItems(),
                  onClick: ({ key }) => {
                    if (key === 'delete') handleDelete(doc.fileName);
                  },
                }}
                trigger={['contextMenu']}
              >
                <div
                  className={`api-doc-item ${currentDocFileName === doc.fileName ? 'active' : ''}`}
                  style={{
                    padding: '6px 12px 6px 30px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    background: currentDocFileName === doc.fileName ? 'var(--bg-hover)' : 'transparent',
                    borderLeft: currentDocFileName === doc.fileName ? '2px solid var(--color-primary)' : '2px solid transparent',
                  }}
                >
                  <Checkbox
                    checked={selectedFiles.has(doc.fileName)}
                    onClick={(e) => handleToggleSelect(doc.fileName, e)}
                  />
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    aria-current={currentDocFileName === doc.fileName ? 'true' : undefined}
                    onClick={() => handleView(doc.fileName)}
                  >
                    <span
                      style={{
                        color: getHttpMethodColor(doc.httpMethod, 'var(--text-tertiary)'),
                        fontWeight: 600,
                        fontSize: 11,
                        minWidth: 36,
                        flexShrink: 0,
                      }}
                    >
                      {doc.httpMethod}
                    </span>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text-primary)',
                      }}
                      title={doc.title || doc.endpointPath}
                    >
                      {doc.title || doc.endpointPath}
                    </span>
                  </button>
                </div>
              </Dropdown>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default ApiDocsPanel;
