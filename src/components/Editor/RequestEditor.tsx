import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Select, Button, Tabs, Table, Space, Radio, Form, Checkbox } from 'antd';
import type { RadioChangeEvent } from 'antd';
import { SendOutlined, SaveOutlined, PlusOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import type { RequestFile, HttpMethod, KeyValueItem, AuthConfig, Assertion, AssertionType, AssertionOperator } from '../../types';
import { HTTP_METHODS } from '../../types';
import VariableHighlightInput from '../common/VariableHighlightInput';
import MonacoEditor from '../common/MonacoEditor';
import './RequestEditor.css';

const { TextArea } = Input;
const { Password } = Input;

const renderCompactAddButton = (
  label: string,
  onClick: () => void,
  variant: 'default' | 'parameter' = 'default',
) => (
  <div className={`editor-table-actions ${variant === 'parameter' ? 'editor-table-actions-parameter' : ''}`}>
    <Button
      className={`editor-table-action ${variant === 'parameter' ? 'editor-table-action-parameter' : ''}`}
      size="small"
      icon={<PlusOutlined />}
      onClick={onClick}
    >
      {label}
    </Button>
  </div>
);

const renderCompactDeleteButton = (label: string, onClick: () => void) => (
  <Button
    className="editor-icon-action editor-icon-action-danger"
    size="small"
    type="text"
    aria-label={label}
    icon={<DeleteOutlined />}
    onClick={onClick}
  />
);

interface RequestEditorProps {
  title: string;
  request: RequestFile;
  isLoading: boolean;
  onChange: (updates: Partial<RequestFile>) => void;
  onSend: () => void;
  onSave?: () => void;
  variables?: Record<string, string>;
}

const METHOD_OPTIONS = HTTP_METHODS.map((method) => ({
  value: method,
  label: <span className={`method-option method-option-${method.toLowerCase()}`}>{method}</span>,
}));

const getMethodSelectClassName = (method: HttpMethod) => `method-select method-select-${method.toLowerCase()}`;

const getTabLabel = (label: string, count: number) => (
  count > 0 ? `${label} (${count})` : label
);

const RequestEditor: React.FC<RequestEditorProps> = ({
  title,
  request,
  isLoading,
  onChange,
  onSend,
  onSave,
  variables,
}) => {
  const { t } = useTranslation();
  const [activeBodyTab, setActiveBodyTab] = useState(() => request.body.type === 'none' ? 'none' : request.body.type);

  // Sync body tab when switching between requests
  React.useEffect(() => {
    setActiveBodyTab(request.body.type === 'none' ? 'none' : request.body.type);
  }, [request.id]);

  const handleMethodChange = (method: HttpMethod) => {
    onChange({ method });
  };

  const handleHeadersChange = (headers: Record<string, string>) => {
    onChange({ headers });
  };

  const handleQueryChange = (query: KeyValueItem[]) => {
    onChange({ query });
  };

  const handleBodyChange = (bodyContent: string) => {
    if (request.body.type === 'json') {
      onChange({ body: { type: 'json', content: bodyContent } });
    } else if (request.body.type === 'raw') {
      onChange({
        body: {
          type: 'raw',
          content: { content: bodyContent, content_type: request.body.content.content_type },
        },
      });
    }
  };

  const handleBodyTypeChange = (type: string) => {
    setActiveBodyTab(type);
    switch (type) {
      case 'none':
        onChange({ body: { type: 'none' } });
        break;
      case 'json':
        onChange({ body: { type: 'json', content: '{}' } });
        break;
      case 'form':
        onChange({ body: { type: 'form', content: [] } });
        break;
      case 'raw':
        onChange({ body: { type: 'raw', content: { content: '', content_type: 'text/plain' } } });
        break;
    }
  };

  const getBodyContent = (): string => {
    switch (request.body.type) {
      case 'json':
        return request.body.content;
      case 'raw':
        return request.body.content.content;
      default:
        return '';
    }
  };

  const queryCount = request.query.length;
  const headersCount = Object.keys(request.headers).length;
  const assertionCount = request.assertions.length;

  return (
    <div className="request-editor">
      <div className="request-editor-header">
        <span className="request-editor-title">{title}</span>
      </div>

      {/* URL Bar */}
      <div className="url-bar">
        <Select
          value={request.method}
          onChange={handleMethodChange}
          className={getMethodSelectClassName(request.method)}
          popupMatchSelectWidth={false}
          options={METHOD_OPTIONS}
          classNames={{ popup: { root: 'method-select-dropdown' } }}
        />

        <VariableHighlightInput
          className="url-input"
          placeholder={t('editor.urlPlaceholder')}
          value={request.url}
          onChange={(value) => onChange({ url: value })}
          onPressEnter={onSend}
          variables={variables}
        />

        <Space>
          {onSave && (
            <Button icon={<SaveOutlined />} onClick={onSave}>
              {t('editor.save')}
            </Button>
          )}
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={isLoading}
            onClick={onSend}
          >
            {t('editor.send')}
          </Button>
        </Space>
      </div>

      {/* Request Options Tabs */}
      <Tabs
        className="request-tabs"
        defaultActiveKey="params"
        size="small"
        items={[
          {
            key: 'params',
            label: getTabLabel(t('editor.params'), queryCount),
            children: (
              <KeyValueEditor
                items={request.query}
                onChange={handleQueryChange}
                placeholder={{ key: t('editor.paramName'), value: t('editor.value') }}
              />
            ),
          },
          {
            key: 'headers',
            label: getTabLabel(t('editor.headers'), headersCount),
            children: (
              <HeadersEditor
                headers={request.headers}
                onChange={handleHeadersChange}
              />
            ),
          },
          {
            key: 'body',
            label: t('editor.body'),
            children: (
              <div className="body-editor">
                <Tabs
                  className="body-type-tabs"
                  activeKey={activeBodyTab}
                  onChange={handleBodyTypeChange}
                  size="small"
                  items={[
                    { key: 'none', label: t('editor.none') },
                    { key: 'json', label: t('editor.json') },
                    { key: 'form', label: t('editor.form') },
                    { key: 'raw', label: t('editor.raw') },
                  ]}
                />
                {(request.body.type === 'json' || request.body.type === 'raw') && (
                  <div className="body-editor-content">
                    <MonacoEditor
                      value={getBodyContent()}
                      onChange={handleBodyChange}
                      language={request.body.type === 'json' ? 'json' : 'text'}
                      height={200}
                    />
                  </div>
                )}
                {request.body.type === 'form' && (
                  <FormKeyValueEditor
                    items={request.body.content}
                    onChange={(items) => onChange({ body: { type: 'form', content: items } })}
                    placeholder={{ key: 'Field name', value: t('editor.value') }}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'auth',
            label: t('editor.auth'),
            children: (
              <AuthEditor
                auth={request.auth}
                onChange={(auth) => onChange({ auth })}
              />
            ),
          },
          {
            key: 'assertions',
            label: getTabLabel(t('editor.tests'), assertionCount),
            children: (
              <AssertionEditor
                assertions={request.assertions}
                onChange={(assertions) => onChange({ assertions })}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

// Key-Value Editor Component (with checkbox for enable/disable)
interface KeyValueEditorProps {
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  placeholder?: { key: string; value: string };
}

const KeyValueEditor: React.FC<KeyValueEditorProps> = ({ items, onChange, placeholder }) => {
  const { t } = useTranslation();
  const addItem = () => {
    onChange([...items, { key: '', value: '', description: '', enabled: true }]);
  };

  const updateItem = (index: number, field: keyof KeyValueItem, value: string | boolean) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange(newItems);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const allChecked = items.length > 0 && items.every((item) => item.enabled);
  const someChecked = items.some((item) => item.enabled) && !allChecked;

  const toggleAll = (checked: boolean) => {
    onChange(items.map((item) => ({ ...item, enabled: checked })));
  };

  return (
    <div className="key-value-editor">
      <Table
        dataSource={items.map((item, index) => ({ ...item, index }))}
        rowKey="index"
        size="small"
        pagination={false}
        columns={[
          {
            title: (
              <Checkbox
                checked={allChecked}
                indeterminate={someChecked}
                onChange={(e) => toggleAll(e.target.checked)}
              />
            ),
            width: 36,
            dataIndex: 'enabled',
            render: (_, record) => (
              <Checkbox
                checked={record.enabled}
                onChange={(e) => updateItem(record.index, 'enabled', e.target.checked)}
              />
            ),
          },
          {
            title: 'Key',
            dataIndex: 'key',
            render: (_, record) => (
              <Input
                size="small"
                placeholder={placeholder?.key}
                value={record.key}
                onChange={(e) => updateItem(record.index, 'key', e.target.value)}
                className={record.enabled ? '' : 'kv-disabled'}
              />
            ),
          },
          {
            title: 'Value',
            dataIndex: 'value',
            render: (_, record) => (
              <Input
                size="small"
                placeholder={placeholder?.value}
                value={record.value}
                onChange={(e) => updateItem(record.index, 'value', e.target.value)}
                className={record.enabled ? '' : 'kv-disabled'}
              />
            ),
          },
          {
            title: '',
            width: 48,
            render: (_, record) => renderCompactDeleteButton(t('environment.delete'), () => removeItem(record.index)),
          },
        ]}
      />
      {renderCompactAddButton(t('editor.add'), addItem, 'parameter')}
    </div>
  );
};

// Form Key-Value Editor Component (with file type support)
interface FormKeyValueEditorProps {
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  placeholder?: { key: string; value: string };
}

const FormKeyValueEditor: React.FC<FormKeyValueEditorProps> = ({ items, onChange, placeholder }) => {
  const { t } = useTranslation();

  const addItem = () => {
    onChange([...items, { key: '', value: '', description: '', enabled: true, valueType: 'text' }]);
  };

  const updateItem = (index: number, field: string, value: string | boolean) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value };
    // Clear value when switching type
    if (field === 'valueType') {
      item.value = '';
    }
    newItems[index] = item;
    onChange(newItems);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleSelectFile = async (index: number) => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        title: t('editor.selectFile'),
      });
      if (selected) {
        updateItem(index, 'value', selected);
      }
    } catch (e) {
      console.error('Failed to select file:', e);
    }
  };

  const allChecked = items.length > 0 && items.every((item) => item.enabled);
  const someChecked = items.some((item) => item.enabled) && !allChecked;

  const toggleAll = (checked: boolean) => {
    onChange(items.map((item) => ({ ...item, enabled: checked })));
  };

  return (
    <div className="key-value-editor">
      <Table
        dataSource={items.map((item, index) => ({ ...item, index }))}
        rowKey="index"
        size="small"
        pagination={false}
        columns={[
          {
            title: (
              <Checkbox
                checked={allChecked}
                indeterminate={someChecked}
                onChange={(e) => toggleAll(e.target.checked)}
              />
            ),
            width: 36,
            dataIndex: 'enabled',
            render: (_, record) => (
              <Checkbox
                checked={record.enabled}
                onChange={(e) => updateItem(record.index, 'enabled', e.target.checked)}
              />
            ),
          },
          {
            title: 'Key',
            dataIndex: 'key',
            render: (_, record) => (
              <Input
                size="small"
                placeholder={placeholder?.key}
                value={record.key}
                onChange={(e) => updateItem(record.index, 'key', e.target.value)}
                className={record.enabled ? '' : 'kv-disabled'}
              />
            ),
          },
          {
            title: t('editor.type'),
            width: 90,
            dataIndex: 'valueType',
            render: (_, record) => (
              <Select
                size="small"
                value={record.valueType || 'text'}
                onChange={(val) => updateItem(record.index, 'valueType', val)}
                style={{ width: '100%' }}
                options={[
                  { value: 'text', label: t('editor.text') },
                  { value: 'file', label: t('editor.file') },
                ]}
              />
            ),
          },
          {
            title: 'Value',
            dataIndex: 'value',
            render: (_, record) => {
              if ((record.valueType || 'text') === 'file') {
                return (
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      size="small"
                      placeholder={t('editor.selectFile')}
                      value={record.value}
                      readOnly
                      className={record.enabled ? '' : 'kv-disabled'}
                      style={{ flex: 1 }}
                    />
                    <Button
                      size="small"
                      icon={<UploadOutlined />}
                      onClick={() => handleSelectFile(record.index)}
                    />
                  </Space.Compact>
                );
              }
              return (
                <Input
                  size="small"
                  placeholder={placeholder?.value}
                  value={record.value}
                  onChange={(e) => updateItem(record.index, 'value', e.target.value)}
                  className={record.enabled ? '' : 'kv-disabled'}
                />
              );
            },
          },
          {
            title: '',
            width: 48,
            render: (_, record) => renderCompactDeleteButton(t('environment.delete'), () => removeItem(record.index)),
          },
        ]}
      />
      {renderCompactAddButton(t('editor.add'), addItem, 'parameter')}
    </div>
  );
};

// Headers Editor Component
interface HeadersEditorProps {
  headers: Record<string, string>;
  onChange: (headers: Record<string, string>) => void;
}

const HeadersEditor: React.FC<HeadersEditorProps> = ({ headers, onChange }) => {
  const { t } = useTranslation();

  // Keep internal state to allow empty-key rows during editing
  const [items, setItems] = React.useState<KeyValueItem[]>(() =>
    Object.entries(headers).map(([key, value]) => ({
      key,
      value,
      description: '',
      enabled: true,
    }))
  );

  // Sync external headers changes into internal state (e.g. on tab switch)
  const prevHeadersRef = React.useRef(headers);
  React.useEffect(() => {
    if (prevHeadersRef.current !== headers) {
      prevHeadersRef.current = headers;
      const externalItems = Object.entries(headers).map(([key, value]) => ({
        key,
        value,
        description: '',
        enabled: true,
      }));
      // Only reset if the non-empty keys differ (avoid overwriting during editing)
      const currentKeys = items
        .filter((i) => i.key)
        .map((i) => `${i.key}=${i.value}`)
        .sort((a, b) => a.localeCompare(b))
        .join('&');
      const externalKeys = externalItems
        .map((i) => `${i.key}=${i.value}`)
        .sort((a, b) => a.localeCompare(b))
        .join('&');
      if (currentKeys !== externalKeys) {
        setItems(externalItems);
      }
    }
  }, [headers]);

  const handleChange = (newItems: KeyValueItem[]) => {
    setItems(newItems);
    // Only sync non-empty keys to the external Record<string, string>
    const newHeaders: Record<string, string> = {};
    newItems.forEach((item) => {
      if (item.key) {
        newHeaders[item.key] = item.value;
      }
    });
    onChange(newHeaders);
  };

  return (
    <KeyValueEditor
      items={items}
      onChange={handleChange}
      placeholder={{ key: t('editor.headerName'), value: t('editor.value') }}
    />
  );
};

// Auth Editor Component
type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';

interface AuthEditorProps {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
}

const AuthEditor: React.FC<AuthEditorProps> = ({ auth, onChange }) => {
  const { t } = useTranslation();
  const handleTypeChange = (e: RadioChangeEvent) => {
    const type = e.target.value as AuthType;
    switch (type) {
      case 'none':
        onChange({ type: 'none' });
        break;
      case 'bearer':
        onChange({ type: 'bearer', token: '' });
        break;
      case 'basic':
        onChange({ type: 'basic', username: '', password: '' });
        break;
      case 'apikey':
        onChange({ type: 'apikey', key: '', value: '', add_to: 'header' });
        break;
    }
  };

  return (
    <div className="auth-editor">
      <div className="auth-type-selector">
        <Radio.Group value={auth.type} onChange={handleTypeChange}>
          <Radio.Button value="none">{t('editor.noAuth')}</Radio.Button>
          <Radio.Button value="bearer">{t('editor.bearerToken')}</Radio.Button>
          <Radio.Button value="basic">{t('editor.basicAuth')}</Radio.Button>
          <Radio.Button value="apikey">{t('editor.apiKey')}</Radio.Button>
        </Radio.Group>
      </div>

      <div className="auth-config">
        {auth.type === 'none' && (
          <div className="auth-none-message">
            {t('editor.noAuthMessage')}
          </div>
        )}

        {auth.type === 'bearer' && (
          <Form layout="vertical" className="auth-form">
            <Form.Item label={t('editor.token')}>
              <TextArea
                placeholder={t('editor.enterToken')}
                value={auth.token}
                onChange={(e) => onChange({ ...auth, token: e.target.value })}
                rows={3}
                className="mono"
              />
            </Form.Item>
          </Form>
        )}

        {auth.type === 'basic' && (
          <Form layout="vertical" className="auth-form">
            <Form.Item label={t('editor.username')}>
              <Input
                placeholder={t('editor.enterUsername')}
                value={auth.username}
                onChange={(e) => onChange({ ...auth, username: e.target.value })}
              />
            </Form.Item>
            <Form.Item label={t('editor.password')}>
              <Password
                placeholder={t('editor.enterPassword')}
                value={auth.password}
                onChange={(e) => onChange({ ...auth, password: e.target.value })}
              />
            </Form.Item>
          </Form>
        )}

        {auth.type === 'apikey' && (
          <Form layout="vertical" className="auth-form">
            <Form.Item label={t('editor.key')}>
              <Input
                placeholder={t('editor.headerQueryName')}
                value={auth.key}
                onChange={(e) => onChange({ ...auth, key: e.target.value })}
              />
            </Form.Item>
            <Form.Item label={t('editor.value')}>
              <Input
                placeholder={t('editor.apiKeyValue')}
                value={auth.value}
                onChange={(e) => onChange({ ...auth, value: e.target.value })}
              />
            </Form.Item>
            <Form.Item label={t('editor.addTo')}>
              <Radio.Group
                value={auth.add_to}
                onChange={(e) => onChange({ ...auth, add_to: e.target.value })}
              >
                <Radio value="header">{t('editor.header')}</Radio>
                <Radio value="query">{t('editor.queryParams')}</Radio>
              </Radio.Group>
            </Form.Item>
          </Form>
        )}
      </div>
    </div>
  );
};

// Assertion Editor Component
interface AssertionEditorProps {
  assertions: Assertion[];
  onChange: (assertions: Assertion[]) => void;
}

const ASSERTION_TYPES: { value: AssertionType; label: string }[] = [
  { value: 'status', label: 'editor.statusCode' },
  { value: 'responseTime', label: 'editor.responseTime' },
  { value: 'jsonPath', label: 'editor.jsonPath' },
];

const ASSERTION_OPERATORS: { value: AssertionOperator; label: string }[] = [
  { value: 'eq', label: '==' },
  { value: 'neq', label: '!=' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'contains', label: 'contains' },
  { value: 'exists', label: 'exists' },
];

const AssertionEditor: React.FC<AssertionEditorProps> = ({ assertions, onChange }) => {
  const { t } = useTranslation();
  const addAssertion = () => {
    const newAssertion: Assertion = {
      type: 'status',
      path: '',
      operator: 'eq',
      value: 200,
    };
    onChange([...assertions, newAssertion]);
  };

  const updateAssertion = (index: number, field: keyof Assertion, value: unknown) => {
    const newAssertions = [...assertions];
    newAssertions[index] = { ...newAssertions[index], [field]: value };

    // Reset path when changing to non-jsonPath type
    if (field === 'type' && value !== 'jsonPath') {
      newAssertions[index].path = '';
    }

    // Set default value based on type
    if (field === 'type') {
      if (value === 'status') {
        newAssertions[index].value = 200;
      } else if (value === 'responseTime') {
        newAssertions[index].value = 1000;
      } else if (value === 'jsonPath') {
        newAssertions[index].value = '';
      }
    }

    onChange(newAssertions);
  };

  const removeAssertion = (index: number) => {
    onChange(assertions.filter((_, i) => i !== index));
  };

  return (
    <div className="assertion-editor">
      {renderCompactAddButton(t('editor.addTest'), addAssertion)}
      <Table
        dataSource={assertions.map((item, index) => ({ ...item, index }))}
        rowKey="index"
        size="small"
        pagination={false}
        locale={{ emptyText: t('editor.noAssertions') }}
        columns={[
          {
            title: t('editor.type'),
            dataIndex: 'type',
            width: 140,
            render: (_, record) => (
              <Select
                size="small"
                value={record.type}
                onChange={(value) => updateAssertion(record.index, 'type', value)}
                style={{ width: '100%' }}
              options={ASSERTION_TYPES.map((at) => ({ value: at.value, label: t(at.label) }))}
              />
            ),
          },
          {
            title: t('editor.path'),
            dataIndex: 'path',
            width: 180,
            render: (_, record) => (
              <Input
                size="small"
                placeholder={record.type === 'jsonPath' ? '$.data.id' : '-'}
                value={record.path}
                onChange={(e) => updateAssertion(record.index, 'path', e.target.value)}
                disabled={record.type !== 'jsonPath'}
              />
            ),
          },
          {
            title: t('editor.operator'),
            dataIndex: 'operator',
            width: 100,
            render: (_, record) => (
              <Select
                size="small"
                value={record.operator}
                onChange={(value) => updateAssertion(record.index, 'operator', value)}
                style={{ width: '100%' }}
              options={ASSERTION_OPERATORS.map((op) => ({ value: op.value, label: op.label }))}
              />
            ),
          },
          {
            title: t('editor.expectedValue'),
            dataIndex: 'value',
            render: (_, record) => (
              <Input
                size="small"
                placeholder={t('editor.expectedPlaceholder')}
                value={String(record.value)}
                onChange={(e) => {
                  const val = e.target.value;
                  // Try to parse as number for status/responseTime
                  if (record.type === 'status' || record.type === 'responseTime') {
                    const num = Number.parseInt(val, 10);
                    updateAssertion(record.index, 'value', Number.isNaN(num) ? val : num);
                  } else {
                    updateAssertion(record.index, 'value', val);
                  }
                }}
              />
            ),
          },
          {
            title: '',
            width: 48,
            render: (_, record) =>
              renderCompactDeleteButton(t('environment.delete'), () => removeAssertion(record.index)),
          },
        ]}
      />
    </div>
  );
};

export default RequestEditor;
