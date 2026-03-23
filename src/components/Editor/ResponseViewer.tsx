import React, { useState } from 'react';
import { Empty, Spin, Table } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { AssertResult, HttpResponse } from '../../types';
import JsonTreeView from './JsonTreeView';
import { SearchIcon } from '../Sidebar/TreeIcons';
import './ResponseViewer.css';

interface ResponseViewerProps {
  response: HttpResponse | null;
  isLoading: boolean;
  assertResults?: AssertResult[];
}

type StatusTone = 'success' | 'warning' | 'error' | 'neutral';
type ResponseTab = 'body' | 'headers' | 'cookies';


const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatTime = (ms: number): string => {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
};

const formatBody = (body: string, type: string): string => {
  if (type === 'json') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
};

const getStatusTone = (status: number): StatusTone => {
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'warning';
  if (status >= 400) return 'error';
  return 'neutral';
};

const ResponseBodySection: React.FC<{
  response: HttpResponse;
  bodyViewMode: 'raw' | 'tree';
  onChangeBodyViewMode: (mode: 'raw' | 'tree') => void;
  t: ReturnType<typeof useTranslation>['t'];
}> = ({ response, bodyViewMode, onChangeBodyViewMode, t }) => {
  if (response.body_type === 'binary') {
    return (
      <div className="response-body">
        <div className="binary-notice">
          {t('response.binaryContent', { size: formatSize(response.size_bytes) })}
        </div>
      </div>
    );
  }

  return (
    <div className="response-body">
      {response.body_type === 'json' && (
        <div className="body-view-toggle">
          <div className="response-body-toggle">
            <button
              type="button"
              className={`response-body-toggle-item ${bodyViewMode === 'raw' ? 'active' : ''}`}
              onClick={() => onChangeBodyViewMode('raw')}
            >
              {t('response.rawView')}
            </button>
            <button
              type="button"
              className={`response-body-toggle-item ${bodyViewMode === 'tree' ? 'active' : ''}`}
              onClick={() => onChangeBodyViewMode('tree')}
            >
              {t('response.treeView')}
            </button>
          </div>
        </div>
      )}

      {bodyViewMode === 'tree' && response.body_type === 'json' ? (
        <JsonTreeView data={response.body} />
      ) : (
        <div className="response-code-card">
          <pre className="response-code mono">{formatBody(response.body, response.body_type)}</pre>
        </div>
      )}
    </div>
  );
};

const ResponseTestsCollapsible: React.FC<{
  assertResults: AssertResult[];
  t: ReturnType<typeof useTranslation>['t'];
}> = ({ assertResults, t }) => {
  return (
    <details className="response-tests" open={false}>
      <summary className="response-tests-summary">{t('response.tests')}</summary>

      <div className="response-tests-content">
        {assertResults.length === 0 ? (
          <Empty description={t('response.noTests')} />
        ) : (
          <Table
            dataSource={assertResults.map((result, index) => ({ ...result, key: index }))}
            size="small"
            pagination={false}
            columns={[
              {
                title: t('response.status'),
                width: 80,
                render: (_, record) =>
                  record.passed ? (
                    <span className="test-pill success">
                      <CheckCircleOutlined /> {t('response.pass')}
                    </span>
                  ) : (
                    <span className="test-pill error">
                      <CloseCircleOutlined /> {t('response.fail')}
                    </span>
                  ),
              },
              {
                title: t('response.type'),
                width: 120,
                render: (_, record) => {
                  const typeLabels: Record<string, string> = {
                    status: t('editor.statusCode'),
                    responseTime: t('editor.responseTime'),
                    jsonPath: t('editor.jsonPath'),
                  };
                  return typeLabels[record.assertion.type] || record.assertion.type;
                },
              },
              {
                title: t('response.actual'),
                width: 120,
                dataIndex: 'actual_value',
                render: (text) => <code className="mono">{text}</code>,
              },
              {
                title: t('response.message'),
                dataIndex: 'message',
                render: (text) => <span className="test-message">{text}</span>,
              },
            ]}
          />
        )}
      </div>
    </details>
  );
};

const ResponseViewer: React.FC<ResponseViewerProps> = ({ response, isLoading, assertResults }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ResponseTab>('body');
  const [bodyViewMode, setBodyViewMode] = useState<'raw' | 'tree'>('raw');
  const [searchQuery, setSearchQuery] = useState('');

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const hasTests = !!assertResults && assertResults.length > 0;

  if (isLoading) {
    return (
      <div className="response-viewer loading">
        <Spin />
      </div>
    );
  }

  if (!response) {
    return (
      <div className="response-viewer empty">
        <Empty description={t('response.emptyHint')} />
      </div>
    );
  }

  const headersData = Object.entries(response.headers).map(([key, value], index) => ({
    key: index,
    name: key,
    value,
  }));

  const filteredHeadersData = normalizedSearchQuery
    ? headersData.filter(({ name, value }) => (
        name.toLowerCase().includes(normalizedSearchQuery)
        || value.toLowerCase().includes(normalizedSearchQuery)
      ))
    : headersData;

  const statusText = `${response.status} ${response.status_text}`;
  const statusTone = getStatusTone(response.status);

  const headerSection = (
    <div className="response-section">
      <Table
        dataSource={filteredHeadersData}
        size="small"
        pagination={false}
        columns={[
          {
            title: t('response.name'),
            dataIndex: 'name',
            width: '35%',
            render: (text) => <span className="header-name">{text}</span>,
          },
          {
            title: t('response.value'),
            dataIndex: 'value',
            render: (text) => <span className="header-value mono">{text}</span>,
          },
        ]}
      />
    </div>
  );

  const cookiesSection = (
    <div className="response-section">
      <Empty description={t('response.emptyHint')} />
    </div>
  );

  const bodySection = (
    <ResponseBodySection
      response={response}
      bodyViewMode={bodyViewMode}
      onChangeBodyViewMode={setBodyViewMode}
      t={t}
    />
  );

  const content = (() => {
    switch (activeTab) {
      case 'headers':
        return headerSection;
      case 'cookies':
        return cookiesSection;
      default:
        return bodySection;
    }
  })();

  return (
    <div className="response-viewer">
      <div className="response-status-bar">
        <span className="response-title">{t('response.title')}</span>
        <span className="response-status-spacer" />

        <span className={`response-pill response-pill-status ${statusTone}`}>{statusText}</span>
        <span className="response-pill response-pill-time">{formatTime(response.time_ms)}</span>
        <span className="response-pill response-pill-size">{formatSize(response.size_bytes)}</span>
      </div>

      <div className="response-search">
        <span className="response-search-icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          className="response-search-input"
          placeholder={t('response.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="response-tabs">
        <button
          type="button"
          className={`response-tab ${activeTab === 'body' ? 'active' : ''}`}
          onClick={() => setActiveTab('body')}
        >
          {t('response.body')}
        </button>
        <button
          type="button"
          className={`response-tab ${activeTab === 'headers' ? 'active' : ''}`}
          onClick={() => setActiveTab('headers')}
        >
          {t('response.headers')}
        </button>
        <button
          type="button"
          className={`response-tab ${activeTab === 'cookies' ? 'active' : ''}`}
          onClick={() => setActiveTab('cookies')}
        >
          {t('response.cookies')}
        </button>
      </div>

      {content}

      {hasTests && (
        <ResponseTestsCollapsible assertResults={assertResults} t={t} />
      )}
    </div>
  );
};

export default ResponseViewer;
