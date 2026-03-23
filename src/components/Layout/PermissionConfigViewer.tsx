import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Input, Popconfirm, Select, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileAddOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useJavaProjectStore } from '../../stores/javaProjectStore';
import { useNavStore } from '../../stores/navStore';
import { usePermissionConfigStore } from '../../stores/permissionConfigStore';
import type { StoredJavaProject, JavaEndpoint } from '../../services/api';
import type { PermissionConfigDraftRow } from '../../types/permission';
import { buildBatchPermissionSql, buildPermissionDraftRows, buildPermissionSql } from '../../utils/permissionSql';
import { ChevronDownIcon, SearchIcon } from '../Sidebar/TreeIcons';
import { useHorizontalPaneResize } from '../../hooks/useHorizontalPaneResize';
import { HTTP_METHODS, formatProjectPathLabel } from '../../types';
import './PermissionConfigViewer.css';
import './SplitPaneDivider.css';

const REQUEST_METHOD_OPTIONS = HTTP_METHODS.filter((method) => method !== 'HEAD' && method !== 'OPTIONS');
const REQUEST_METHOD_SELECT_OPTIONS = REQUEST_METHOD_OPTIONS.map((option) => ({ label: option, value: option }));

type PreviewMode = 'bulk' | 'row';

type EndpointRow = {
  id: string;
  label: string;
  method: string;
  path: string;
};

type EndpointGroup = {
  controllerName: string;
  endpoints: EndpointRow[];
  allSelected: boolean;
  partiallySelected: boolean;
};

const METHOD_CLASS_NAMES: Record<string, string> = {
  GET: 'permission-method-badge method-get',
  POST: 'permission-method-badge method-post',
  PUT: 'permission-method-badge method-put',
  PATCH: 'permission-method-badge method-patch',
  DELETE: 'permission-method-badge method-delete',
};

function getMethodClassName(method: string) {
  return METHOD_CLASS_NAMES[method.toUpperCase()] ?? 'permission-method-badge';
}

const PermissionConfigViewer: React.FC = () => {
  const { t } = useTranslation();
  const setActiveNavItem = useNavStore((state) => state.setActiveNavItem);

  const projects = useJavaProjectStore((state) => state.projects);
  const currentProject = useJavaProjectStore((state) => state.currentProject);
  const parsedData = useJavaProjectStore((state) => state.parsedData);
  const isJavaProjectsLoading = useJavaProjectStore((state) => state.isLoading);
  const loadProjects = useJavaProjectStore((state) => state.loadProjects);
  const openJavaProject = useJavaProjectStore((state) => state.openProject);
  const checkForUpdates = useJavaProjectStore((state) => state.checkForUpdates);
  const setCurrentProject = useJavaProjectStore((state) => state.setCurrentProject);
  const resetImportedEndpoints = useJavaProjectStore((state) => state.resetImportedEndpoints);

  const activeProjectKey = usePermissionConfigStore((state) => state.activeProjectKey);
  const form = usePermissionConfigStore((state) => state.form);
  const selectedEndpointIds = usePermissionConfigStore((state) => state.selectedEndpointIds);
  const generatedRows = usePermissionConfigStore((state) => state.generatedRows);
  const selectedRowIds = usePermissionConfigStore((state) => state.selectedRowIds);
  const setActiveProjectForm = usePermissionConfigStore((state) => state.setActiveProjectForm);
  const setFormField = usePermissionConfigStore((state) => state.setFormField);
  const setSelectedEndpointIds = usePermissionConfigStore((state) => state.setSelectedEndpointIds);
  const setGeneratedRows = usePermissionConfigStore((state) => state.setGeneratedRows);
  const updateGeneratedRow = usePermissionConfigStore((state) => state.updateGeneratedRow);
  const updateAllGeneratedRows = usePermissionConfigStore((state) => state.updateAllGeneratedRows);
  const removeGeneratedRow = usePermissionConfigStore((state) => state.removeGeneratedRow);
  const removeSelectedRows = usePermissionConfigStore((state) => state.removeSelectedRows);
  const setSelectedRowIds = usePermissionConfigStore((state) => state.setSelectedRowIds);
  const clearAll = usePermissionConfigStore((state) => state.clearAll);

  const [searchValue, setSearchValue] = useState('');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('bulk');
  const previewDialogRef = useRef<HTMLDialogElement | null>(null);
  const [activePreviewRowId, setActivePreviewRowId] = useState<string | null>(null);
  const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null);
  const {
    containerRef: viewerContainerRef,
    paneStyle: projectsPaneStyle,
    isDragging: isViewerDragging,
    handleResizeKeyDown: handleViewerResizeKeyDown,
    handleResizeMouseDown: handleViewerResizeMouseDown,
  } = useHorizontalPaneResize({ initialWidth: 360, minWidth: 280, maxWidth: 520, minSecondaryWidth: 860 });
  const {
    containerRef: mainContainerRef,
    isStacked: isMainStacked,
    paneStyle: apiSelectPaneStyle,
    isDragging: isMainDragging,
    handleResizeKeyDown: handleMainResizeKeyDown,
    handleResizeMouseDown: handleMainResizeMouseDown,
  } = useHorizontalPaneResize({ initialWidth: 320, minWidth: 280, maxWidth: 460, minSecondaryWidth: 520, stackedBreakpoint: 1024 });

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const projectKey = currentProject?.path ?? null;
    if (projectKey !== activeProjectKey) {
      setActiveProjectForm(projectKey);
      clearAll();
      setSearchValue('');
      previewDialogRef.current?.close();
      setActivePreviewRowId(null);
    }
  }, [activeProjectKey, clearAll, currentProject?.path, setActiveProjectForm]);

  useEffect(() => {
    if (!parsedData) {
      if (selectedEndpointIds.length > 0) {
        setSelectedEndpointIds([]);
      }
      return;
    }

    const validIds = new Set(parsedData.controllers.flatMap((controller) => controller.endpoints.map((endpoint) => endpoint.id)));
    const nextIds = selectedEndpointIds.filter((endpointId) => validIds.has(endpointId));

    if (nextIds.length !== selectedEndpointIds.length) {
      setSelectedEndpointIds(nextIds);
    }
  }, [parsedData, selectedEndpointIds, setSelectedEndpointIds]);

  const handleSelectJavaProject = async (proj: StoredJavaProject) => {
    setSwitchingProjectId(proj.id);
    resetImportedEndpoints();

    try {
      if (!proj.isOpen) {
        await openJavaProject(proj.id);
        return;
      }

      setCurrentProject(proj);
      await checkForUpdates(proj.id);
    } catch {
      message.error(t('javaImport.parseError'));
    } finally {
      setSwitchingProjectId(null);
    }
  };

  const endpointMap = useMemo(() => {
    const map = new Map<string, { controllerName: string; endpoint: JavaEndpoint }>();
    if (!parsedData) return map;
    for (const controller of parsedData.controllers) {
      for (const endpoint of controller.endpoints) {
        map.set(endpoint.id, { controllerName: controller.name, endpoint });
      }
    }
    return map;
  }, [parsedData]);

  const selectedEndpointSet = useMemo(() => new Set(selectedEndpointIds), [selectedEndpointIds]);
  const normalizedSearch = searchValue.trim().toLowerCase();

  const endpointGroups = useMemo<EndpointGroup[]>(() => {
    if (!parsedData) return [];

    return parsedData.controllers
      .map((controller) => {
        const endpoints = controller.endpoints
          .filter((endpoint) => {
            if (!normalizedSearch) return true;
            const haystack = [endpoint.summary, endpoint.methodName, endpoint.fullPath, controller.name].join(' ').toLowerCase();
            return haystack.includes(normalizedSearch);
          })
          .map<EndpointRow>((endpoint) => ({
            id: endpoint.id,
            label: endpoint.summary || endpoint.methodName || endpoint.fullPath,
            method: endpoint.httpMethod,
            path: endpoint.fullPath,
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
  }, [normalizedSearch, parsedData, selectedEndpointSet]);

  const visibleEndpointIds = useMemo(
    () => endpointGroups.flatMap((group) => group.endpoints.map((endpoint) => endpoint.id)),
    [endpointGroups],
  );

  const toggleEndpointSelection = (endpointId: string) => {
    setSelectedEndpointIds(
      selectedEndpointIds.includes(endpointId)
        ? selectedEndpointIds.filter((id) => id !== endpointId)
        : [...selectedEndpointIds, endpointId],
    );
  };

  const toggleControllerSelection = (group: EndpointGroup) => {
    const groupIds = group.endpoints.map((endpoint) => endpoint.id);

    if (group.allSelected) {
      setSelectedEndpointIds(selectedEndpointIds.filter((id) => !groupIds.includes(id)));
      return;
    }

    setSelectedEndpointIds([...new Set([...selectedEndpointIds, ...groupIds])]);
  };

  const rowsForBulkAction = useMemo(() => {
    if (selectedRowIds.length === 0) {
      return generatedRows;
    }
    const selectedSet = new Set(selectedRowIds);
    return generatedRows.filter((row) => selectedSet.has(row.id));
  }, [generatedRows, selectedRowIds]);

  const bulkScopeText = useMemo(() => {
    return selectedRowIds.length > 0
      ? t('permissionConfig.bulkScopeSelected', { count: rowsForBulkAction.length })
      : t('permissionConfig.bulkScopeAll', { count: rowsForBulkAction.length });
  }, [rowsForBulkAction.length, selectedRowIds.length, t]);

  const sqlPreviewContent = useMemo(
    () => buildBatchPermissionSql(rowsForBulkAction, form.dbName, form.tableName),
    [rowsForBulkAction, form.dbName, form.tableName],
  );

  const activePreviewRow = useMemo(() => {
    if (generatedRows.length === 0) {
      return null;
    }

    if (activePreviewRowId) {
      return generatedRows.find((row) => row.id === activePreviewRowId) ?? generatedRows[0];
    }

    return generatedRows[0];
  }, [activePreviewRowId, generatedRows]);

  const activePreviewSql = useMemo(
    () => (activePreviewRow ? buildPermissionSql(activePreviewRow, form.dbName, form.tableName) : ''),
    [activePreviewRow, form.dbName, form.tableName],
  );

  useEffect(() => {
    if (generatedRows.length === 0) {
      setActivePreviewRowId(null);
      return;
    }

    if (!activePreviewRowId || !generatedRows.some((row) => row.id === activePreviewRowId)) {
      setActivePreviewRowId(generatedRows[0].id);
    }
  }, [activePreviewRowId, generatedRows]);

  const syncRowsForConfigChange = (field: 'appId' | 'createUser' | 'updateUser', value: string) => {
    if (generatedRows.length === 0) {
      return;
    }

    if (field === 'appId') {
      if (generatedRows.every((row) => row.appId === value)) {
        return;
      }
      updateAllGeneratedRows((row) => (row.appId === value ? row : { ...row, appId: value }));
      return;
    }

    if (field === 'createUser') {
      const nextUpdateUser = form.updateUser.trim() || value;
      const shouldSync = generatedRows.some((row) => row.createUser !== value || (!form.updateUser.trim() && row.updateUser !== nextUpdateUser));
      if (!shouldSync) {
        return;
      }
      updateAllGeneratedRows((row) => {
        const nextRow = {
          ...row,
          createUser: value,
          updateUser: form.updateUser.trim() ? row.updateUser : nextUpdateUser,
        };
        return nextRow.createUser === row.createUser && nextRow.updateUser === row.updateUser ? row : nextRow;
      });
      return;
    }

    const nextUpdateUser = value.trim() || form.createUser.trim();
    if (generatedRows.every((row) => row.updateUser === nextUpdateUser)) {
      return;
    }
    updateAllGeneratedRows((row) => (row.updateUser === nextUpdateUser ? row : { ...row, updateUser: nextUpdateUser }));
  };

  const handleGenerate = () => {
    if (!form.initialServCode.trim()) {
      message.warning(t('permissionConfig.initialServCodeRequired'));
      return;
    }
    if (!form.appId.trim()) {
      message.warning(t('permissionConfig.appIdRequired'));
      return;
    }
    if (!form.createUser.trim()) {
      message.warning(t('permissionConfig.createUserRequired'));
      return;
    }
    if (selectedEndpointIds.length === 0) {
      message.warning(t('permissionConfig.selectEndpointsFirst'));
      return;
    }

    const selectedEndpoints = selectedEndpointIds
      .map((id) => endpointMap.get(id))
      .filter((item): item is { controllerName: string; endpoint: JavaEndpoint } => Boolean(item))
      .map((item) => ({ ...item.endpoint, controllerName: item.controllerName }));

    const rows = buildPermissionDraftRows(selectedEndpoints, form);
    setGeneratedRows(rows);
    message.success(t('permissionConfig.generateSuccess', { count: rows.length }));
  };

  const handleCopySelected = async () => {
    const rows = generatedRows.filter((row) => selectedRowIds.includes(row.id));
    if (rows.length === 0) {
      message.warning(t('permissionConfig.selectRowsFirst'));
      return;
    }

    try {
      await navigator.clipboard.writeText(buildBatchPermissionSql(rows, form.dbName, form.tableName));
      message.success(t('permissionConfig.copySelectedSuccess', { count: rows.length }));
    } catch {
      message.error(t('permissionConfig.copyFailed'));
    }
  };

  const handleCopyAll = async () => {
    if (generatedRows.length === 0) {
      message.warning(t('permissionConfig.noDrafts'));
      return;
    }

    try {
      await navigator.clipboard.writeText(buildBatchPermissionSql(generatedRows, form.dbName, form.tableName));
      message.success(t('permissionConfig.copyAllSuccess', { count: generatedRows.length }));
    } catch {
      message.error(t('permissionConfig.copyFailed'));
    }
  };

  const handleCopyBulkPreviewSql = async () => {
    if (!sqlPreviewContent) {
      message.warning(t('permissionConfig.noDrafts'));
      return;
    }

    try {
      await navigator.clipboard.writeText(sqlPreviewContent);
      message.success(t('permissionConfig.copied'));
    } catch {
      message.error(t('permissionConfig.copyFailed'));
    }
  };

  const handleClosePreview = () => {
    previewDialogRef.current?.close();
  };

  const handlePreviewSql = () => {
    if (generatedRows.length === 0) {
      message.warning(t('permissionConfig.noDrafts'));
      return;
    }
    setPreviewMode('bulk');
    previewDialogRef.current?.showModal();
  };

  const handleExportSql = async () => {
    if (rowsForBulkAction.length === 0) {
      message.warning(t('permissionConfig.noDrafts'));
      return;
    }

    try {
      const filePath = await save({
        title: t('permissionConfig.exportSql'),
        defaultPath: `permission-config-${new Date().toISOString().slice(0, 10)}.sql`,
        filters: [{ name: 'SQL', extensions: ['sql'] }],
      });

      if (!filePath) {
        return;
      }

      await writeTextFile(filePath, sqlPreviewContent);
      message.success(t('permissionConfig.exportSuccess', { count: rowsForBulkAction.length }));
    } catch {
      message.error(t('permissionConfig.exportFailed'));
    }
  };

  const handleCopyCurrentRowSql = useCallback(async (row: PermissionConfigDraftRow | null) => {
    if (!row) {
      message.warning(t('permissionConfig.clickRowToPreview'));
      return;
    }

    try {
      await navigator.clipboard.writeText(buildPermissionSql(row, form.dbName, form.tableName));
      message.success(t('permissionConfig.copyRowSuccess'));
    } catch {
      message.error(t('permissionConfig.copyFailed'));
    }
  }, [form.dbName, form.tableName, t]);

  const handleOpenCurrentRowPreview = useCallback((row: PermissionConfigDraftRow) => {
    setActivePreviewRowId(row.id);
    setPreviewMode('row');
    previewDialogRef.current?.showModal();
  }, []);

  const rowSelection = useMemo(
    () => ({
      selectedRowKeys: selectedRowIds,
      onChange: (keys: React.Key[]) => setSelectedRowIds(keys.map(String)),
    }),
    [selectedRowIds, setSelectedRowIds],
  );

  const tableLocale = useMemo(() => ({ emptyText: t('permissionConfig.noDrafts') }), [t]);

  const columns = useMemo<ColumnsType<PermissionConfigDraftRow>>(
    () => [
      {
        title: t('permissionConfig.index'),
        width: 64,
        render: (_value, _record, index) => index + 1,
      },
      {
        title: t('permissionConfig.servCode'),
        dataIndex: 'servCode',
        width: 150,
        render: (value, record) => (
          <Input value={value} onChange={(e) => updateGeneratedRow(record.id, { servCode: e.target.value, servFcode: e.target.value })} />
        ),
      },
      {
        title: t('permissionConfig.servName'),
        dataIndex: 'servName',
        width: 220,
        render: (value, record) => (
          <Input value={value} onChange={(e) => updateGeneratedRow(record.id, { servName: e.target.value, servFname: e.target.value })} />
        ),
      },
      {
        title: t('permissionConfig.requestType'),
        dataIndex: 'requestType',
        width: 120,
        render: (value, record) => (
          <Select
            value={value}
            onChange={(next) => updateGeneratedRow(record.id, { requestType: next })}
            style={{ width: '100%' }}
            options={REQUEST_METHOD_SELECT_OPTIONS}
          />
        ),
      },
      {
        title: t('permissionConfig.servUrl'),
        dataIndex: 'servUrl',
        width: 320,
        render: (value, record) => (
          <Input value={value} onChange={(e) => updateGeneratedRow(record.id, { servUrl: e.target.value })} />
        ),
      },
      {
        title: t('permissionConfig.remark'),
        dataIndex: 'remark',
        width: 180,
        render: (value, record) => (
          <Input value={value} onChange={(e) => updateGeneratedRow(record.id, { remark: e.target.value })} />
        ),
      },
      {
        title: t('permissionConfig.actions'),
        key: 'actions',
        width: 250,
        render: (_value, record) => (
          <div className="permission-row-actions">
            <button type="button" className="permission-row-action" onClick={() => handleOpenCurrentRowPreview(record)}>
              <EyeOutlined />
              {t('permissionConfig.previewSql')}
            </button>
            <button type="button" className="permission-row-action" onClick={() => handleCopyCurrentRowSql(record)}>
              <CopyOutlined />
              {t('permissionConfig.copy')}
            </button>
            <Popconfirm
              title={t('permissionConfig.deleteRowConfirm')}
              onConfirm={() => removeGeneratedRow(record.id)}
              okText={t('permissionConfig.confirm')}
              cancelText={t('permissionConfig.cancel')}
            >
              <button type="button" className="permission-row-action delete">
                <DeleteOutlined />
                {t('permissionConfig.delete')}
              </button>
            </Popconfirm>
          </div>
        ),
      },
    ],
    [handleCopyCurrentRowSql, handleOpenCurrentRowPreview, removeGeneratedRow, t, updateGeneratedRow],
  );

  const hasProject = Boolean(currentProject && parsedData);

  const overlayTitle = previewMode === 'row' ? t('permissionConfig.rowSqlPreview') : t('permissionConfig.previewSql');

  const overlayMeta = (() => {
    if (previewMode === 'row') {
      if (!activePreviewRow) {
        return t('permissionConfig.clickRowToPreview');
      }
      return `${activePreviewRow.servCode} · ${activePreviewRow.servName}`;
    }

    if (selectedRowIds.length > 0) {
      return t('permissionConfig.previewSelectedHint', { count: rowsForBulkAction.length });
    }

    return t('permissionConfig.previewAllHint', { count: rowsForBulkAction.length });
  })();

  const overlaySql = previewMode === 'row' ? activePreviewSql : sqlPreviewContent;

  const overlayEndpoint = useMemo(() => {
    if (previewMode !== 'row' || !activePreviewRow) {
      return null;
    }

    return { method: activePreviewRow.requestType, url: activePreviewRow.servUrl };
  }, [activePreviewRow, previewMode]);

  return (
    <div className="permission-viewer" ref={viewerContainerRef}>
      <div className="permission-projects-pane" style={projectsPaneStyle}>
        <div className="permission-projects-title">{t('permissionConfig.javaProjects')}</div>

        <div className="permission-projects-list">
          {isJavaProjectsLoading && projects.length === 0 && (
            <div className="permission-projects-placeholder">{t('javaImport.parsing')}</div>
          )}

          {!isJavaProjectsLoading && projects.length === 0 && (
            <div className="permission-projects-empty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('javaImport.emptyHint')} />
            </div>
          )}

          {projects.map((proj) => {
            const isActive = currentProject?.id === proj.id;
            const isSwitching = switchingProjectId === proj.id;
            let statusLabel = t('javaImport.savedStatus');
            let statusDotClass = 'permission-project-status-dot';
            let statusTextClass = 'permission-project-status-text';

            if (isActive) {
              statusLabel = t('javaImport.currentProject');
              statusDotClass = 'permission-project-status-dot active';
              statusTextClass = 'permission-project-status-text active';
            } else if (proj.isOpen) {
              statusLabel = t('javaImport.openedStatus');
              statusDotClass = 'permission-project-status-dot opened';
            }

            return (
              <button
                key={proj.id}
                type="button"
                className={`permission-project-card ${isActive ? 'active' : ''}`}
                onClick={() => handleSelectJavaProject(proj)}
                disabled={isSwitching}
              >
                <div className="permission-project-name">{proj.name}</div>
                <div className="permission-project-path" title={proj.path}>
                  {formatProjectPathLabel(proj.path)}
                </div>
                <div className="permission-project-meta">
                  <span className={statusDotClass} />
                  <span className={statusTextClass}>{statusLabel}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="permission-projects-footer">
          <button type="button" className="permission-projects-manage-btn" onClick={() => setActiveNavItem('javaImport')}>
            {t('permissionConfig.goToJavaImport')}
          </button>
        </div>
      </div>

      <button
        type="button"
        className={`split-pane-divider split-pane-divider-shell${isViewerDragging ? ' is-dragging' : ''}`}
        onMouseDown={handleViewerResizeMouseDown}
        onKeyDown={handleViewerResizeKeyDown}
        aria-label={t('permissionConfig.javaProjects')}
      />

      <div className="permission-generator-pane">
        <div className="permission-hintbar">
          <span className="permission-hintbar-icon">
            <FileAddOutlined />
          </span>
          <div className="permission-hintbar-text">{t('permissionConfig.pageHint')}</div>
        </div>

        <div className="permission-stats">
          <span className="permission-chip">{t('permissionConfig.selectedEndpointCount', { count: selectedEndpointIds.length })}</span>
          <span className="permission-chip">{t('permissionConfig.draftRowCount', { count: generatedRows.length })}</span>
          <span className="permission-chip">{bulkScopeText}</span>
        </div>

        <div className="permission-actions">
          <button type="button" className="permission-action-btn" onClick={handlePreviewSql} disabled={generatedRows.length === 0}>
            <EyeOutlined />
            {t('permissionConfig.previewSql')}
          </button>
          <button type="button" className="permission-action-btn" onClick={handleExportSql} disabled={rowsForBulkAction.length === 0}>
            <SaveOutlined />
            {t('permissionConfig.exportSql')}
          </button>
          <button type="button" className="permission-action-btn" onClick={handleCopySelected} disabled={selectedRowIds.length === 0}>
            <CopyOutlined />
            {t('permissionConfig.copySelected', { count: selectedRowIds.length })}
          </button>
          <button type="button" className="permission-action-btn" onClick={handleCopyAll} disabled={generatedRows.length === 0}>
            <CopyOutlined />
            {t('permissionConfig.copyAll', { count: generatedRows.length })}
          </button>
          <button type="button" className="permission-action-btn danger" onClick={removeSelectedRows} disabled={selectedRowIds.length === 0}>
            <DeleteOutlined />
            {t('permissionConfig.deleteSelected', { count: selectedRowIds.length })}
          </button>
        </div>

        {!hasProject && (
          <div className="permission-empty-state">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('permissionConfig.noJavaProject')} />
          </div>
        )}

        {hasProject && (
          <>
            <div className="permission-base-form">
              <div className="permission-form-row">
                <div className="permission-field">
                  <div className="permission-field-label">
                    {t('permissionConfig.initialServCode')}
                    <span className="permission-field-required">*</span>
                  </div>
                  <div className="permission-field-input">
                    <Input value={form.initialServCode} onChange={(e) => setFormField('initialServCode', e.target.value)} />
                  </div>
                </div>

                <div className="permission-field">
                  <div className="permission-field-label">
                    {t('permissionConfig.appId')}
                    <span className="permission-field-required">*</span>
                  </div>
                  <div className="permission-field-input">
                    <Input
                      value={form.appId}
                      onChange={(e) => {
                        setFormField('appId', e.target.value);
                        syncRowsForConfigChange('appId', e.target.value);
                      }}
                    />
                  </div>
                </div>

                <div className="permission-field">
                  <div className="permission-field-label">
                    {t('permissionConfig.createUser')}
                    <span className="permission-field-required">*</span>
                  </div>
                  <div className="permission-field-input">
                    <Input
                      value={form.createUser}
                      onChange={(e) => {
                        setFormField('createUser', e.target.value);
                        syncRowsForConfigChange('createUser', e.target.value);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="permission-form-row">
                <div className="permission-field">
                  <div className="permission-field-label">{t('permissionConfig.updateUser')}</div>
                  <div className="permission-field-input">
                    <Input
                      value={form.updateUser}
                      placeholder={t('permissionConfig.updateUserPlaceholder')}
                      onChange={(e) => {
                        setFormField('updateUser', e.target.value);
                        syncRowsForConfigChange('updateUser', e.target.value);
                      }}
                    />
                  </div>
                </div>

                <div className="permission-field">
                  <div className="permission-field-label">{t('permissionConfig.dbName')}</div>
                  <div className="permission-field-input">
                    <Input value={form.dbName} onChange={(e) => setFormField('dbName', e.target.value)} />
                  </div>
                </div>

                <div className="permission-field">
                  <div className="permission-field-label">{t('permissionConfig.tableName')}</div>
                  <div className="permission-field-input">
                    <Input value={form.tableName} onChange={(e) => setFormField('tableName', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="permission-main" ref={mainContainerRef}>
              <div className="permission-card permission-api-select" style={apiSelectPaneStyle}>
                <div className="permission-card-head">
                  <div className="permission-card-title">{t('permissionConfig.endpointSelection')}</div>
                  <div className="permission-card-subtitle">{t('permissionConfig.selectedEndpointCount', { count: selectedEndpointIds.length })}</div>
                </div>

                <label className="permission-search" aria-label={t('permissionConfig.searchEndpoints')}>
                  <span className="permission-search-icon">
                    <SearchIcon />
                  </span>
                  <input
                    className="permission-search-input"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder={t('permissionConfig.searchEndpoints')}
                  />
                </label>

                <div className="permission-api-actions">
                  <button
                    type="button"
                    className="permission-chip-action active"
                    onClick={() => setSelectedEndpointIds(visibleEndpointIds)}
                    disabled={visibleEndpointIds.length === 0}
                  >
                    {t('permissionConfig.selectAll')}
                  </button>
                  <button
                    type="button"
                    className="permission-chip-action"
                    onClick={() => setSelectedEndpointIds([])}
                    disabled={selectedEndpointIds.length === 0}
                  >
                    {t('permissionConfig.clearSelection')}
                  </button>
                  <button
                    type="button"
                    className="permission-chip-action primary"
                    onClick={handleGenerate}
                    disabled={selectedEndpointIds.length === 0}
                  >
                    <FileAddOutlined />
                    {t('permissionConfig.generateSql', { count: selectedEndpointIds.length })}
                  </button>
                </div>

                <div className="permission-tree">
                  {endpointGroups.length === 0 ? (
                    <div className="permission-tree-empty">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sidebar.noMatch')} />
                    </div>
                  ) : (
                    endpointGroups.map((group) => {
                      const controllerActive = group.allSelected || group.partiallySelected;
                      const controllerRowClassName = controllerActive ? 'permission-controller-row active' : 'permission-controller-row';
                      let controllerCheckboxClassName = 'permission-checkbox';
                      if (group.allSelected) {
                        controllerCheckboxClassName = 'permission-checkbox checked';
                      } else if (group.partiallySelected) {
                        controllerCheckboxClassName = 'permission-checkbox partial';
                      }
                      const controllerCheckboxMark = group.allSelected ? '✓' : '';

                      return (
                        <div key={group.controllerName} className="permission-controller-group">
                          <button
                            type="button"
                            className={controllerRowClassName}
                            onClick={() => toggleControllerSelection(group)}
                            aria-pressed={controllerActive}
                          >
                            <span className={controllerCheckboxClassName}>{controllerCheckboxMark}</span>
                            <span className="permission-controller-chevron">
                              <ChevronDownIcon />
                            </span>
                            <span className="permission-controller-name">{group.controllerName}</span>
                          </button>

                          <div className="permission-endpoint-list">
                            {group.endpoints.map((endpoint) => {
                              const checked = selectedEndpointSet.has(endpoint.id);
                              const endpointRowClassName = checked ? 'permission-endpoint-row active' : 'permission-endpoint-row';
                              const endpointCheckboxClassName = checked ? 'permission-checkbox checked' : 'permission-checkbox';
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
                                  <span className={getMethodClassName(endpoint.method)}>{endpoint.method}</span>
                                  <span className="permission-endpoint-path" title={endpoint.label}>
                                    {endpoint.path}
                                  </span>
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

              <button
                type="button"
                className={`split-pane-divider${isMainDragging ? ' is-dragging' : ''}`}
                onMouseDown={handleMainResizeMouseDown}
                onKeyDown={handleMainResizeKeyDown}
                aria-label={t('permissionConfig.endpointSelection')}
                hidden={isMainStacked}
              />

              <div className="permission-card permission-sql-drafts">
                <div className="permission-card-head">
                  <div className="permission-card-title">{t('permissionConfig.generatedSqlList')}</div>
                  <div className="permission-card-subtitle">{bulkScopeText}</div>
                </div>

                <div className="permission-table-wrap">
                  <Table<PermissionConfigDraftRow>
                    rowKey="id"
                    size="small"
                    scroll={{ x: 1400 }}
                    dataSource={generatedRows}
                    columns={columns}
                    pagination={false}
                    rowClassName={(record) => (record.id === activePreviewRow?.id && previewMode === 'row' ? 'permission-active-row' : '')}
                    rowSelection={rowSelection}
                    locale={tableLocale}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        <dialog
          ref={previewDialogRef}
          className="permission-overlay"
          onCancel={handleClosePreview}
        >
          <button
            type="button"
            className="permission-overlay-dismiss"
            onClick={handleClosePreview}
            aria-label={t('permissionConfig.close')}
          />
          <div className="permission-drawer">
            <div className="permission-drawer-head">
              <div className="permission-drawer-title">{overlayTitle}</div>
              <button type="button" className="permission-drawer-close" onClick={handleClosePreview} aria-label={t('permissionConfig.close')}>
                <CloseOutlined />
              </button>
            </div>

            <div className="permission-drawer-meta">
              <div className="permission-drawer-meta-line">{overlayMeta}</div>
              {overlayEndpoint && (
                <div className="permission-drawer-endpoint">
                  <span className={getMethodClassName(String(overlayEndpoint.method))}>{overlayEndpoint.method}</span>
                  <span className="permission-drawer-url">{overlayEndpoint.url}</span>
                </div>
              )}
            </div>

            {previewMode === 'row' ? (
              <button
                type="button"
                className="permission-drawer-copy"
                onClick={() => handleCopyCurrentRowSql(activePreviewRow)}
                disabled={!activePreviewRow}
              >
                <CopyOutlined />
                {t('permissionConfig.copyCurrentRow')}
              </button>
            ) : (
              <button
                type="button"
                className="permission-drawer-copy"
                onClick={handleCopyBulkPreviewSql}
                disabled={rowsForBulkAction.length === 0}
              >
                <CopyOutlined />
                {t('permissionConfig.copyAll', { count: rowsForBulkAction.length })}
              </button>
            )}

            <pre className="permission-drawer-code">{overlaySql || t('permissionConfig.noDrafts')}</pre>
          </div>
        </dialog>
      </div>
    </div>
  );
};

export default PermissionConfigViewer;
