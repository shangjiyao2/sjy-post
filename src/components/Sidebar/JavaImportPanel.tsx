import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, message, Spin, Empty, Dropdown, Badge } from 'antd';
import type { MenuProps } from 'antd';
import {
  FolderOpenOutlined,
  JavaOutlined,
  DeleteOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import * as api from '../../services/api';
import type { JavaController, StoredJavaProject } from '../../services/api';
import { useJavaProjectStore } from '../../stores/javaProjectStore';
import './JavaImportPanel.css';

const JavaImportPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    projects: javaProjects,
    currentProject,
    isLoading: storeLoading,
    loadProjects,
    addProject,
    openProject: openJavaProject,
    closeProject: closeJavaProject,
    deleteProject: deleteJavaProject,
    checkForUpdates,
    setCurrentProject,
    resetImportedEndpoints,
  } = useJavaProjectStore();

  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<StoredJavaProject | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const handleAddJavaProject = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('javaImport.selectProject'),
      });

      if (selected && typeof selected === 'string') {
        setIsLoading(true);
        const result = await api.parseJavaProject(selected);

        const pathParts = selected.split(/[\\/]/);
        const projectName = pathParts[pathParts.length - 1] || 'Java Project';

        await addProject(projectName, selected, result);

        const endpointCount = result.controllers.reduce((acc: number, c: JavaController) => acc + c.endpoints.length, 0);
        message.success(t('javaImport.parseSuccess', { count: endpointCount }));
      }
    } catch {
      message.error(t('javaImport.selectError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenJavaProject = async (proj: StoredJavaProject) => {
    setIsLoading(true);
    try {
      await openJavaProject(proj.id);
      message.success(t('javaImport.refreshSuccess'));
    } catch {
      message.error(t('javaImport.parseError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectProject = async (proj: StoredJavaProject) => {
    if (!proj.isOpen) return;
    setCurrentProject(proj);
    resetImportedEndpoints();
    setIsLoading(true);
    try {
      await checkForUpdates(proj.id);
    } catch {
      message.error(t('javaImport.parseError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseJavaProject = async (proj: StoredJavaProject) => {
    await closeJavaProject(proj.id);
  };

  const handleDeleteJavaProject = async () => {
    if (!projectToDelete) return;
    await deleteJavaProject(projectToDelete.id);
    setDeleteConfirmVisible(false);
    setProjectToDelete(null);
    message.success(t('javaImport.deletedSuccess'));
  };

  const getProjectMenuItems = (proj: StoredJavaProject): MenuProps['items'] => [
    {
      key: 'open',
      icon: <FolderOpenOutlined />,
      label: t('javaImport.openProject'),
      disabled: proj.isOpen,
      onClick: () => handleOpenJavaProject(proj),
    },
    {
      key: 'close',
      icon: <CloseCircleOutlined />,
      label: t('javaImport.closeProject'),
      disabled: !proj.isOpen,
      onClick: () => handleCloseJavaProject(proj),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: t('javaImport.deleteProject'),
      danger: true,
      onClick: () => {
        setProjectToDelete(proj);
        setDeleteConfirmVisible(true);
      },
    },
  ];

  const loading = isLoading || storeLoading;

  return (
    <div className="java-import-panel">
      <div className="java-import-header">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddJavaProject}
          loading={loading}
          className="add-project-btn"
        >
          {t('javaImport.addProject')}
        </Button>
      </div>

      {javaProjects.length > 0 && (
        <div className="java-projects-list">
          <div className="section-title">{t('javaImport.savedProjects')}</div>
          {javaProjects.map((proj) => (
            <div
              key={proj.id}
              className={`java-project-item ${currentProject?.id === proj.id ? 'active' : ''} ${proj.isOpen ? 'open' : ''}`}
            >
              <button
                type="button"
                className="project-select-btn"
                onClick={() => handleSelectProject(proj)}
              >
                <div className="project-info">
                  <JavaOutlined className="project-icon" />
                  <div className="project-details">
                    <span className="project-name" title={proj.name}>{proj.name}</span>
                    <span className="project-path" title={proj.path}>
                      {proj.path.split(/[\\/]/).slice(-2).join('/')}
                    </span>
                  </div>
                  {proj.isOpen && (
                    <Badge status="success" className="open-badge" />
                  )}
                </div>
              </button>
              <Dropdown menu={{ items: getProjectMenuItems(proj) }} trigger={['click']}>
                <Button
                  type="text"
                  size="small"
                  icon={<MoreOutlined />}
                  className="project-menu-btn"
                  onClick={(e) => e.stopPropagation()}
                />
              </Dropdown>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="loading-state">
          <Spin />
        </div>
      )}

      {!loading && javaProjects.length === 0 && (
        <div className="empty-state">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('javaImport.emptyHint')}
          />
        </div>
      )}

      {!loading && javaProjects.length > 0 && !currentProject && (
        <div className="empty-state">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('javaImport.selectProjectHint')}
          />
        </div>
      )}

      <Modal
        title={t('javaImport.deleteConfirmTitle')}
        open={deleteConfirmVisible}
        onOk={handleDeleteJavaProject}
        onCancel={() => {
          setDeleteConfirmVisible(false);
          setProjectToDelete(null);
        }}
        okText={t('javaImport.confirm')}
        cancelText={t('javaImport.cancel')}
        okButtonProps={{ danger: true }}
      >
        <p>{t('javaImport.deleteConfirmMessage', { name: projectToDelete?.name })}</p>
      </Modal>
    </div>
  );
};

export default JavaImportPanel;
