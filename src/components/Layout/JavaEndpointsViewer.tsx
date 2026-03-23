import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Empty, Input, Modal, Radio, Spin, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import type { StoredJavaProject } from '../../services/api';
import * as api from '../../services/api';
import { ChevronDownIcon, SearchIcon } from '../Sidebar/TreeIcons';
import { useProjectStore } from '../../stores/projectStore';
import { useJavaProjectStore, getEndpointCompositeKeys } from '../../stores/javaProjectStore';
import { useApiDocStore } from '../../stores/apiDocStore';
import { useNavStore } from '../../stores/navStore';
import { useHorizontalPaneResize } from '../../hooks/useHorizontalPaneResize';
import { formatProjectPathLabel } from '../../types';
import './JavaEndpointsViewer.css';
import './SplitPaneDivider.css';

type EndpointRow = {
  id: string;
  method: string;
  path: string;
  summary: string;
  isNew: boolean;
};

type EndpointGroup = {
  controllerName: string;
  endpoints: EndpointRow[];
  allSelected: boolean;
  partiallySelected: boolean;
};

const METHOD_CLASS_NAMES: Record<string, string> = {
  GET: 'java-method-badge method-get',
  POST: 'java-method-badge method-post',
  PUT: 'java-method-badge method-put',
  PATCH: 'java-method-badge method-patch',
  DELETE: 'java-method-badge method-delete',
  OPTIONS: 'java-method-badge method-options',
  HEAD: 'java-method-badge method-head',
};

const getMethodClassName = (method: string) => METHOD_CLASS_NAMES[method.toUpperCase()] ?? 'java-method-badge';
const DEFAULT_IMPORT_BASE_URL = '{{baseUrl}}';

function sameEndpointIds(current: string[], next: string[]) {
  return current.length === next.length && current.every((endpointId, index) => endpointId === next[index]);
}

const JavaEndpointsViewer: React.FC = () => {
  const { t } = useTranslation();
  const { activeProjectPath, project, openProject: openApiProject, refreshTree } = useProjectStore();
  const { setActiveNavItem } = useNavStore();
  const { loadDocs } = useApiDocStore();

  const projects = useJavaProjectStore((state) => state.projects);
  const currentProject = useJavaProjectStore((state) => state.currentProject);
  const parsedData = useJavaProjectStore((state) => state.parsedData);
  const newEndpointIds = useJavaProjectStore((state) => state.newEndpointIds);
  const importedEndpointIds = useJavaProjectStore((state) => state.importedEndpointIds);
  const checkForUpdates = useJavaProjectStore((state) => state.checkForUpdates);
  const markEndpointsSeen = useJavaProjectStore((state) => state.markEndpointsSeen);
  const markImportedEndpoints = useJavaProjectStore((state) => state.markImportedEndpoints);
  const loadProjects = useJavaProjectStore((state) => state.loadProjects);
  const addProject = useJavaProjectStore((state) => state.addProject);
  const openJavaProject = useJavaProjectStore((state) => state.openProject);
  const closeJavaProject = useJavaProjectStore((state) => state.closeProject);
  const deleteJavaProject = useJavaProjectStore((state) => state.deleteProject);
  const setCurrentProject = useJavaProjectStore((state) => state.setCurrentProject);
  const resetImportedEndpoints = useJavaProjectStore((state) => state.resetImportedEndpoints);
  const storeLoading = useJavaProjectStore((state) => state.isLoading);

  const [isLoading, setIsLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedEndpoints, setSelectedEndpoints] = useState<string[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importTarget, setImportTarget] = useState<'current' | 'new'>('current');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [duplicateConfirmVisible, setDuplicateConfirmVisible] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<StoredJavaProject | null>(null);
  const {
    containerRef,
    paneStyle,
    handleResizeKeyDown,
    handleResizeMouseDown,
  } = useHorizontalPaneResize({ initialWidth: 360, minWidth: 280, maxWidth: 520, minSecondaryWidth: 520 });

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!parsedData) {
      setSelectedEndpoints((current) => (current.length === 0 ? current : []));
      return;
    }

    const validIds = new Set(parsedData.controllers.flatMap((controller) => controller.endpoints.map((endpoint) => endpoint.id)));
    setSelectedEndpoints((current) => {
      const next = current.filter((endpointId) => validIds.has(endpointId));
      return sameEndpointIds(current, next) ? current : next;
    });
  }, [parsedData]);

  const loading = isLoading || storeLoading;
  const normalizedSearch = searchValue.trim().toLowerCase();
  const selectedEndpointSet = useMemo(() => new Set(selectedEndpoints), [selectedEndpoints]);
  const newEndpointIdSet = useMemo(() => new Set(newEndpointIds), [newEndpointIds]);

  const totalEndpointCount = useMemo(
    () => parsedData?.controllers.reduce((count, controller) => count + controller.endpoints.length, 0) ?? 0,
    [parsedData],
  );

  const endpointGroups = useMemo<EndpointGroup[]>(() => {
    if (!parsedData) return [];

    return parsedData.controllers
      .map((controller) => {
        const endpoints = controller.endpoints
          .filter((endpoint) => {
            if (!normalizedSearch) return true;
            const haystack = [endpoint.methodName, endpoint.path, endpoint.summary, endpoint.description, controller.name]
              .join(' ')
              .toLowerCase();
            return haystack.includes(normalizedSearch);
          })
          .map<EndpointRow>((endpoint) => ({
            id: endpoint.id,
            method: endpoint.httpMethod,
            path: endpoint.path,
            summary: endpoint.summary,
            isNew: newEndpointIdSet.has(endpoint.id),
          }));

        const selectedCount = endpoints.filter((endpoint) => selectedEndpointSet.has(endpoint.id)).length;

        return {
          controllerName: controller.name,
          endpoints,
          allSelected: endpoints.length > 0 && selectedCount === endpoints.length,
          partiallySelected: selectedCount > 0 && selectedCount < endpoints.length,
        };
      })
      .filter((group) => group.endpoints.length > 0);
  }, [newEndpointIdSet, normalizedSearch, parsedData, selectedEndpointSet]);

  const visibleEndpointIds = useMemo(
    () => endpointGroups.flatMap((group) => group.endpoints.map((endpoint) => endpoint.id)),
    [endpointGroups],
  );

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
        setSelectedEndpoints([]);

        const endpointCount = result.controllers.reduce((count, controller) => count + controller.endpoints.length, 0);
        message.success(t('javaImport.parseSuccess', { count: endpointCount }));
      }
    } catch {
      message.error(t('javaImport.selectError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectProject = async (projectRef: StoredJavaProject) => {
    setSelectedEndpoints([]);
    resetImportedEndpoints();
    setIsLoading(true);

    try {
      if (!projectRef.isOpen) {
        await openJavaProject(projectRef.id);
        message.success(t('javaImport.refreshSuccess'));
        return;
      }

      setCurrentProject(projectRef);
      await checkForUpdates(projectRef.id);
    } catch {
      message.error(t('javaImport.parseError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleProject = async (projectRef: StoredJavaProject, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsLoading(true);

    try {
      if (projectRef.isOpen) {
        await closeJavaProject(projectRef.id);
        if (currentProject?.id === projectRef.id) {
          setSelectedEndpoints([]);
        }
        return;
      }

      await openJavaProject(projectRef.id);
      message.success(t('javaImport.refreshSuccess'));
    } catch {
      message.error(t('javaImport.parseError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAskDeleteProject = (projectRef: StoredJavaProject, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setProjectToDelete(projectRef);
  };

  const handleDeleteJavaProject = async () => {
    if (!projectToDelete) return;

    setIsLoading(true);
    try {
      await deleteJavaProject(projectToDelete.id);
      if (currentProject?.id === projectToDelete.id) {
        setSelectedEndpoints([]);
      }
      message.success(t('javaImport.deletedSuccess'));
      setProjectToDelete(null);
    } catch {
      message.error(t('javaImport.parseError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateDocs = async () => {
    if (selectedEndpoints.length === 0 || !parsedData || !currentProject) {
      message.warning(t('javaImport.selectEndpoints'));
      return;
    }

    const targetProjectPath = activeProjectPath || currentProject.path;

    setIsGeneratingDocs(true);
    try {
      const result = await api.generateApiDocs({
        projectPath: targetProjectPath,
        endpointIds: selectedEndpoints,
        parsedData,
        javaProjectPath: currentProject.path,
      });
      message.success(t('apiDocs.generateSuccess', { count: result.generatedCount }));
      await loadDocs(targetProjectPath);
      setActiveNavItem('apiDocs');
    } catch {
      message.error(t('apiDocs.generateError'));
    } finally {
      setIsGeneratingDocs(false);
    }
  };

  const getCompositeKeysByEndpointIds = (endpointIds: string[]): string[] => {
    if (!parsedData) return [];
    return getEndpointCompositeKeys(parsedData, endpointIds);
  };

  const handleMarkAllSeen = async () => {
    if (!currentProject || newEndpointIds.length === 0 || !parsedData) return;

    const compositeKeys = getEndpointCompositeKeys(parsedData, newEndpointIds);

    await markEndpointsSeen(currentProject.id, compositeKeys);
    await checkForUpdates(currentProject.id);
    message.success(t('javaImport.markedAsSeen'));
  };

  const toggleEndpointSelection = (endpointId: string) => {
    setSelectedEndpoints((current) => (
      current.includes(endpointId)
        ? current.filter((id) => id !== endpointId)
        : [...current, endpointId]
    ));
  };

  const toggleControllerSelection = (group: EndpointGroup) => {
    const groupIds = group.endpoints.map((endpoint) => endpoint.id);

    setSelectedEndpoints((current) => {
      if (group.allSelected) {
        return current.filter((id) => !groupIds.includes(id));
      }

      return [...new Set([...current, ...groupIds])];
    });
  };

  const handleSelectAll = () => {
    setSelectedEndpoints(visibleEndpointIds);
  };

  const handleClearSelection = () => {
    setSelectedEndpoints([]);
  };

  const handleOpenImportModal = () => {
    if (selectedEndpoints.length === 0) {
      message.warning(t('javaImport.selectEndpoints'));
      return;
    }
    setImportModalVisible(true);
  };

  const handleSelectNewProjectPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('javaImport.selectNewProjectPath'),
      });
      if (selected && typeof selected === 'string') {
        setNewProjectPath(selected);
      }
    } catch {
      message.error(t('javaImport.selectError'));
    }
  };

  const executeImport = async (forceReimport: boolean) => {
    if (!parsedData) return;

    if (importTarget === 'new' && (!newProjectName || !newProjectPath)) {
      message.warning(t('javaImport.fillNewProjectInfo'));
      return;
    }

    if (importTarget === 'current' && !activeProjectPath) {
      message.warning(t('javaImport.openProjectFirst'));
      return;
    }

    const selectedCompositeKeys = getCompositeKeysByEndpointIds(selectedEndpoints);
    const duplicateKeys = selectedCompositeKeys.filter((key) => importedEndpointIds.includes(key));

    if (!forceReimport && duplicateKeys.length > 0) {
      setDuplicateCount(duplicateKeys.length);
      setDuplicateConfirmVisible(true);
      return;
    }

    setIsLoading(true);
    try {
      const targetPath = importTarget === 'current' ? activeProjectPath! : newProjectPath;
      const targetName = importTarget === 'new' ? newProjectName : undefined;

      const result = await api.importJavaEndpoints({
        projectPath: targetPath,
        projectName: targetName,
        endpoints: selectedEndpoints,
        parsedData,
        baseUrl: DEFAULT_IMPORT_BASE_URL,
        createNewProject: importTarget === 'new',
      });

      markImportedEndpoints(selectedCompositeKeys);

      message.success(t('javaImport.importSuccess', { count: selectedEndpoints.length }));
      setImportModalVisible(false);
      setDuplicateConfirmVisible(false);

      if (importTarget === 'new') {
        try {
          await openApiProject(result.projectPath);
        } catch {
          // ignore open failure, tree refresh below still runs for backend output path
        }
      }

      await refreshTree(importTarget === 'current' ? activeProjectPath! : result.projectPath);
      setActiveNavItem('collections');

      setSelectedEndpoints([]);
      setNewProjectName('');
      setNewProjectPath('');
    } catch {
      message.error(t('javaImport.importError'));
    } finally {
      setIsLoading(false);
    }
  };

  let projectEmptyState: React.ReactNode;

  if (loading && projects.length === 0) {
    projectEmptyState = (
      <div className="java-project-pane-empty">
        <Spin size="small" />
      </div>
    );
  } else if (projects.length === 0) {
    projectEmptyState = (
      <div className="java-project-pane-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('javaImport.emptyHint')} />
      </div>
    );
  } else {
    projectEmptyState = (
      <div className="java-project-list">
        {projects.map((projectRef) => {
          const isCurrent = currentProject?.id === projectRef.id;
          let statusLabel = t('javaImport.savedStatus');
          let statusDotClass = 'java-project-status-dot';
          let projectStatusTextClassName = 'java-project-status-text';

          if (isCurrent) {
            statusLabel = t('javaImport.currentProject');
            statusDotClass = 'java-project-status-dot active';
            projectStatusTextClassName = 'java-project-status-text active';
          } else if (projectRef.isOpen) {
            statusLabel = t('javaImport.openedStatus');
            statusDotClass = 'java-project-status-dot opened';
          }

          const projectCardClassName = isCurrent ? 'java-project-card active' : 'java-project-card';
          const toggleActionLabel = projectRef.isOpen ? t('javaImport.closeProject') : t('javaImport.openProject');

          return (
            <div key={projectRef.id} className={projectCardClassName}>
              <button
                type="button"
                className="java-project-card-main"
                onClick={() => handleSelectProject(projectRef)}
              >
                <div className="java-project-card-name">{projectRef.name}</div>
                <div className="java-project-card-path" title={projectRef.path}>
                  {formatProjectPathLabel(projectRef.path)}
                </div>
                <div className="java-project-card-meta">
                  <span className={statusDotClass} />
                  <span className={projectStatusTextClassName}>{statusLabel}</span>
                </div>
              </button>
              <div className="java-project-card-actions">
                <button
                  type="button"
                  className="java-project-card-action"
                  onClick={(event) => handleToggleProject(projectRef, event)}
                >
                  {toggleActionLabel}
                </button>
                <button
                  type="button"
                  className="java-project-card-action danger"
                  onClick={(event) => handleAskDeleteProject(projectRef, event)}
                >
                  {t('javaImport.deleteProject')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const rightPaneEmptyState = !currentProject || !parsedData;

  return (
    <div className="java-endpoints-viewer">
      <div className="java-viewer-topbar">
        <div className="java-viewer-title">{t('navRail.javaImport')}</div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddJavaProject}
          loading={loading}
          className="java-viewer-add-btn"
        >
          {t('javaImport.addProject')}
        </Button>
      </div>

      <div className="java-viewer-content" ref={containerRef}>
        <div className="java-project-pane" style={paneStyle}>
          <div className="java-pane-title">{t('javaImport.savedProjects')}</div>
          {projectEmptyState}
        </div>

        <button
          type="button"
          className="split-pane-divider"
          onMouseDown={handleResizeMouseDown}
          onKeyDown={handleResizeKeyDown}
          aria-label={t('javaImport.savedProjects')}
        />

        <div className="java-selection-pane">
          {rightPaneEmptyState ? (
            <div className="java-selection-empty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('javaImport.selectProjectHint')} />
            </div>
          ) : (
            <>
              <label className="java-search" aria-label={t('javaImport.searchPlaceholder')}>
                <span className="java-search-icon">
                  <SearchIcon />
                </span>
                <input
                  className="java-search-input"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={t('javaImport.searchPlaceholder')}
                />
              </label>

              <div className="java-actions-row">
                <div className="java-actions-left">
                  <button type="button" className="java-chip active" onClick={handleSelectAll}>
                    {t('javaImport.selectAll')}
                  </button>
                  <button type="button" className="java-chip" onClick={handleClearSelection}>
                    {t('javaImport.clearSelection')}
                  </button>
                </div>
                <div className="java-actions-right">
                  <button
                    type="button"
                    className="java-chip primary"
                    onClick={handleOpenImportModal}
                    disabled={selectedEndpoints.length === 0}
                  >
                    {t('javaImport.generateTests')}
                  </button>
                  <button
                    type="button"
                    className="java-chip accent"
                    onClick={handleGenerateDocs}
                    disabled={selectedEndpoints.length === 0 || isGeneratingDocs}
                  >
                    {isGeneratingDocs ? t('app.checkingUpdates') : t('javaImport.generateDocs')}
                  </button>
                </div>
              </div>

              {newEndpointIds.length > 0 && (
                <div className="java-new-endpoints-note">
                  <span>{t('javaImport.newEndpointsFound', { count: newEndpointIds.length })}</span>
                  <button type="button" className="java-inline-link" onClick={handleMarkAllSeen}>
                    {t('javaImport.markAllSeen')}
                  </button>
                </div>
              )}

              <div className="java-select-panel">
                <div className="java-select-panel-head">
                  <span>{t('javaImport.endpointSelection')}</span>
                </div>

                <div className="java-select-panel-body">
                  {endpointGroups.length === 0 ? (
                    <div className="java-selection-empty compact">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sidebar.noMatch')} />
                    </div>
                  ) : (
                    endpointGroups.map((group) => {
                      const controllerActive = group.allSelected || group.partiallySelected;
                      const controllerRowClassName = controllerActive ? 'java-controller-row active' : 'java-controller-row';
                      let controllerCheckboxClassName = 'java-checkbox';
                      if (group.allSelected) {
                        controllerCheckboxClassName = 'java-checkbox checked';
                      } else if (group.partiallySelected) {
                        controllerCheckboxClassName = 'java-checkbox partial';
                      }
                      const controllerCheckboxMark = group.allSelected ? '✓' : '';

                      return (
                        <div key={group.controllerName} className="java-controller-group">
                          <button
                            type="button"
                            className={controllerRowClassName}
                            onClick={() => toggleControllerSelection(group)}
                            aria-pressed={controllerActive}
                          >
                            <span className={controllerCheckboxClassName}>{controllerCheckboxMark}</span>
                            <span className="java-controller-chevron">
                              <ChevronDownIcon />
                            </span>
                            <span className="java-controller-name">{group.controllerName}</span>
                          </button>

                          <div className="java-endpoint-list">
                            {group.endpoints.map((endpoint) => {
                              const checked = selectedEndpointSet.has(endpoint.id);
                              const endpointRowClassName = checked ? 'java-endpoint-row active' : 'java-endpoint-row';
                              const endpointCheckboxClassName = checked ? 'java-checkbox checked' : 'java-checkbox';
                              const endpointCheckboxMark = checked ? '✓' : '';

                              return (
                                <button
                                  key={endpoint.id}
                                  type="button"
                                  className={endpointRowClassName}
                                  onClick={() => toggleEndpointSelection(endpoint.id)}
                                  aria-pressed={checked}
                                >
                                  <span className={endpointCheckboxClassName}>{endpointCheckboxMark}</span>
                                  {endpoint.isNew && <span className="java-endpoint-new-dot" />}
                                  <span className={getMethodClassName(endpoint.method)}>{endpoint.method}</span>
                                  <span className="java-endpoint-path">{endpoint.path}</span>
                                  {endpoint.summary && <span className="java-endpoint-summary">{endpoint.summary}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        title={t('javaImport.importTitle')}
        open={importModalVisible}
        onOk={() => executeImport(false)}
        onCancel={() => setImportModalVisible(false)}
        okText={t('javaImport.confirm')}
        cancelText={t('javaImport.cancel')}
        confirmLoading={isLoading}
      >
        <div className="java-import-modal-content">
          <div className="java-import-section">
            <div className="java-import-section-label">{t('javaImport.importTarget')}</div>
            <Radio.Group value={importTarget} onChange={(event) => setImportTarget(event.target.value)}>
              <Radio value="current" disabled={!activeProjectPath}>
                {t('javaImport.currentProjectOption')}
                {project && <span className="java-import-project-name">({project.name})</span>}
              </Radio>
              <Radio value="new">{t('javaImport.newProjectOption')}</Radio>
            </Radio.Group>
          </div>

          {importTarget === 'new' && (
            <div className="java-import-section">
              <div className="java-import-section-label">{t('javaImport.newProjectName')}</div>
              <Input
                placeholder={t('javaImport.enterProjectName')}
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
              />
              <div className="java-import-section-label with-top-gap">{t('javaImport.newProjectLocation')}</div>
              <Input.Search
                placeholder={t('javaImport.selectFolder')}
                value={newProjectPath}
                onSearch={handleSelectNewProjectPath}
                enterButton={t('javaImport.browse')}
                readOnly
              />
            </div>
          )}

          <div className="java-import-section compact">
            <div className="java-import-section-label">{t('javaImport.selected', { selected: selectedEndpoints.length, total: totalEndpointCount })}</div>
          </div>
        </div>
      </Modal>

      <Modal
        title={t('javaImport.reimportConfirmTitle')}
        open={duplicateConfirmVisible}
        onOk={() => executeImport(true)}
        onCancel={() => setDuplicateConfirmVisible(false)}
        okText={t('javaImport.confirm')}
        cancelText={t('javaImport.cancel')}
        confirmLoading={isLoading}
      >
        <p>{t('javaImport.reimportConfirmMessage', { count: duplicateCount })}</p>
      </Modal>

      <Modal
        title={t('javaImport.deleteConfirmTitle')}
        open={Boolean(projectToDelete)}
        onOk={handleDeleteJavaProject}
        onCancel={() => {
          setProjectToDelete(null);
        }}
        okText={t('javaImport.confirm')}
        cancelText={t('javaImport.cancel')}
        okButtonProps={{ danger: true }}
        confirmLoading={isLoading}
      >
        <p>{t('javaImport.deleteConfirmMessage', { name: projectToDelete?.name })}</p>
      </Modal>
    </div>
  );
};

export default JavaEndpointsViewer;
