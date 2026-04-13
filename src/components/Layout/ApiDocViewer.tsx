import React, { useEffect, useMemo, useState } from 'react';
import { Empty, Spin, message } from 'antd';
import { CopyOutlined, DeleteOutlined, DownloadOutlined, DownOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useApiDocStore } from '../../stores/apiDocStore';
import { useProjectStore } from '../../stores/projectStore';
import type { ApiDocListItem } from '../../services/api';
import { useHorizontalPaneResize } from '../../hooks/useHorizontalPaneResize';
import { formatProjectPathLabel } from '../../types';
import { ChevronDownIcon, SearchIcon } from '../Sidebar/TreeIcons';
import './ApiDocViewer.css';
import './SplitPaneDivider.css';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

type ApiDocGroup = {
  controllerName: string;
  displayName: string;
  docs: ApiDocListItem[];
};

interface ApiDocRowProps {
  doc: ApiDocListItem;
  isActive: boolean;
  onSelectDoc: (fileName: string) => void;
}

interface ApiDocGroupSectionProps {
  controllerName: string;
  currentDocFileName: string | null;
  displayName: string;
  docs: ApiDocListItem[];
  isCollapsed: boolean;
  onSelectDoc: (fileName: string) => void;
  onToggleGroup: (controllerName: string) => void;
}

interface ApiDocListBodyProps {
  collapsedGroups: Set<string>;
  currentDocFileName: string | null;
  docs: ApiDocListItem[];
  groupedDocs: ApiDocGroup[];
  hasProject: boolean;
  isLoading: boolean;
  isProjectCollapsed: boolean;
  onSelectDoc: (fileName: string) => void;
  onToggleProject: () => void;
  onToggleGroup: (controllerName: string) => void;
  projectName: string;
  projectPathLabel: string;
  t: TranslateFn;
}

interface ApiDocDetailBodyProps {
  currentDocContent: string | null;
  currentDocFileName: string | null;
  docMetaText: string;
  hasDocs: boolean;
  isLoading: boolean;
  onCopyMarkdown: () => void;
  onDeleteCurrent: () => void;
  onExportCurrent: () => void;
  selectedDocMeta: ApiDocListItem | null;
  t: TranslateFn;
}

function safeFileName(name: string): string {
  return name.replaceAll(/[\\/:*?"<>|]+/g, '_');
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatSimpleDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function getMethodClassName(httpMethod: string) {
  return `api-docs-row-method method-${httpMethod.toLowerCase()}`;
}

function renderMarkdownCodeBlock(_match: string, _lang: string, code: string) {
  const normalizedCode = code.trim().replaceAll('\r\n', '\n').replaceAll('\n', '<br />');
  return `<pre><code>${normalizedCode}</code></pre>`;
}

function buildHeaderCell(header: string) {
  return `<th>${header.trim()}</th>`;
}

function buildDataCell(cell: string) {
  return `<td>${cell.trim()}</td>`;
}

function buildTableRow(row: string) {
  const cells = row.split('|').filter((cell: string) => cell.trim());
  const cellsHtml = cells.map(buildDataCell).join('');
  return `<tr>${cellsHtml}</tr>`;
}

function renderMarkdownTable(_match: string, headerRow: string, _separator: string, bodyRows: string) {
  const headers = headerRow.split('|').filter((cell: string) => cell.trim());
  const headerHtml = headers.map(buildHeaderCell).join('');
  const rows = bodyRows.trim().split('\n');
  const bodyHtml = rows.map(buildTableRow).join('');

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function wrapMarkdownList(match: string) {
  return `<ul>${match}</ul>`;
}

function buildGroupedDocs(docs: ApiDocListItem[], q: string) {
  const query = q.trim().toLowerCase();
  const groupMap = new Map<string, { displayName: string; docs: ApiDocListItem[] }>();
  const ordered: ApiDocGroup[] = [];

  for (const doc of docs) {
    if (query) {
      const title = (doc.title || '').toLowerCase();
      const endpoint = (doc.endpointPath || '').toLowerCase();
      const controller = `${doc.controllerDescription || ''} ${doc.controllerName || ''}`.toLowerCase();
      if (!title.includes(query) && !endpoint.includes(query) && !controller.includes(query)) continue;
    }

    const existing = groupMap.get(doc.controllerName);
    if (existing) {
      existing.docs.push(doc);
      continue;
    }

    const displayName = doc.controllerDescription || doc.controllerName;
    const group = { displayName, docs: [doc] };
    groupMap.set(doc.controllerName, group);
    ordered.push({ controllerName: doc.controllerName, ...group });
  }

  return ordered;
}

interface ApiDocProjectSectionProps {
  children: React.ReactNode;
  docCount: number;
  isCollapsed: boolean;
  onToggle: () => void;
  projectName: string;
  projectPathLabel: string;
}

const ApiDocProjectSection: React.FC<ApiDocProjectSectionProps> = ({
  children,
  docCount,
  isCollapsed,
  onToggle,
  projectName,
  projectPathLabel,
}) => {
  return (
    <div className="api-docs-project">
      <button
        type="button"
        className="api-docs-project-head"
        onClick={onToggle}
        title={projectName}
      >
        <ChevronDownIcon className={`api-docs-project-chevron ${isCollapsed ? 'collapsed' : 'expanded'}`} />
        <div className="api-docs-project-info">
          <span className="api-docs-project-name">{projectName}</span>
          <span className="api-docs-project-path">{projectPathLabel}</span>
        </div>
        <span className="api-docs-project-count">{docCount}</span>
      </button>

      {!isCollapsed && (
        <div className="api-docs-project-body">
          {children}
        </div>
      )}
    </div>
  );
};

const ApiDocRow: React.FC<ApiDocRowProps> = ({ doc, isActive, onSelectDoc }) => {
  const title = doc.title || doc.endpointPath;

  return (
    <button
      type="button"
      className={`api-docs-row ${isActive ? 'active' : ''}`}
      onClick={() => onSelectDoc(doc.fileName)}
    >
      {isActive && <span className="api-docs-row-dot" />}
      <span className={getMethodClassName(String(doc.httpMethod))}>{doc.httpMethod}</span>
      <span className="api-docs-row-title" title={title}>
        {title}
      </span>
    </button>
  );
};

const ApiDocGroupSection: React.FC<ApiDocGroupSectionProps> = ({
  controllerName,
  currentDocFileName,
  displayName,
  docs,
  isCollapsed,
  onSelectDoc,
  onToggleGroup,
}) => {
  return (
    <div className="api-docs-group">
      <button
        type="button"
        className="api-docs-group-head"
        onClick={() => onToggleGroup(controllerName)}
        title={controllerName}
      >
        {isCollapsed ? <RightOutlined /> : <DownOutlined />}
        <span className="api-docs-group-name">{displayName}</span>
        <span className="api-docs-group-count">{docs.length}</span>
      </button>

      {!isCollapsed && (
        <div className="api-docs-group-items">
          {docs.map((doc) => (
            <ApiDocRow
              key={doc.fileName}
              doc={doc}
              isActive={currentDocFileName === doc.fileName}
              onSelectDoc={onSelectDoc}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ApiDocListBody: React.FC<ApiDocListBodyProps> = ({
  collapsedGroups,
  currentDocFileName,
  docs,
  groupedDocs,
  hasProject,
  isLoading,
  isProjectCollapsed,
  onSelectDoc,
  onToggleProject,
  onToggleGroup,
  projectName,
  projectPathLabel,
  t,
}) => {
  if (!hasProject) {
    return (
      <div className="api-docs-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('apiDocs.openProjectFirst')} />
      </div>
    );
  }

  if (isLoading && docs.length === 0) {
    return (
      <div className="api-docs-loading">
        <Spin size="small" />
      </div>
    );
  }

  return (
    <ApiDocProjectSection
      docCount={docs.length}
      isCollapsed={isProjectCollapsed}
      onToggle={onToggleProject}
      projectName={projectName}
      projectPathLabel={projectPathLabel}
    >
      {groupedDocs.length === 0 ? (
        <div className="api-docs-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={docs.length === 0 ? t('apiDocs.noDocs') : t('apiDocs.noMatch')}
          />
        </div>
      ) : (
        groupedDocs.map(({ controllerName, displayName, docs: controllerDocs }) => (
          <ApiDocGroupSection
            key={controllerName}
            controllerName={controllerName}
            currentDocFileName={currentDocFileName}
            displayName={displayName}
            docs={controllerDocs}
            isCollapsed={collapsedGroups.has(controllerName)}
            onSelectDoc={onSelectDoc}
            onToggleGroup={onToggleGroup}
          />
        ))
      )}
    </ApiDocProjectSection>
  );
};

const ApiDocDetailBody: React.FC<ApiDocDetailBodyProps> = ({
  currentDocContent,
  currentDocFileName,
  docMetaText,
  hasDocs,
  isLoading,
  onCopyMarkdown,
  onDeleteCurrent,
  onExportCurrent,
  selectedDocMeta,
  t,
}) => {
  const hasDoc = Boolean(currentDocContent && currentDocFileName);

  if (isLoading && hasDocs && !hasDoc) {
    return (
      <div className="api-docs-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (!hasDoc) {
    return (
      <div className="api-docs-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('apiDocs.selectDocHint')} />
      </div>
    );
  }

  return (
    <>
      <div className="api-docs-doc-header">
        <div className="api-docs-doc-header-left">
          <div className="api-docs-doc-title">{selectedDocMeta?.title || currentDocFileName}</div>
          <div className="api-docs-doc-sub">
            {selectedDocMeta ? `${selectedDocMeta.httpMethod} ${selectedDocMeta.endpointPath}` : currentDocFileName}
          </div>
        </div>

        <div className="api-docs-doc-actions">
          <button type="button" className="api-docs-action" onClick={onCopyMarkdown}>
            <CopyOutlined />
            {t('apiDocs.copyMarkdown')}
          </button>
          <button type="button" className="api-docs-action" onClick={onExportCurrent}>
            <DownloadOutlined />
            {t('apiDocs.download')}
          </button>
          <button type="button" className="api-docs-action danger" onClick={onDeleteCurrent}>
            <DeleteOutlined />
            {t('apiDocs.delete')}
          </button>
        </div>
      </div>

      <div className="api-docs-doc-meta">
        <span className="api-docs-meta-chip">
          <span className="api-docs-meta-dot" />
          {t('apiDocs.stable')}
        </span>
        <span className="api-docs-meta-info">{docMetaText}</span>
      </div>

      <div className="api-docs-md-card">
        <MarkdownRenderer content={currentDocContent!} />
      </div>
    </>
  );
};

const ApiDocViewer: React.FC = () => {
  const { t } = useTranslation();
  const { activeProjectPath, collections } = useProjectStore();
  const {
    docs,
    currentDocContent,
    currentDocFileName,
    currentProjectPath,
    isLoading,
    loadDocs,
    viewDoc,
    deleteDoc,
    clearCurrentDoc,
  } = useApiDocStore();

  const effectivePath = activeProjectPath || currentProjectPath;
  const hasProject = Boolean(effectivePath);
  const projectEntry = effectivePath ? collections[effectivePath] : undefined;
  const projectName = projectEntry?.project.name || (effectivePath ? formatProjectPathLabel(effectivePath) : t('sidebar.project'));
  const projectPathLabel = effectivePath ? formatProjectPathLabel(effectivePath) : '-';

  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [isProjectCollapsed, setIsProjectCollapsed] = useState(false);
  const {
    containerRef,
    isStacked,
    paneStyle,
    handleResizeKeyDown,
    handleResizeMouseDown,
  } = useHorizontalPaneResize({ initialWidth: 360, minWidth: 280, maxWidth: 520, minSecondaryWidth: 520, stackedBreakpoint: 1200 });

  useEffect(() => {
    if (!activeProjectPath) return;
    loadDocs(activeProjectPath);
    clearCurrentDoc();
  }, [activeProjectPath, clearCurrentDoc, loadDocs]);

  useEffect(() => {
    setIsProjectCollapsed(false);
  }, [effectivePath]);

  const selectedDocMeta = useMemo(() => {
    if (!currentDocFileName) return null;
    return docs.find((d) => d.fileName === currentDocFileName) || null;
  }, [currentDocFileName, docs]);

  const groupedDocs = useMemo(() => buildGroupedDocs(docs, search), [docs, search]);

  const handleSync = async () => {
    if (!effectivePath) return;
    await loadDocs(effectivePath);
  };

  const handleExportCurrent = () => {
    if (!currentDocContent || !currentDocFileName) return;
    downloadTextFile(safeFileName(currentDocFileName), currentDocContent);
  };

  const handleCopyMarkdown = async () => {
    if (!currentDocContent) return;
    try {
      await navigator.clipboard.writeText(currentDocContent);
      message.success(t('apiDocs.copied'));
    } catch {
      message.error(t('apiDocs.copyFailed'));
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

  const toggleProject = () => {
    setIsProjectCollapsed((prev) => !prev);
  };

  const handleDeleteCurrent = async () => {
    if (!effectivePath || !currentDocFileName) return;
    try {
      await deleteDoc(effectivePath, currentDocFileName);
      message.success(t('apiDocs.deleted'));
    } catch {
      message.error(t('apiDocs.failedDelete'));
    }
  };

  const handleSelectDoc = (fileName: string) => {
    if (!effectivePath || currentDocFileName === fileName) {
      return;
    }

    viewDoc(effectivePath, fileName);
  };

  const docMetaText = (() => {
    if (!selectedDocMeta) return '-';
    const dateText = t('apiDocs.lastUpdated', { date: formatSimpleDate(selectedDocMeta.generatedAt) });
    const controllerText = t('apiDocs.controller', {
      name: selectedDocMeta.controllerDescription || selectedDocMeta.controllerName,
    });
    return `${dateText} · ${controllerText}`;
  })();

  return (
    <div className="api-docs-viewer" ref={containerRef}>
      <div className="api-docs-list-pane" style={paneStyle}>
        <div className="api-docs-list-head">
          <div className="api-docs-list-title">{t('navRail.apiDocs')}</div>
          <div className="api-docs-list-actions">
            <button type="button" className="api-docs-chip" onClick={handleSync} disabled={!effectivePath || isLoading}>
              <ReloadOutlined />
              {t('apiDocs.sync')}
            </button>
            <button
              type="button"
              className="api-docs-chip"
              onClick={handleExportCurrent}
              disabled={!currentDocContent || !currentDocFileName}
            >
              <DownloadOutlined />
              {t('apiDocs.export')}
            </button>
          </div>
        </div>

        <label className="api-docs-search" aria-label={t('apiDocs.searchPlaceholder')}>
          <span className="api-docs-search-icon">
            <SearchIcon />
          </span>
          <input
            className="api-docs-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('apiDocs.searchPlaceholder')}
          />
        </label>

        <div className="api-docs-tree">
          <ApiDocListBody
            collapsedGroups={collapsedGroups}
            currentDocFileName={currentDocFileName}
            docs={docs}
            groupedDocs={groupedDocs}
            hasProject={hasProject}
            isLoading={isLoading}
            isProjectCollapsed={isProjectCollapsed}
            onSelectDoc={handleSelectDoc}
            onToggleProject={toggleProject}
            onToggleGroup={toggleGroup}
            projectName={projectName}
            projectPathLabel={projectPathLabel}
            t={t}
          />
        </div>
      </div>

      <button
        type="button"
        className="split-pane-divider"
        onMouseDown={handleResizeMouseDown}
        onKeyDown={handleResizeKeyDown}
        aria-label={t('navRail.apiDocs')}
        hidden={isStacked}
      />

      <div className="api-docs-detail-pane">
        <div className="api-docs-doc-panel">
          <ApiDocDetailBody
            currentDocContent={currentDocContent}
            currentDocFileName={currentDocFileName}
            docMetaText={docMetaText}
            hasDocs={docs.length > 0}
            isLoading={isLoading}
            onCopyMarkdown={handleCopyMarkdown}
            onDeleteCurrent={handleDeleteCurrent}
            onExportCurrent={handleExportCurrent}
            selectedDocMeta={selectedDocMeta}
            t={t}
          />
        </div>
      </div>
    </div>
  );
};

/** Simple Markdown renderer using dangerouslySetInnerHTML with basic parsing */
const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const html = useMemo(() => parseMarkdown(content), [content]);
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
};

/** Lightweight Markdown to HTML converter for API docs */
function parseMarkdown(md: string): string {
  let html = md;

  // Escape HTML entities
  html = html.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

  // Code blocks (```...```)
  html = html.replaceAll(/```(\w*)\n([\s\S]*?)```/g, renderMarkdownCodeBlock);

  // Tables
  html = html.replaceAll(
    /(?:^|\n)(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/g,
    renderMarkdownTable,
  );

  // Headers
  html = html.replaceAll(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replaceAll(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replaceAll(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Inline code
  html = html.replaceAll(/`([^`]+)`/g, '<code>$1</code>');

  // List items
  html = html.replaceAll(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replaceAll(/(<li>.*<\/li>\n?)+/g, wrapMarkdownList);

  // Paragraphs - wrap remaining lines
  html = html.replaceAll(/^(?!<[a-z])((?!<\/)[^\n]+)$/gm, '<p>$1</p>');

  // Clean up empty paragraphs
  html = html.replaceAll(/<p>\s*<\/p>/g, '');

  return html;
}

export default ApiDocViewer;
