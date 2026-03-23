import React, { useState, useEffect } from 'react';
import {
  Select,
  Button,
  Modal,
  Input,
  Table,
  Space,
  Popconfirm,
  message,
} from 'antd';
import {
  SettingOutlined,
  PlusOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useGlobalEnvironmentStore } from '../../stores/globalEnvironmentStore';
import type { Environment } from '../../types';
import { createEnvironmentId } from '../../types';
import './EnvironmentManager.css';

interface VariableRow {
  key: string;
  name: string;
  value: string;
}

const EnvironmentManager: React.FC = () => {
  const { t } = useTranslation();
  const {
    environments,
    activeEnvironmentId,
    isLoaded,
    loadEnvironments,
    saveEnvironment,
    deleteEnvironment,
    setActiveEnvironment,
  } = useGlobalEnvironmentStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [envName, setEnvName] = useState('');
  const [variables, setVariables] = useState<VariableRow[]>([]);

  useEffect(() => {
    if (!isLoaded) {
      loadEnvironments();
    }
  }, [isLoaded, loadEnvironments]);

  const handleOpenManager = () => {
    const currentEnv = environments.find(e => e.id === activeEnvironmentId);
    if (currentEnv) {
      setEditingEnv(currentEnv);
      setEnvName(currentEnv.name);
      setVariables(
        Object.entries(currentEnv.variables).map(([name, value], index) => ({
          key: String(index),
          name,
          value,
        }))
      );
    } else {
      setEditingEnv(null);
      setEnvName('');
      setVariables([]);
    }
    setModalVisible(true);
  };

  const handleCreateNew = () => {
    setEditingEnv(null);
    setEnvName(t('environment.newEnvironment'));
    setVariables([{ key: '0', name: '', value: '' }]);
  };

  const handleSave = async () => {
    if (!envName.trim()) {
      message.warning(t('environment.enterName'));
      return;
    }

    const envId = editingEnv?.id || createEnvironmentId(envName);
    const envVariables: Record<string, string> = {};

    variables.forEach(row => {
      if (row.name.trim()) {
        envVariables[row.name.trim()] = row.value;
      }
    });

    const env: Environment = {
      id: envId,
      name: envName.trim(),
      variables: envVariables,
    };

    try {
      await saveEnvironment(env);
      await setActiveEnvironment(envId);
      message.success(t('environment.saved'));
      setEditingEnv(env);
    } catch {
      message.error(t('environment.failedSave'));
    }
  };

  const handleDelete = async () => {
    if (!editingEnv) return;

    try {
      await deleteEnvironment(editingEnv.id);
      message.success(t('environment.deleted'));

      const remaining = environments.filter(e => e.id !== editingEnv.id);
      if (remaining.length > 0) {
        await setActiveEnvironment(remaining[0].id);
        setEditingEnv(remaining[0]);
        setEnvName(remaining[0].name);
        setVariables(
          Object.entries(remaining[0].variables).map(([name, value], index) => ({
            key: String(index),
            name,
            value,
          }))
        );
      } else {
        setEditingEnv(null);
        setEnvName('');
        setVariables([]);
      }
    } catch {
      message.error(t('environment.failedDelete'));
    }
  };

  const handleAddVariable = () => {
    setVariables([
      ...variables,
      { key: String(Date.now()), name: '', value: '' },
    ]);
  };

  const handleRemoveVariable = (key: string) => {
    setVariables(variables.filter(v => v.key !== key));
  };

  const handleVariableChange = (
    key: string,
    field: 'name' | 'value',
    newValue: string
  ) => {
    setVariables(
      variables.map(v => (v.key === key ? { ...v, [field]: newValue } : v))
    );
  };

  const handleEnvSelect = async (envId: string) => {
    await setActiveEnvironment(envId);
    const env = environments.find(e => e.id === envId);
    if (env && modalVisible) {
      setEditingEnv(env);
      setEnvName(env.name);
      setVariables(
        Object.entries(env.variables).map(([name, value], index) => ({
          key: String(index),
          name,
          value,
        }))
      );
    }
  };

  const columns = [
    {
      title: t('environment.variable'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: VariableRow) => (
        <Input
          value={text}
          onChange={e => handleVariableChange(record.key, 'name', e.target.value)}
          placeholder={t('environment.varNamePlaceholder')}
          size="small"
        />
      ),
    },
    {
      title: t('editor.value'),
      dataIndex: 'value',
      key: 'value',
      render: (text: string, record: VariableRow) => (
        <Input
          value={text}
          onChange={e => handleVariableChange(record.key, 'value', e.target.value)}
          placeholder={t('environment.valuePlaceholder')}
          size="small"
        />
      ),
    },
    {
      title: '',
      key: 'action',
      width: 50,
      render: (_: unknown, record: VariableRow) => (
        <Button
          type="text"
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveVariable(record.key)}
          danger
        />
      ),
    },
  ];

  return (
    <div className="environment-manager">
      <Select
        value={activeEnvironmentId || undefined}
        onChange={handleEnvSelect}
        size="small"
        style={{ width: 140 }}
        placeholder={t('environment.selectEnv')}
        options={environments.map(env => ({
          value: env.id,
          label: env.name,
        }))}
      />
      <Button
        type="text"
        size="small"
        icon={<SettingOutlined />}
        onClick={handleOpenManager}
        title={t('environment.manage')}
      />

      <Modal
        title={t('environment.dialogTitle')}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={600}
        footer={[
          editingEnv && (
            <Popconfirm
              key="delete"
              title={t('environment.deleteConfirm')}
              onConfirm={handleDelete}
              okText={t('environment.yes')}
              cancelText={t('environment.no')}
            >
              <Button danger icon={<DeleteOutlined />}>
                {t('environment.delete')}
              </Button>
            </Popconfirm>
          ),
          <Button key="new" icon={<PlusOutlined />} onClick={handleCreateNew}>
            {t('environment.new')}
          </Button>,
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            {t('environment.cancel')}
          </Button>,
          <Button key="save" type="primary" onClick={handleSave}>
            {t('environment.save')}
          </Button>,
        ]}
      >
        <div className="env-modal-content">
          <div className="env-header">
            <Space>
              <span>{t('environment.envLabel')}</span>
              <Select
                value={editingEnv?.id}
                onChange={handleEnvSelect}
                style={{ width: 200 }}
                options={environments.map(env => ({
                  value: env.id,
                  label: env.name,
                }))}
              />
            </Space>
          </div>

          <div className="env-name-input">
            <span>{t('environment.nameLabel')}</span>
            <Input
              value={envName}
              onChange={e => setEnvName(e.target.value)}
              placeholder={t('environment.envNamePlaceholder')}
            />
          </div>

          <div className="env-variables">
            <div className="variables-header">
              <span>{t('environment.variables')}</span>
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleAddVariable}
              >
                {t('environment.addVariable')}
              </Button>
            </div>
            <Table
              dataSource={variables}
              columns={columns}
              pagination={false}
              size="small"
              rowKey="key"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EnvironmentManager;
