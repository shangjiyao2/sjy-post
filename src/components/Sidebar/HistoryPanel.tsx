import React, { useEffect } from 'react';
import { List, Button, Empty, Popconfirm, message, Tooltip, Tag } from 'antd';
import { DeleteOutlined, ClearOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useHistoryStore } from '../../stores/historyStore';
import { useProjectStore } from '../../stores/projectStore';
import type { HistoryEntry } from '../../types';
import { getHttpMethodColor } from '../../types';
import './HistoryPanel.css';

const getStatusColor = (status: number): string => {
  if (status >= 200 && status < 300) return '#52c41a';
  if (status >= 300 && status < 400) return '#faad14';
  if (status >= 400 && status < 500) return '#ff4d4f';
  if (status >= 500) return '#cf1322';
  return '#999';
};

const formatTime = (timestamp: string, t: (key: string, opts?: Record<string, unknown>) => string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('historyPanel.justNow');
  if (diffMins < 60) return t('historyPanel.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('historyPanel.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('historyPanel.daysAgo', { count: diffDays });

  return date.toLocaleDateString();
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface HistoryPanelProps {
  onSelect?: (entry: HistoryEntry) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ onSelect }) => {
  const { t } = useTranslation();
  const { entries, isLoading, loadHistory, deleteEntry, clearHistory, selectEntry, selectedEntryId } = useHistoryStore();
  const { activeProjectPath } = useProjectStore();

  useEffect(() => {
    if (activeProjectPath) {
      loadHistory(activeProjectPath);
    }
  }, [activeProjectPath, loadHistory]);

  const handleDelete = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeProjectPath) return;

    try {
      await deleteEntry(activeProjectPath, entryId);
      message.success(t('historyPanel.deleted'));
    } catch (err) {
      message.error(t('historyPanel.failedDelete'));
    }
  };

  const handleClear = async () => {
    if (!activeProjectPath) return;

    try {
      await clearHistory(activeProjectPath);
      message.success(t('historyPanel.cleared'));
    } catch (err) {
      message.error(t('historyPanel.failedClear'));
    }
  };

  const handleSelect = (entry: HistoryEntry) => {
    selectEntry(entry.id);
    onSelect?.(entry);
  };

  const extractPath = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;
      return path.length > 40 ? path.slice(0, 40) + '...' : path;
    } catch {
      return url.length > 40 ? url.slice(0, 40) + '...' : url;
    }
  };

  if (!activeProjectPath) {
    return (
      <div className="history-panel-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('historyPanel.openProjectHint')}
        />
      </div>
    );
  }

  return (
    <div className="history-panel">
      <div className="history-panel-header">
        <span className="history-count">{t('historyPanel.requests', { count: entries.length })}</span>
        <Popconfirm
          title={t('historyPanel.clearConfirm')}
          description={t('historyPanel.clearWarning')}
          onConfirm={handleClear}
          okText={t('historyPanel.clear')}
          cancelText={t('historyPanel.cancel')}
          disabled={entries.length === 0}
        >
          <Button
            type="text"
            size="small"
            icon={<ClearOutlined />}
            disabled={entries.length === 0}
          >
            {t('historyPanel.clear')}
          </Button>
        </Popconfirm>
      </div>

      {entries.length === 0 ? (
        <div className="history-panel-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('historyPanel.noHistory')}
          />
        </div>
      ) : (
        <List
          className="history-list"
          loading={isLoading}
          dataSource={entries}
          renderItem={(entry) => (
            <List.Item
              key={entry.id}
              className={`history-item ${selectedEntryId === entry.id ? 'selected' : ''}`}
              onClick={() => handleSelect(entry)}
            >
              <div className="history-item-content">
                <div className="history-item-main">
                  <Tag
                    className="method-tag"
                    style={{
                      color: getHttpMethodColor(entry.method, '#999'),
                      borderColor: getHttpMethodColor(entry.method, '#999'),
                      backgroundColor: 'transparent',
                    }}
                  >
                    {entry.method}
                  </Tag>
                  <Tooltip title={entry.url}>
                    <span className="history-url">{extractPath(entry.url)}</span>
                  </Tooltip>
                </div>
                <div className="history-item-meta">
                  <span
                    className="history-status"
                    style={{ color: getStatusColor(entry.status) }}
                  >
                    {entry.status}
                  </span>
                  <span className="history-time">{entry.time_ms}ms</span>
                  <span className="history-size">{formatBytes(entry.size_bytes)}</span>
                  <span className="history-timestamp">
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {formatTime(entry.timestamp, t)}
                  </span>
                </div>
              </div>
              <Button
                type="text"
                size="small"
                className="history-delete-btn"
                icon={<DeleteOutlined />}
                onClick={(e) => handleDelete(entry.id, e)}
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
};

export default HistoryPanel;
