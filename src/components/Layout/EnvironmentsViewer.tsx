import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Empty, Dropdown, Modal, message } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { SearchIcon } from '../Sidebar/TreeIcons';
import { useGlobalEnvironmentStore } from '../../stores/globalEnvironmentStore';
import { useProjectStore } from '../../stores/projectStore';
import { useHorizontalPaneResize } from '../../hooks/useHorizontalPaneResize';
import { buildDuplicateEnvironmentName, createEnvironmentId, formatProjectPathLabel, type Environment } from '../../types';
import './EnvironmentsViewer.css';
import './SplitPaneDivider.css';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

type EnvScope = 'global' | 'project';

type EnvRow = {
  id: string;
  name: string;
  scope: EnvScope;
  isActive: boolean;
  selectionKey: string;
  projectPath?: string;
};

type VarRow = { id: string; key: string; value: string };

type SelectedEnvRef = { scope: EnvScope; id: string; projectPath?: string };

type NameModalState = {
  ref: SelectedEnvRef;
  value: string;
};

type ProjectGroup = {
  projectPath: string;
  projectName: string;
  projectLabel: string;
  rows: EnvRow[];
};

function getSelectionKey(scope: EnvScope, id: string, projectPath?: string): string {
  return scope === 'global' ? `custom:${id}` : `project:${projectPath ?? ''}:${id}`;
}

function isSameSelection(left: SelectedEnvRef | null, right: SelectedEnvRef | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.scope === right.scope && left.id === right.id && left.projectPath === right.projectPath;
}

function buildVarRows(environment: Environment | null): VarRow[] {
  if (!environment) return [];

  return Object.entries(environment.variables || {}).map(([key, value], index) => ({
    id: `${index}`,
    key,
    value,
  }));
}

function sameVarRows(left: VarRow[], right: VarRow[]): boolean {
  if (left.length !== right.length) return false;

  return left.every((row, index) => {
    const nextRow = right[index];
    return row.id === nextRow?.id && row.key === nextRow.key && row.value === nextRow.value;
  });
}

function buildVariables(rows: VarRow[]): Record<string, string> {
  const variables: Record<string, string> = {};

  rows.forEach((row) => {
    const key = row.key.trim();
    if (!key) {
      return;
    }
    variables[key] = row.value;
  });

  return variables;
}

function sameVariables(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

function buildGlobalFallback(activeId: string | null, environments: Environment[]): SelectedEnvRef | null {
  const activeEnvironment = activeId ? environments.find((environment) => environment.id === activeId) : null;
  const nextEnvironment = activeEnvironment ?? environments[0];
  return nextEnvironment ? { scope: 'global', id: nextEnvironment.id } : null;
}

function buildProjectFallback(
  collections: ReturnType<typeof useProjectStore.getState>['collections'],
  preferredProjectPath?: string | null,
): SelectedEnvRef | null {
  const projectPaths = preferredProjectPath
    ? [preferredProjectPath, ...Object.keys(collections).filter((path) => path !== preferredProjectPath)]
    : Object.keys(collections);

  for (const projectPath of projectPaths) {
    const entry = collections[projectPath];
    if (!entry) {
      continue;
    }

    const activeEnvironment = entry.activeEnvironment
      ? entry.environments.find((environment) => environment.id === entry.activeEnvironment)
      : null;
    const nextEnvironment = activeEnvironment ?? entry.environments[0];
    if (nextEnvironment) {
      return { scope: 'project', id: nextEnvironment.id, projectPath };
    }
  }

  return null;
}

function buildDetailChipText(t: TranslateFn, selectedEnv: Environment | null, selectedRef: SelectedEnvRef | null): string {
  if (selectedEnv === null) {
    return t('environment.notSelected');
  }

  return selectedRef?.scope === 'global' ? t('environment.customGroup') : t('environment.projectGroup');
}

function buildDetailMetaText(
  t: TranslateFn,
  selectedRef: SelectedEnvRef | null,
  selectedProjectEntry: ReturnType<typeof useProjectStore.getState>['collections'][string] | undefined,
): string {
  if (selectedRef?.scope !== 'project') {
    return t('environment.customGroup');
  }

  const projectLabel = selectedProjectEntry?.project.name || formatProjectPathLabel(selectedRef.projectPath || '');
  return `${t('environment.collectionLabel')}: ${projectLabel}`;
}

function SelectionCheckbox({
  checked,
  label,
  onChange,
}: Readonly<{ checked: boolean; label: string; onChange: () => void }>) {
  return (
    <label className="env-row-checkbox">
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} />
    </label>
  );
}

function EnvironmentRow({
  row,
  isChecked,
  isSelected,
  onSelect,
  onToggleSelection,
  onRename,
  onDuplicate,
  onDelete,
  t,
}: Readonly<{
  row: EnvRow;
  isChecked: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleSelection: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  t: TranslateFn;
}>) {
  const actionMenu: MenuProps = {
    items: [
      { key: 'rename', label: t('environment.rename') },
      { key: 'duplicate', label: t('environment.duplicate') },
      { key: 'delete', label: t('environment.delete'), danger: true },
    ],
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation();

      switch (key) {
        case 'rename':
          onRename();
          break;
        case 'duplicate':
          onDuplicate();
          break;
        case 'delete':
          onDelete();
          break;
        default:
          break;
      }
    },
  };

  return (
    <div className={`env-row ${isSelected ? 'selected' : ''}`}>
      <SelectionCheckbox checked={isChecked} label={row.name} onChange={onToggleSelection} />
      <button type="button" className="env-row-main" onClick={onSelect}>
        <div className="env-row-content">
          <div className="env-row-name">{row.name}</div>
        </div>
        {row.isActive && <span className="env-row-badge">{t('environment.defaultEnvironment')}</span>}
      </button>
      <Dropdown menu={actionMenu} trigger={['click']}>
        <button
          type="button"
          className="env-row-actions-trigger"
          aria-label={t('environment.rowActions')}
          title={t('environment.rowActions')}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <MoreOutlined />
        </button>
      </Dropdown>
    </div>
  );
}

const EnvironmentsViewer: React.FC = () => {
  const { t } = useTranslation();

  const globalEnvironments = useGlobalEnvironmentStore((state) => state.environments);
  const activeGlobalEnvironmentId = useGlobalEnvironmentStore((state) => state.activeEnvironmentId);
  const isGlobalLoaded = useGlobalEnvironmentStore((state) => state.isLoaded);
  const loadGlobalEnvironments = useGlobalEnvironmentStore((state) => state.loadEnvironments);
  const saveGlobalEnvironment = useGlobalEnvironmentStore((state) => state.saveEnvironment);
  const deleteGlobalEnvironment = useGlobalEnvironmentStore((state) => state.deleteEnvironment);
  const setActiveGlobalEnvironment = useGlobalEnvironmentStore((state) => state.setActiveEnvironment);

  const collections = useProjectStore((state) => state.collections);
  const activeProjectPath = useProjectStore((state) => state.activeProjectPath);
  const loadProjectEnvironments = useProjectStore((state) => state.loadEnvironments);
  const saveProjectEnvironment = useProjectStore((state) => state.saveEnvironment);
  const deleteProjectEnvironment = useProjectStore((state) => state.deleteEnvironment);
  const setActiveProjectEnvironment = useProjectStore((state) => state.setActiveEnvironment);

  const [search, setSearch] = useState('');
  const [selectedRef, setSelectedRef] = useState<SelectedEnvRef | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [localVars, setLocalVars] = useState<Array<VarRow>>([]);
  const [isCreatePanelVisible, setIsCreatePanelVisible] = useState(false);
  const [createScope, setCreateScope] = useState<EnvScope>('global');
  const [createName, setCreateName] = useState('');
  const [createProjectPath, setCreateProjectPath] = useState<string | null>(null);
  const [nameModalState, setNameModalState] = useState<NameModalState | null>(null);
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<(() => Promise<void> | void) | null>(null);
  const [isUnsavedGuardVisible, setIsUnsavedGuardVisible] = useState(false);
  const {
    containerRef,
    paneStyle,
    handleResizeKeyDown,
    handleResizeMouseDown,
  } = useHorizontalPaneResize({ initialWidth: 360, minWidth: 280, maxWidth: 520, minSecondaryWidth: 520 });

  const projectPaths = useMemo(() => Object.keys(collections), [collections]);
  const previousProjectPathsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isGlobalLoaded) {
      void loadGlobalEnvironments();
    }
  }, [isGlobalLoaded, loadGlobalEnvironments]);

  useEffect(() => {
    const previousProjectPaths = new Set(previousProjectPathsRef.current);
    const nextProjectPaths = projectPaths.filter((path) => !previousProjectPaths.has(path));
    previousProjectPathsRef.current = projectPaths;

    if (nextProjectPaths.length === 0) {
      return;
    }

    void Promise.all(nextProjectPaths.map((path) => loadProjectEnvironments(path)));
  }, [loadProjectEnvironments, projectPaths]);

  useEffect(() => {
    if (createScope !== 'project') {
      return;
    }

    if (createProjectPath && collections[createProjectPath]) {
      return;
    }

    setCreateProjectPath(activeProjectPath ?? projectPaths[0] ?? null);
  }, [activeProjectPath, collections, createProjectPath, createScope, projectPaths]);

  const searchQuery = search.trim().toLowerCase();

  const globalRows = useMemo<EnvRow[]>(() => {
    return globalEnvironments
      .filter((environment) => (searchQuery ? environment.name.toLowerCase().includes(searchQuery) : true))
      .map((environment) => ({
        id: environment.id,
        name: environment.name,
        scope: 'global',
        isActive: environment.id === activeGlobalEnvironmentId,
        selectionKey: getSelectionKey('global', environment.id),
      }));
  }, [activeGlobalEnvironmentId, globalEnvironments, searchQuery]);

  const projectGroups = useMemo<ProjectGroup[]>(() => {
    return projectPaths
      .map((projectPath) => {
        const entry = collections[projectPath];
        const projectName = entry?.project.name || formatProjectPathLabel(projectPath);
        const projectLabel = formatProjectPathLabel(projectPath);
        const collectionSearchText = `${projectName} ${projectLabel}`.toLowerCase();
        const matchesCollection = searchQuery ? collectionSearchText.includes(searchQuery) : false;
        const rows = (entry?.environments ?? [])
          .filter((environment) => !searchQuery || matchesCollection || environment.name.toLowerCase().includes(searchQuery))
          .map((environment) => ({
            id: environment.id,
            name: environment.name,
            scope: 'project' as const,
            isActive: environment.id === entry?.activeEnvironment,
            selectionKey: getSelectionKey('project', environment.id, projectPath),
            projectPath,
          }));

        return {
          projectPath,
          projectName,
          projectLabel,
          rows,
        };
      })
      .filter((group) => group.rows.length > 0 || !searchQuery);
  }, [collections, projectPaths, searchQuery]);

  const allRefsByKey = useMemo(() => {
    const refs = new Map<string, SelectedEnvRef>();

    globalEnvironments.forEach((environment) => {
      refs.set(getSelectionKey('global', environment.id), { scope: 'global', id: environment.id });
    });

    projectPaths.forEach((projectPath) => {
      const entry = collections[projectPath];
      entry?.environments.forEach((environment) => {
        refs.set(getSelectionKey('project', environment.id, projectPath), {
          scope: 'project',
          id: environment.id,
          projectPath,
        });
      });
    });

    return refs;
  }, [collections, globalEnvironments, projectPaths]);

  const selectedEnv = useMemo<Environment | null>(() => {
    if (!selectedRef) {
      return null;
    }

    if (selectedRef.scope === 'global') {
      return globalEnvironments.find((environment) => environment.id === selectedRef.id) ?? null;
    }

    if (!selectedRef.projectPath) {
      return null;
    }

    return collections[selectedRef.projectPath]?.environments.find((environment) => environment.id === selectedRef.id) ?? null;
  }, [collections, globalEnvironments, selectedRef]);

  const selectedProjectEntry = selectedRef?.scope === 'project' && selectedRef.projectPath
    ? collections[selectedRef.projectPath]
    : undefined;
  const draftVariables = useMemo(() => buildVariables(localVars), [localVars]);
  const hasUnsavedChanges = selectedEnv ? !sameVariables(draftVariables, selectedEnv.variables) : false;

  useEffect(() => {
    if (selectedRef && selectedEnv) {
      return;
    }

    const preferredProjectPath = selectedRef?.projectPath ?? activeProjectPath ?? projectPaths[0] ?? null;
    const nextSelection = selectedRef?.scope === 'project'
      ? buildProjectFallback(collections, preferredProjectPath) ?? buildGlobalFallback(activeGlobalEnvironmentId, globalEnvironments)
      : buildGlobalFallback(activeGlobalEnvironmentId, globalEnvironments) ?? buildProjectFallback(collections, preferredProjectPath);

    if (!isSameSelection(selectedRef, nextSelection)) {
      setSelectedRef(nextSelection);
    }
  }, [activeGlobalEnvironmentId, activeProjectPath, collections, globalEnvironments, projectPaths, selectedEnv, selectedRef]);

  useEffect(() => {
    const nextLocalVars = buildVarRows(selectedEnv);
    setLocalVars((current) => (sameVarRows(current, nextLocalVars) ? current : nextLocalVars));
  }, [selectedEnv]);

  useEffect(() => {
    setSelectedKeys((current) => {
      const next = new Set(Array.from(current).filter((key) => allRefsByKey.has(key)));
      if (next.size === current.size) {
        return current;
      }
      return next;
    });
  }, [allRefsByKey]);

  const visibleSelectionKeys = useMemo(
    () => [
      ...globalRows.map((row) => row.selectionKey),
      ...projectGroups.flatMap((group) => group.rows.map((row) => row.selectionKey)),
    ],
    [globalRows, projectGroups],
  );

  const selectedBatchRefs = useMemo(
    () => Array.from(selectedKeys).map((key) => allRefsByKey.get(key)).filter((value): value is SelectedEnvRef => Boolean(value)),
    [allRefsByKey, selectedKeys],
  );

  const allVisibleSelected = visibleSelectionKeys.length > 0 && visibleSelectionKeys.every((key) => selectedKeys.has(key));

  const handleToggleRowSelection = (selectionKey: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(selectionKey)) {
        next.delete(selectionKey);
      } else {
        next.add(selectionKey);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleSelectionKeys.forEach((key) => next.delete(key));
      } else {
        visibleSelectionKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  };

  const getEnvironmentByRef = (ref: SelectedEnvRef): Environment | null => {
    if (ref.scope === 'global') {
      return globalEnvironments.find((environment) => environment.id === ref.id) ?? null;
    }

    if (!ref.projectPath) {
      return null;
    }

    return collections[ref.projectPath]?.environments.find((environment) => environment.id === ref.id) ?? null;
  };

  const getEnvironmentListByRef = (ref: SelectedEnvRef): Environment[] => {
    if (ref.scope === 'global') {
      return globalEnvironments;
    }

    if (!ref.projectPath) {
      return [];
    }

    return collections[ref.projectPath]?.environments ?? [];
  };

  const closeUnsavedGuard = () => {
    setIsUnsavedGuardVisible(false);
    setPendingUnsavedAction(null);
  };

  const runWithUnsavedGuard = (action: () => Promise<void> | void) => {
    if (!hasUnsavedChanges) {
      void action();
      return;
    }

    setPendingUnsavedAction(() => action);
    setIsUnsavedGuardVisible(true);
  };

  const executeSelect = async (ref: SelectedEnvRef) => {
    setSelectedRef(ref);

    if (ref.scope === 'global') {
      if (ref.id !== activeGlobalEnvironmentId) {
        await setActiveGlobalEnvironment(ref.id);
      }
      return;
    }

    if (!ref.projectPath) {
      return;
    }

    const currentActiveEnvironmentId = collections[ref.projectPath]?.activeEnvironment ?? null;
    if (ref.id !== currentActiveEnvironmentId) {
      await setActiveProjectEnvironment(ref.projectPath, ref.id);
    }
  };

  const handleSelect = (ref: SelectedEnvRef) => {
    if (isSameSelection(selectedRef, ref)) {
      void executeSelect(ref);
      return;
    }

    runWithUnsavedGuard(() => executeSelect(ref));
  };

  const resetCreateForm = () => {
    setCreateName('');
    setCreateProjectPath(activeProjectPath ?? projectPaths[0] ?? null);
    setCreateScope('global');
    setIsCreatePanelVisible(false);
  };

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) {
      message.warning(t('environment.enterName'));
      return;
    }

    if (createScope === 'project' && !createProjectPath) {
      message.warning(t('environment.selectCollectionFirst'));
      return;
    }

    const env: Environment = {
      id: createEnvironmentId(name),
      name,
      variables: {},
    };

    try {
      if (createScope === 'global') {
        await saveGlobalEnvironment(env);
        await setActiveGlobalEnvironment(env.id);
        setSelectedRef({ scope: 'global', id: env.id });
      } else if (createProjectPath) {
        await saveProjectEnvironment(createProjectPath, env);
        await setActiveProjectEnvironment(createProjectPath, env.id);
        setSelectedRef({ scope: 'project', id: env.id, projectPath: createProjectPath });
      }

      setSelectedKeys(new Set());
      resetCreateForm();
      message.success(t('environment.saved'));
    } catch {
      message.error(t('environment.failedSave'));
    }
  };

  const handleAddVariable = () => {
    setLocalVars((prev) => [...prev, { id: String(Date.now()), key: '', value: '' }]);
  };

  const handleVarChange = (id: string, field: 'key' | 'value', value: string) => {
    setLocalVars((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const handleVarRemove = (id: string) => {
    setLocalVars((prev) => prev.filter((row) => row.id !== id));
  };

  const handleSaveSelected = async (): Promise<boolean> => {
    if (!selectedRef || !selectedEnv) {
      return true;
    }

    if (!hasUnsavedChanges) {
      return true;
    }

    try {
      if (selectedRef.scope === 'global') {
        await saveGlobalEnvironment({ ...selectedEnv, variables: draftVariables });
      } else if (selectedRef.projectPath) {
        await saveProjectEnvironment(selectedRef.projectPath, { ...selectedEnv, variables: draftVariables });
      }
      message.success(t('environment.saved'));
      return true;
    } catch {
      message.error(t('environment.failedSave'));
      return false;
    }
  };

  const handleUnsavedGuardContinue = async (shouldSave: boolean) => {
    const action = pendingUnsavedAction;
    if (!action) {
      closeUnsavedGuard();
      return;
    }

    if (shouldSave) {
      const saved = await handleSaveSelected();
      if (!saved) {
        return;
      }
    } else if (selectedEnv) {
      setLocalVars(buildVarRows(selectedEnv));
    }

    closeUnsavedGuard();
    await action();
  };

  const deleteEnvironmentRefs = async (refs: SelectedEnvRef[]) => {
    for (const ref of refs) {
      if (ref.scope === 'global') {
        await deleteGlobalEnvironment(ref.id);
        continue;
      }

      if (ref.projectPath) {
        await deleteProjectEnvironment(ref.projectPath, ref.id);
      }
    }

    const deletedKeys = new Set(refs.map((ref) => getSelectionKey(ref.scope, ref.id, ref.projectPath)));
    setSelectedKeys((current) => new Set(Array.from(current).filter((key) => !deletedKeys.has(key))));

    if (selectedRef && deletedKeys.has(getSelectionKey(selectedRef.scope, selectedRef.id, selectedRef.projectPath))) {
      setSelectedRef(null);
    }
  };

  const confirmDelete = (refs: SelectedEnvRef[]) => {
    const count = refs.length;
    const targetEnv = count === 1 ? getEnvironmentByRef(refs[0]) : null;

    Modal.confirm({
      title: t('environment.deleteConfirm'),
      content: count === 1
        ? t('environment.deleteMessage', { name: targetEnv?.name ?? '-' })
        : t('environment.batchDeleteMessage', { count }),
      okText: t('environment.delete'),
      cancelText: t('environment.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteEnvironmentRefs(refs);
          message.success(count === 1 ? t('environment.deleted') : t('environment.batchDeleted', { count }));
        } catch {
          message.error(t('environment.failedDelete'));
        }
      },
    });
  };

  const handleDeleteSelected = () => {
    if (!selectedRef || !selectedEnv) {
      return;
    }

    runWithUnsavedGuard(() => {
      confirmDelete([selectedRef]);
    });
  };

  const handleBatchDelete = () => {
    if (selectedBatchRefs.length === 0) {
      return;
    }

    runWithUnsavedGuard(() => {
      confirmDelete(selectedBatchRefs);
    });
  };

  const openRenameModal = (ref: SelectedEnvRef) => {
    const environment = getEnvironmentByRef(ref);
    if (!environment) {
      return;
    }

    setNameModalState({
      ref,
      value: environment.name,
    });
  };

  const handleRenameRef = (ref: SelectedEnvRef) => {
    runWithUnsavedGuard(() => {
      openRenameModal(ref);
    });
  };

  const handleRenameConfirm = async () => {
    if (!nameModalState) {
      return;
    }

    const name = nameModalState.value.trim();
    if (!name) {
      message.warning(t('environment.enterName'));
      return;
    }

    const environment = getEnvironmentByRef(nameModalState.ref);
    if (!environment) {
      setNameModalState(null);
      return;
    }

    if (name === environment.name) {
      setNameModalState(null);
      return;
    }

    try {
      if (nameModalState.ref.scope === 'global') {
        await saveGlobalEnvironment({ ...environment, name });
      } else if (nameModalState.ref.projectPath) {
        await saveProjectEnvironment(nameModalState.ref.projectPath, { ...environment, name });
      }

      setNameModalState(null);
      message.success(t('environment.saved'));
    } catch {
      message.error(t('environment.failedSave'));
    }
  };

  const handleDuplicateRef = (ref: SelectedEnvRef) => {
    runWithUnsavedGuard(async () => {
      const environment = getEnvironmentByRef(ref);
      if (!environment) {
        return;
      }

      const name = buildDuplicateEnvironmentName(
        environment.name,
        getEnvironmentListByRef(ref),
        t('environment.duplicateCopySuffix'),
      );
      const duplicateEnvironment: Environment = {
        id: createEnvironmentId(name),
        name,
        variables: { ...environment.variables },
      };

      try {
        if (ref.scope === 'global') {
          await saveGlobalEnvironment(duplicateEnvironment);
          await setActiveGlobalEnvironment(duplicateEnvironment.id);
          setSelectedRef({ scope: 'global', id: duplicateEnvironment.id });
        } else if (ref.projectPath) {
          await saveProjectEnvironment(ref.projectPath, duplicateEnvironment);
          await setActiveProjectEnvironment(ref.projectPath, duplicateEnvironment.id);
          setSelectedRef({ scope: 'project', id: duplicateEnvironment.id, projectPath: ref.projectPath });
        }

        setSelectedKeys(new Set());
        message.success(t('environment.saved'));
      } catch {
        message.error(t('environment.failedSave'));
      }
    });
  };

  const handleDeleteRef = (ref: SelectedEnvRef) => {
    runWithUnsavedGuard(() => {
      confirmDelete([ref]);
    });
  };

  const detailChipText = buildDetailChipText(t, selectedEnv, selectedRef);
  const detailMetaText = buildDetailMetaText(t, selectedRef, selectedProjectEntry);

  return (
    <div className="env-viewer" ref={containerRef}>
      <div className="env-list-pane" style={paneStyle}>
        <div className="env-title-row">
          <div className="env-title">{t('navRail.environments')}</div>
          <div className="env-title-chip">
            {selectedKeys.size > 0 ? t('environment.selectedCount', { count: selectedKeys.size }) : t('environment.customGroup')}
          </div>
        </div>

        <label className="env-search" aria-label={t('environment.searchPlaceholder')}>
          <span className="env-search-icon">
            <SearchIcon />
          </span>
          <input
            className="env-search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('environment.searchPlaceholder')}
          />
        </label>

        <div className="env-actions env-actions-wrap">
          <button
            type="button"
            className="env-chip active"
            onClick={() => {
              setIsCreatePanelVisible((value) => !value);
              setCreateProjectPath(activeProjectPath ?? projectPaths[0] ?? null);
            }}
          >
            {t('environment.new')}
          </button>
          <button
            type="button"
            className="env-chip"
            disabled={visibleSelectionKeys.length === 0}
            onClick={handleToggleSelectAll}
          >
            {allVisibleSelected ? t('environment.clearSelection') : t('environment.selectAll')}
          </button>
          <button
            type="button"
            className="env-chip"
            disabled={selectedBatchRefs.length === 0}
            onClick={handleBatchDelete}
          >
            {t('environment.deleteSelected', { count: selectedBatchRefs.length })}
          </button>
        </div>

        {isCreatePanelVisible && (
          <div className="env-create-panel">
            <div className="env-field">
              <div className="env-field-label">{t('environment.nameLabel')}</div>
              <input
                className="env-field-input"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={t('environment.envNamePlaceholder')}
              />
            </div>

            <div className="env-field">
              <div className="env-field-label">{t('environment.typeLabel')}</div>
              <div className="env-scope-switch">
                <button
                  type="button"
                  className={`env-chip ${createScope === 'global' ? 'active' : ''}`}
                  onClick={() => setCreateScope('global')}
                >
                  {t('environment.customGroup')}
                </button>
                <button
                  type="button"
                  className={`env-chip ${createScope === 'project' ? 'active' : ''}`}
                  onClick={() => setCreateScope('project')}
                >
                  {t('environment.projectGroup')}
                </button>
              </div>
            </div>

            {createScope === 'project' && (
              <div className="env-field">
                <div className="env-field-label">{t('environment.collectionLabel')}</div>
                {projectPaths.length > 0 ? (
                  <select
                    className="env-field-select"
                    value={createProjectPath ?? ''}
                    onChange={(event) => setCreateProjectPath(event.target.value || null)}
                  >
                    {projectPaths.map((projectPath) => {
                      const entry = collections[projectPath];
                      const projectName = entry?.project.name || formatProjectPathLabel(projectPath);
                      return (
                        <option key={projectPath} value={projectPath}>
                          {projectName} · {formatProjectPathLabel(projectPath)}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div className="env-empty-hint">{t('environment.noCollectionAvailable')}</div>
                )}
              </div>
            )}

            <div className="env-actions">
              <button type="button" className="env-chip active" onClick={handleCreate}>
                {t('environment.save')}
              </button>
              <button type="button" className="env-chip" onClick={resetCreateForm}>
                {t('environment.cancel')}
              </button>
            </div>
          </div>
        )}

        <div className="env-list-rows">
          <div className="env-list-group">{t('environment.customGroup')}</div>
          {globalRows.length === 0 ? (
            <button type="button" className="env-row disabled" disabled>
              <div className="env-row-name">-</div>
            </button>
          ) : (
            globalRows.map((row) => {
              const rowRef: SelectedEnvRef = { scope: 'global', id: row.id };
              return (
                <EnvironmentRow
                  key={`g:${row.id}`}
                  row={row}
                  isChecked={selectedKeys.has(row.selectionKey)}
                  isSelected={isSameSelection(selectedRef, rowRef)}
                  onSelect={() => handleSelect(rowRef)}
                  onToggleSelection={() => handleToggleRowSelection(row.selectionKey)}
                  onRename={() => handleRenameRef(rowRef)}
                  onDuplicate={() => handleDuplicateRef(rowRef)}
                  onDelete={() => handleDeleteRef(rowRef)}
                  t={t}
                />
              );
            })
          )}

          <div className="env-list-group">{t('environment.projectGroup')}</div>
          {projectGroups.length === 0 ? (
            <button type="button" className="env-row disabled" disabled>
              <div className="env-row-name">{t('environment.noCollectionAvailable')}</div>
            </button>
          ) : (
            projectGroups.map((group) => (
              <div key={group.projectPath} className="env-project-group">
                <div className="env-project-group-head">
                  <div className="env-project-group-title">{group.projectName}</div>
                  <div className="env-project-group-path">{group.projectLabel}</div>
                </div>

                {group.rows.length === 0 ? (
                  <button type="button" className="env-row disabled" disabled>
                    <div className="env-row-name">-</div>
                  </button>
                ) : (
                  group.rows.map((row) => {
                    const rowRef: SelectedEnvRef = { scope: 'project', id: row.id, projectPath: row.projectPath };
                    return (
                      <EnvironmentRow
                        key={`p:${group.projectPath}:${row.id}`}
                        row={row}
                        isChecked={selectedKeys.has(row.selectionKey)}
                        isSelected={isSameSelection(selectedRef, rowRef)}
                        onSelect={() => handleSelect(rowRef)}
                        onToggleSelection={() => handleToggleRowSelection(row.selectionKey)}
                        onRename={() => handleRenameRef(rowRef)}
                        onDuplicate={() => handleDuplicateRef(rowRef)}
                        onDelete={() => handleDeleteRef(rowRef)}
                        t={t}
                      />
                    );
                  })
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <button
        type="button"
        className="split-pane-divider"
        onMouseDown={handleResizeMouseDown}
        onKeyDown={handleResizeKeyDown}
        aria-label={t('navRail.environments')}
      />

      <div className="env-detail-pane">
        <div className="env-detail-head">
          <div className="env-detail-title-wrap">
            <div>
              <div className="env-detail-title">{selectedEnv?.name || '-'}</div>
              {selectedEnv && <div className="env-detail-subtitle">{detailMetaText}</div>}
            </div>
            <div className="env-detail-chip">{detailChipText}</div>
          </div>

          {selectedEnv && (
            <div className="env-detail-actions">
              <button type="button" className="env-chip env-detail-action save" onClick={() => void handleSaveSelected()}>
                {t('environment.save')}
              </button>
              <button type="button" className="env-chip env-detail-action delete" onClick={handleDeleteSelected}>
                {t('environment.delete')}
              </button>
            </div>
          )}
        </div>

        {selectedEnv ? (
          <>
            <div className="env-var-table">
              <div className="env-var-head">
                <div className="env-var-cell muted">{t('environment.variable')}</div>
                <div className="env-var-cell muted">{t('environment.value')}</div>
              </div>

              {localVars.length === 0 ? (
                <div className="env-var-row">
                  <div className="env-var-cell">-</div>
                  <div className="env-var-cell">-</div>
                </div>
              ) : (
                localVars.map((row) => (
                  <div key={row.id} className="env-var-row">
                    <input
                      className="env-var-input"
                      value={row.key}
                      onChange={(event) => handleVarChange(row.id, 'key', event.target.value)}
                      placeholder={t('environment.varNamePlaceholder')}
                    />
                    <div className="env-var-right">
                      <input
                        className="env-var-input"
                        value={row.value}
                        onChange={(event) => handleVarChange(row.id, 'value', event.target.value)}
                        placeholder={t('environment.valuePlaceholder')}
                      />
                      <button
                        type="button"
                        className="env-var-remove"
                        onClick={() => handleVarRemove(row.id)}
                        aria-label={t('environment.delete')}
                        title={t('environment.delete')}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button type="button" className="env-add" onClick={handleAddVariable}>
              <PlusOutlined style={{ fontSize: 13 }} />
              <span className="env-add-text">{t('environment.addVariable')}</span>
            </button>
          </>
        ) : (
          <div className="env-detail-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('environment.selectFromLeft')} />
          </div>
        )}
      </div>

      <Modal
        title={t('environment.renameTitle')}
        open={Boolean(nameModalState)}
        onOk={() => void handleRenameConfirm()}
        onCancel={() => setNameModalState(null)}
        okText={t('environment.save')}
        cancelText={t('environment.cancel')}
      >
        <input
          className="env-field-input"
          value={nameModalState?.value ?? ''}
          onChange={(event) => setNameModalState((current) => (current ? { ...current, value: event.target.value } : current))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleRenameConfirm();
            }
          }}
          placeholder={t('environment.envNamePlaceholder')}
          autoFocus
        />
      </Modal>

      <Modal
        title={t('environment.unsavedChangesTitle')}
        open={isUnsavedGuardVisible}
        onCancel={closeUnsavedGuard}
        footer={[
          <button type="button" className="env-chip" onClick={closeUnsavedGuard} key="cancel">
            {t('environment.cancel')}
          </button>,
          <button type="button" className="env-chip" onClick={() => void handleUnsavedGuardContinue(false)} key="discard">
            {t('environment.discard')}
          </button>,
          <button type="button" className="env-chip active" onClick={() => void handleUnsavedGuardContinue(true)} key="save">
            {t('environment.save')}
          </button>,
        ]}
      >
        <div className="env-modal-copy">{t('environment.unsavedChangesMessage', { name: selectedEnv?.name ?? '-' })}</div>
      </Modal>
    </div>
  );
};

export default EnvironmentsViewer;
