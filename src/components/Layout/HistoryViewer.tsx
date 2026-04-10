import React, { useEffect, useMemo, useState } from 'react';
import { Empty } from 'antd';
import { useTranslation } from 'react-i18next';
import { SearchIcon } from '../Sidebar/TreeIcons';
import { useHistoryStore } from '../../stores/historyStore';
import { useProjectStore } from '../../stores/projectStore';
import { useHorizontalPaneResize } from '../../hooks/useHorizontalPaneResize';
import type { HistoryEntry } from '../../types';
import './HistoryViewer.css';
import './SplitPaneDivider.css';

type MethodFilter = 'GET' | 'POST' | null;
type DetailTab = 'overview' | 'request' | 'response' | 'tests';
type TranslateFn = ReturnType<typeof useTranslation>['t'];

interface HistoryRowProps {
  entry: HistoryEntry;
  isSelected: boolean;
  contextLine: string;
  summaryLine: string;
  onSelect: (entryId: string) => void;
  t: TranslateFn;
}

interface HistoryDetailContentProps {
  activeEnvironment: string | null;
  activeTab: DetailTab;
  collectionName: string;
  selected: HistoryEntry;
  setActiveTab: React.Dispatch<React.SetStateAction<DetailTab>>;
  t: TranslateFn;
}

function extractPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || url;
  } catch {
    const idx = url.indexOf('://');
    if (idx >= 0) {
      const slash = url.indexOf('/', idx + 3);
      return slash >= 0 ? url.slice(slash) : url;
    }
    return url;
  }
}

function formatTime(iso: string, t: TranslateFn): string {
  const value = new Date(iso);
  const diffMs = Date.now() - value.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return t('historyPanel.justNow');
  if (diffMins < 60) return t('historyPanel.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('historyPanel.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('historyPanel.daysAgo', { count: diffDays });

  return formatDateTime(iso);
}

function formatDateTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;

  const pad = (segment: number) => String(segment).padStart(2, '0');

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return 'var(--pill-success-text)';
  if (status >= 300 && status < 400) return 'var(--pill-time-text)';
  if (status >= 400 && status < 500) return 'var(--pill-warning-text)';
  if (status >= 500) return 'var(--pill-error-text)';
  return 'var(--text-muted)';
}

function safePrettyJson(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

function getUrlQueryParams(url: string): Array<{ key: string; value: string }> {
  try {
    const parsed = new URL(url);
    const output: Array<{ key: string; value: string }> = [];
    parsed.searchParams.forEach((value, key) => {
      output.push({ key, value });
    });
    return output;
  } catch {
    return [];
  }
}

function getBodyPreview(raw?: string): string | null {
  if (!raw) return null;

  const pretty = safePrettyJson(raw).trim();
  if (!pretty) return null;

  const firstLine = pretty
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ? firstLine.slice(0, 80) : null;
}

function getErrorPreview(raw?: string): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown> | string;
    if (typeof parsed === 'string') return parsed;
    if (typeof parsed.message === 'string') return parsed.message;
    if (typeof parsed.msg === 'string') return parsed.msg;
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Fall through to raw preview.
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)?.slice(0, 120) ?? null;
}

function getEntrySummaryValue(entry: HistoryEntry): string {
  const queryParams = getUrlQueryParams(entry.url);

  if (queryParams.length > 0) {
    return queryParams
      .slice(0, 2)
      .map(({ key, value }) => `${key}=${value}`)
      .join(' & ');
  }

  return getBodyPreview(entry.request_body) || '-';
}

function getProjectDisplayName(projectName: string | undefined, activeProjectPath: string | null): string {
  if (projectName) return projectName;
  if (!activeProjectPath) return '-';

  const segments = activeProjectPath.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || activeProjectPath;
}

function buildContextLine(
  t: TranslateFn,
  collectionName: string,
  activeEnvironment: string | null,
  requestName?: string,
): string {
  return [
    `${t('historyPanel.collectionLabel')}: ${collectionName}`,
    `${t('historyPanel.environmentLabel')}: ${activeEnvironment || '-'}`,
    `${t('historyPanel.requestLabel')}: ${requestName || '-'}`,
  ].join('  |  ');
}

function buildEntrySummaryLine(t: TranslateFn, entry: HistoryEntry): string {
  if (entry.status >= 400) {
    return `${t('historyPanel.errorLabel')}: ${getErrorPreview(entry.response_body) || entry.status}`;
  }

  return `${t('historyPanel.summaryLabel')}: ${getEntrySummaryValue(entry)}`;
}

function buildDetailParamsLine(t: TranslateFn, selected: HistoryEntry): string {
  const selectedQueryParams = getUrlQueryParams(selected.url);
  const paramsValue = selectedQueryParams.length > 0
    ? selectedQueryParams.map(({ key, value }) => `${key}=${value}`).join(' & ')
    : getEntrySummaryValue(selected);

  return `${t('historyPanel.requestParamsLabel')}: ${paramsValue}`;
}

function handleSelect(
  entryId: string,
  setActiveTab: React.Dispatch<React.SetStateAction<DetailTab>>,
  selectEntry: (value: string | null) => void,
) {
  selectEntry(entryId);
  setActiveTab('overview');
}

const HistoryRow: React.FC<HistoryRowProps> = ({ entry, isSelected, contextLine, summaryLine, onSelect, t }) => {
  const summaryClassName = entry.status >= 400 ? 'history-row-summary is-error' : 'history-row-summary';

  return (
    <button
      type="button"
      className={`history-row ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(entry.id)}
      aria-label={`${t('navRail.history')} ${extractPath(entry.url)}`}
    >
      <div className="history-row-meta">
        <span className={`history-method-badge method-${String(entry.method).toLowerCase()}`}>{entry.method}</span>
        <span className="history-row-status" style={{ color: getStatusColor(entry.status) }}>
          {entry.status}
        </span>
        <span className="history-row-time">{entry.time_ms} ms</span>
        <span className="history-row-when">{formatTime(entry.timestamp, t)}</span>
      </div>

      <div className="history-row-path">{extractPath(entry.url)}</div>
      <div className="history-row-context">{contextLine}</div>
      <div className={summaryClassName}>{summaryLine}</div>
    </button>
  );
};

const HistoryDetailContent: React.FC<HistoryDetailContentProps> = ({
  activeEnvironment,
  activeTab,
  collectionName,
  selected,
  setActiveTab,
  t,
}) => {
  const selectedQueryParams = getUrlQueryParams(selected.url);
  const detailMetaLine = `${selected.status} · ${selected.time_ms} ms · ${formatDateTime(selected.timestamp)}`;
  const detailContextLine = buildContextLine(t, collectionName, activeEnvironment, selected.request_name);
  const detailParamsLine = buildDetailParamsLine(t, selected);

  let tabContent: React.ReactNode = null;

  switch (activeTab) {
    case 'overview': {
      const paramsRows = selectedQueryParams.length > 0
        ? selectedQueryParams.map(({ key, value }) => (
            <div key={key} className="history-kv-row">
              <div className="history-kv-cell">{key}</div>
              <div className="history-kv-cell">{value}</div>
            </div>
          ))
        : (
          <div className="history-kv-row">
            <div className="history-kv-cell">-</div>
            <div className="history-kv-cell">-</div>
          </div>
        );

      tabContent = (
        <>
          <div className="history-detail-section">
            <div className="history-detail-section-title">{t('historyPanel.sectionParams')}</div>
            <div className="history-kv-box">
              <div className="history-kv-head">
                <div className="history-kv-cell muted">{t('historyPanel.keyColumn')}</div>
                <div className="history-kv-cell muted">{t('historyPanel.valueColumn')}</div>
              </div>
              {paramsRows}
            </div>
          </div>

          <div className="history-detail-section">
            <div className="history-detail-section-title">{t('historyPanel.sectionResponseSummary')}</div>
            <div className="history-code-box">
              <pre className="history-code">{safePrettyJson(selected.response_body) || '-'}</pre>
            </div>
          </div>
        </>
      );
      break;
    }
    case 'request':
      tabContent = (
        <div className="history-detail-section">
          <div className="history-detail-section-title">{t('historyPanel.sectionRequest')}</div>
          <div className="history-code-box">
            <pre className="history-code">{safePrettyJson(selected.request_body) || '-'}</pre>
          </div>
        </div>
      );
      break;
    case 'response':
      tabContent = (
        <div className="history-detail-section">
          <div className="history-detail-section-title">{t('historyPanel.sectionResponse')}</div>
          <div className="history-code-box">
            <pre className="history-code">{safePrettyJson(selected.response_body) || '-'}</pre>
          </div>
        </div>
      );
      break;
    case 'tests':
      tabContent = (
        <div className="history-detail-section">
          <div className="history-detail-section-title">{t('historyPanel.sectionTests')}</div>
          <div className="history-detail-empty-tests">{t('historyPanel.noTestsSaved')}</div>
        </div>
      );
      break;
    default:
      break;
  }

  return (
    <>
      <div className="history-detail-summary">
        <div className="history-detail-summary-title">
          {selected.method} {extractPath(selected.url)}
        </div>
        <div className="history-detail-summary-meta">{detailMetaLine}</div>
        <div className="history-detail-summary-meta">{detailContextLine}</div>
        <div className="history-detail-summary-meta">{detailParamsLine}</div>
      </div>

      <div className="history-detail-tabs">
        <button
          type="button"
          className={`history-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          aria-pressed={activeTab === 'overview'}
        >
          {t('historyPanel.tabOverview')}
        </button>
        <button
          type="button"
          className={`history-tab ${activeTab === 'request' ? 'active' : ''}`}
          onClick={() => setActiveTab('request')}
          aria-pressed={activeTab === 'request'}
        >
          {t('historyPanel.tabRequest')}
        </button>
        <button
          type="button"
          className={`history-tab ${activeTab === 'response' ? 'active' : ''}`}
          onClick={() => setActiveTab('response')}
          aria-pressed={activeTab === 'response'}
        >
          {t('historyPanel.tabResponse')}
        </button>
        <button
          type="button"
          className={`history-tab ${activeTab === 'tests' ? 'active' : ''}`}
          onClick={() => setActiveTab('tests')}
          aria-pressed={activeTab === 'tests'}
        >
          {t('historyPanel.tabTests')}
        </button>
      </div>

      {tabContent}
    </>
  );
};

function renderListBody(
  activeProjectPath: string | null,
  filteredEntries: HistoryEntry[],
  collectionName: string,
  activeEnvironment: string | null,
  onSelect: (entryId: string) => void,
  selectedEntryId: string | null,
  t: TranslateFn,
) {
  if (!activeProjectPath) {
    return (
      <div className="history-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('historyPanel.openProjectHint')} />
      </div>
    );
  }

  if (filteredEntries.length === 0) {
    return (
      <div className="history-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('historyPanel.noHistory')} />
      </div>
    );
  }

  return filteredEntries.map((entry) => (
    <HistoryRow
      key={entry.id}
      entry={entry}
      isSelected={selectedEntryId === entry.id}
      contextLine={buildContextLine(t, collectionName, activeEnvironment, entry.request_name)}
      summaryLine={buildEntrySummaryLine(t, entry)}
      onSelect={onSelect}
      t={t}
    />
  ));
}

const HistoryViewer: React.FC = () => {
  const { t } = useTranslation();
  const activeProjectPath = useProjectStore((state) => state.activeProjectPath);
  const activeEnvironment = useProjectStore((state) => state.activeEnvironment);
  const projectName = useProjectStore((state) => state.project?.name);

  const entries = useHistoryStore((state) => state.entries);
  const isLoading = useHistoryStore((state) => state.isLoading);
  const loadHistory = useHistoryStore((state) => state.loadHistory);
  const selectEntry = useHistoryStore((state) => state.selectEntry);
  const selectedEntryId = useHistoryStore((state) => state.selectedEntryId);

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('GET');
  const [errorOnly, setErrorOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const {
    containerRef,
    paneStyle,
    handleResizeKeyDown,
    handleResizeMouseDown,
  } = useHorizontalPaneResize({ initialWidth: 360, minWidth: 280, maxWidth: 520, minSecondaryWidth: 520 });

  useEffect(() => {
    if (activeProjectPath) {
      void loadHistory(activeProjectPath);
      return;
    }

    selectEntry(null);
  }, [activeProjectPath, loadHistory, selectEntry]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return entries.filter((entry) => {
      if (methodFilter && entry.method !== methodFilter) return false;
      if (errorOnly && entry.status < 400) return false;
      if (!query) return true;

      const url = entry.url.toLowerCase();
      const path = extractPath(entry.url).toLowerCase();
      const method = String(entry.method || '').toLowerCase();
      const requestName = (entry.request_name || '').toLowerCase();

      return url.includes(query) || path.includes(query) || method.includes(query) || requestName.includes(query);
    });
  }, [entries, errorOnly, methodFilter, search]);

  useEffect(() => {
    if (!activeProjectPath) return;

    const hasSelectedEntry = filteredEntries.some((entry) => entry.id === selectedEntryId);

    if (filteredEntries.length === 0) {
      if (selectedEntryId) {
        selectEntry(null);
      }
      return;
    }

    if (!hasSelectedEntry) {
      selectEntry(filteredEntries[0].id);
    }
  }, [activeProjectPath, filteredEntries, selectedEntryId, selectEntry]);

  const selected = useMemo(
    () => filteredEntries.find((entry) => entry.id === selectedEntryId) ?? null,
    [filteredEntries, selectedEntryId],
  );

  const collectionName = getProjectDisplayName(projectName, activeProjectPath);
  const collectionChipLabel = `${t('historyPanel.collectionLabel')}: ${collectionName}`;

  const handleRowSelect = (entryId: string) => {
    handleSelect(entryId, setActiveTab, selectEntry);
  };

  const listBody = renderListBody(
    activeProjectPath,
    filteredEntries,
    collectionName,
    activeEnvironment,
    handleRowSelect,
    selectedEntryId,
    t,
  );

  let detailBody: React.ReactNode = (
    <div className="history-detail-empty">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('historyPanel.selectFromLeft')} />
    </div>
  );

  if (selected) {
    detailBody = (
      <HistoryDetailContent
        activeEnvironment={activeEnvironment}
        activeTab={activeTab}
        collectionName={collectionName}
        selected={selected}
        setActiveTab={setActiveTab}
        t={t}
      />
    );
  }

  return (
    <div className="history-viewer" ref={containerRef}>
      <div className="history-list-pane" style={paneStyle}>
        <div className="history-list-title-row">
          <div className="history-list-title">{t('navRail.history')}</div>
          <div className="history-list-range-chip">{t('historyPanel.range24h')}</div>
        </div>

        <label className="history-list-search" aria-label={t('historyPanel.searchPlaceholder')}>
          <span className="history-list-search-icon">
            <SearchIcon />
          </span>
          <input
            className="history-list-search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('historyPanel.searchPlaceholder')}
          />
        </label>

        <div className="history-list-filters">
          <button
            className={`history-filter-chip ${methodFilter === 'GET' ? 'active' : ''}`}
            onClick={() => setMethodFilter((value) => (value === 'GET' ? null : 'GET'))}
            type="button"
            aria-pressed={methodFilter === 'GET'}
          >
            GET
          </button>
          <button
            className={`history-filter-chip ${methodFilter === 'POST' ? 'active' : ''}`}
            onClick={() => setMethodFilter((value) => (value === 'POST' ? null : 'POST'))}
            type="button"
            aria-pressed={methodFilter === 'POST'}
          >
            POST
          </button>
          <button
            className={`history-filter-chip ${errorOnly ? 'active' : ''}`}
            onClick={() => setErrorOnly((value) => !value)}
            type="button"
            aria-pressed={errorOnly}
          >
            4xx/5xx
          </button>
          <button className="history-filter-chip history-filter-chip-static" type="button" disabled>
            {collectionChipLabel}
          </button>
        </div>

        <div className="history-list-rows" data-loading={isLoading ? '1' : '0'}>
          {listBody}
        </div>
      </div>

      <button
        type="button"
        className="split-pane-divider"
        onMouseDown={handleResizeMouseDown}
        onKeyDown={handleResizeKeyDown}
        aria-label="Resize history panels"
      />

      <div className="history-detail-pane">
        <div className="history-detail-head">
          <div className="history-detail-title">{t('historyPanel.detailTitle')}</div>
          <div className="history-detail-chip">
            {selected ? t('historyPanel.selectedCount', { count: 1 }) : t('historyPanel.unselected')}
          </div>
        </div>

        {detailBody}
      </div>
    </div>
  );
};

export default HistoryViewer;
