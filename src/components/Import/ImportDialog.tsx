import React, { useState } from 'react';
import { Modal, Button, Tree, Checkbox, Space, Typography, Alert, Spin, message } from 'antd';
import {
  FolderOutlined,
  FileOutlined,
  ImportOutlined,
  FileAddOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '../../stores/projectStore';
import * as api from '../../services/api';
import type { ImportPreview, ImportNode } from '../../services/api';
import './ImportDialog.css';

const { Text } = Typography;

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
}

interface TreeDataNode {
  key: string;
  title: string;
  isLeaf: boolean;
  children?: TreeDataNode[];
}

const ImportDialog: React.FC<ImportDialogProps> = ({ open: isOpen, onClose }) => {
  const { t } = useTranslation();
  const [filePath, setFilePath] = useState<string>('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [includeEnvs, setIncludeEnvs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { activeProjectPath, refreshTree } = useProjectStore();

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: t('importDialog.postmanCollection'),
        filters: [
          { name: t('importDialog.postmanCollection'), extensions: ['json'] },
          { name: t('importDialog.allFiles'), extensions: ['*'] },
        ],
      });

      if (selected) {
        setFilePath(selected as string);
        setError(null);
        await loadPreview(selected as string);
      }
    } catch (e) {
      setError(`Failed to select file: ${e}`);
    }
  };

  const loadPreview = async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.previewImport(path);
      setPreview(result);
    } catch (e) {
      setError(`Failed to parse file: ${e}`);
      setPreview(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!activeProjectPath || !filePath) return;

    setIsImporting(true);
    setError(null);
    try {
      await api.executeImport({
        source_path: filePath,
        target_project_path: activeProjectPath,
        include_environments: includeEnvs,
      });
      message.success(t('importDialog.importSuccess'));
      await refreshTree(activeProjectPath);
      handleClose();
    } catch (e) {
      setError(`Failed to import: ${e}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFilePath('');
    setPreview(null);
    setError(null);
    setIncludeEnvs(true);
    onClose();
  };

  const convertToTreeData = (nodes: ImportNode[]): TreeDataNode[] => {
    return nodes.map((node, index) => ({
      key: `${node.name}-${index}`,
      title: node.name,
      isLeaf: node.node_type !== 'folder',
      children: node.children.length > 0 ? convertToTreeData(node.children) : undefined,
    }));
  };

  const treeData = preview ? convertToTreeData(preview.tree_preview) : [];

  return (
    <Modal
      title={
        <Space>
          <ImportOutlined />
          <span>{t('importDialog.title')}</span>
        </Space>
      }
      open={isOpen}
      onCancel={handleClose}
      width={600}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          {t('importDialog.cancel')}
        </Button>,
        <Button
          key="import"
          type="primary"
          onClick={handleImport}
          disabled={!preview || !activeProjectPath}
          loading={isImporting}
          icon={<ImportOutlined />}
        >
          {t('importDialog.import')}
        </Button>,
      ]}
    >
      <div className="import-dialog-content">
        {/* File Selection */}
        <div className="import-section">
          <Text strong>{t('importDialog.sourceFile')}</Text>
          <div className="file-selector">
            <Button icon={<FileAddOutlined />} onClick={handleSelectFile}>
              {t('importDialog.selectFile')}
            </Button>
            {filePath && (
              <Text className="file-path" ellipsis>
                {filePath}
              </Text>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <Alert
            type="error"
            message={error}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="loading-state">
            <Spin tip={t('importDialog.analyzing')} />
          </div>
        )}

        {/* Preview */}
        {preview && !isLoading && (
          <>
            {/* Summary */}
            <div className="import-section">
              <Text strong>{t('importDialog.summary')}</Text>
              <div className="import-summary">
                <div className="summary-item">
                  <Text type="secondary">{t('importDialog.sourceType')}</Text>
                  <Text>{preview.source_type}</Text>
                </div>
                <div className="summary-item">
                  <Text type="secondary">{t('importDialog.requests')}</Text>
                  <Text>{preview.total_requests}</Text>
                </div>
                <div className="summary-item">
                  <Text type="secondary">{t('importDialog.folders')}</Text>
                  <Text>{preview.total_folders}</Text>
                </div>
                {preview.environments > 0 && (
                  <div className="summary-item">
                    <Text type="secondary">{t('importDialog.environments')}</Text>
                    <Text>{preview.environments}</Text>
                  </div>
                )}
              </div>
            </div>

            {/* Options */}
            {preview.environments > 0 && (
              <div className="import-section">
                <Text strong>{t('importDialog.options')}</Text>
                <div className="import-options">
                  <Checkbox
                    checked={includeEnvs}
                    onChange={(e) => setIncludeEnvs(e.target.checked)}
                  >
                    {t('importDialog.importEnvs')}
                  </Checkbox>
                </div>
              </div>
            )}

            {/* Tree Preview */}
            <div className="import-section">
              <Text strong>{t('importDialog.contents')}</Text>
              <div className="tree-preview">
                {treeData.length > 0 ? (
                  <Tree
                    treeData={treeData}
                    showIcon
                    icon={(props: { isLeaf?: boolean }) =>
                      props.isLeaf ? <FileOutlined /> : <FolderOutlined />
                    }
                    defaultExpandAll
                    selectable={false}
                  />
                ) : (
                  <Text type="secondary">{t('importDialog.noItems')}</Text>
                )}
              </div>
            </div>
          </>
        )}

        {/* No Project Warning */}
        {!activeProjectPath && (
          <Alert
            type="warning"
            message={t('importDialog.openProjectFirst')}
            showIcon
          />
        )}
      </div>
    </Modal>
  );
};

export default ImportDialog;
