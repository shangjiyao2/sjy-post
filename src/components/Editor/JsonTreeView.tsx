import React, { useState, useMemo, useCallback } from 'react';
import { Input, Button, Tooltip, message } from 'antd';
import {
  CaretRightOutlined,
  CaretDownOutlined,
  CopyOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import './JsonTreeView.css';

interface JsonTreeViewProps {
  data: unknown;
  searchable?: boolean;
}

interface JsonNodeProps {
  keyName: string | number | null;
  value: unknown;
  path: string;
  level: number;
  searchTerm: string;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
}

const JsonTreeView: React.FC<JsonTreeViewProps> = ({ data, searchable = true }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['$']));

  const parsedData = useMemo(() => {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }, [data]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  const expandAll = useCallback(() => {
    const paths = new Set<string>();
    const collectPaths = (obj: unknown, path: string) => {
      paths.add(path);
      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => {
            collectPaths(item, `${path}[${index}]`);
          });
        } else {
          Object.entries(obj).forEach(([key, val]) => {
            collectPaths(val, `${path}.${key}`);
          });
        }
      }
    };
    collectPaths(parsedData, '$');
    setExpandedPaths(paths);
  }, [parsedData]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set(['$']));
  }, []);

  return (
    <div className="json-tree-view">
      {searchable && (
        <div className="json-tree-toolbar">
          <Input
            size="small"
            placeholder={t('jsonTree.searchPlaceholder')}
            prefix={<SearchOutlined />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            allowClear
            className="search-input"
          />
          <Button size="small" onClick={expandAll}>
            {t('jsonTree.expandAll')}
          </Button>
          <Button size="small" onClick={collapseAll}>
            {t('jsonTree.collapseAll')}
          </Button>
        </div>
      )}
      <div className="json-tree-content">
        <JsonNode
          keyName={null}
          value={parsedData}
          path="$"
          level={0}
          searchTerm={searchTerm.toLowerCase()}
          expandedPaths={expandedPaths}
          onToggle={handleToggle}
        />
      </div>
    </div>
  );
};

const JsonNode: React.FC<JsonNodeProps> = ({
  keyName,
  value,
  path,
  level,
  searchTerm,
  expandedPaths,
  onToggle,
}) => {
  const { t } = useTranslation();
  const isExpanded = expandedPaths.has(path);
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);

  const copyPath = useCallback(() => {
    navigator.clipboard.writeText(path);
    message.success(t('jsonTree.pathCopied'));
  }, [path, t]);

  const copyValue = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    message.success(t('jsonTree.valueCopied'));
  }, [value, t]);

  const renderValue = () => {
    if (value === null) {
      return <span className="json-null">null</span>;
    }
    if (typeof value === 'boolean') {
      return <span className="json-boolean">{value.toString()}</span>;
    }
    if (typeof value === 'number') {
      return <span className="json-number">{value}</span>;
    }
    if (typeof value === 'string') {
      const displayValue = value.length > 100 ? value.substring(0, 100) + '...' : value;
      return <span className="json-string">"{displayValue}"</span>;
    }
    return null;
  };

  const shouldHighlight = searchTerm && (
    (keyName !== null && String(keyName).toLowerCase().includes(searchTerm)) ||
    (typeof value === 'string' && value.toLowerCase().includes(searchTerm)) ||
    (typeof value === 'number' && value.toString().includes(searchTerm))
  );

  const renderObjectPreview = () => {
    if (isArray) {
      return <span className="json-preview">{t('jsonTree.items', { count: (value as unknown[]).length })}</span>;
    }
    const keys = Object.keys(value as object);
    return <span className="json-preview">{t('jsonTree.keys', { count: keys.length })}</span>;
  };

  return (
    <div className={`json-node ${shouldHighlight ? 'highlighted' : ''}`}>
      <div
        className="json-node-row"
        style={{ paddingLeft: level * 16 }}
      >
        {isObject ? (
          <span className="toggle-icon" onClick={() => onToggle(path)}>
            {isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </span>
        ) : (
          <span className="toggle-icon placeholder" />
        )}

        {keyName !== null && (
          <>
            <span className="json-key">"{keyName}"</span>
            <span className="json-colon">: </span>
          </>
        )}

        {isObject ? (
          <>
            <span className="json-bracket">{isArray ? '[' : '{'}</span>
            {!isExpanded && renderObjectPreview()}
            {!isExpanded && <span className="json-bracket">{isArray ? ']' : '}'}</span>}
          </>
        ) : (
          renderValue()
        )}

        <span className="json-actions">
          <Tooltip title={t('jsonTree.copyPath')}>
            <CopyOutlined className="action-icon" onClick={copyPath} />
          </Tooltip>
          {!isObject && (
            <Tooltip title={t('jsonTree.copyValue')}>
              <CopyOutlined className="action-icon" onClick={copyValue} />
            </Tooltip>
          )}
        </span>
      </div>

      {isObject && isExpanded && (
        <div className="json-children">
          {isArray ? (
            (value as unknown[]).map((item, index) => (
              <JsonNode
                key={index}
                keyName={index}
                value={item}
                path={`${path}[${index}]`}
                level={level + 1}
                searchTerm={searchTerm}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
              />
            ))
          ) : (
            Object.entries(value as object).map(([k, v]) => (
              <JsonNode
                key={k}
                keyName={k}
                value={v}
                path={`${path}.${k}`}
                level={level + 1}
                searchTerm={searchTerm}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
              />
            ))
          )}
          <div
            className="json-closing-bracket"
            style={{ paddingLeft: level * 16 }}
          >
            <span className="toggle-icon placeholder" />
            <span className="json-bracket">{isArray ? ']' : '}'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default JsonTreeView;
