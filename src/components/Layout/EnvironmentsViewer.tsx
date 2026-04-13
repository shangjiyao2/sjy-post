import React, { useEffect, useMemo, useState } from 'react';
import { Empty, Dropdown, Modal, message } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { SearchIcon } from '../Sidebar/TreeIcons';
import { useGlobalEnvironmentStore } from '../../stores/globalEnvironmentStore';
import { useHorizontalPaneResize } from '../../hooks/useHorizontalPaneResize';
import { buildDuplicateEnvironmentName, createEnvironmentId, type Environment } from '../../types';
import './EnvironmentsViewer.css';
import './SplitPaneDivider.css';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

type VarRow = { id: string; key: string; value: string };

type NameModalState = {
  id: string;
  value: string;
};

function buildVarRows(environment: Environment | null): VarRow[] {
  if (!environment) {
    return [];
  }

  return Object.entries(environment.variables || {}).map(([key, value], index) => ({
    id: `${index}`,
    key,
    value,
  }));
}

function sameVarRows(left: VarRow[], right: VarRow[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

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

function buildGlobalFallback(activeId: string | null, environments: Environment[]): string | null {
  const activeEnvironment = activeId ? environments.find((environment) => environment.id === activeId) : null;
  return activeEnvironment?.id ?? environments[0]?.id ?? null;
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
  environment,
  isChecked,
  isSelected,
  isActive,
  onSelect,
  onToggleSelection,
  onRename,
  onDuplicate,
  onDelete,
  t,
}: Readonly<{
  environment: Environment;
  isChecked: boolean;
  isSelected: boolean;
  isActive: boolean;
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
      <SelectionCheckbox checked={isChecked} label={environment.name} onChange={onToggleSelection} />
      <button type="button" className="env-row-main" onClick={onSelect}>
        <div className="env-row-content">
          <div className="env-row-name">{environment.name}</div>
        </div>
        {isActive && <span className="env-row-badge">{t('environment.defaultEnvironment')}</span>}
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

  const environments = useGlobalEnvironmentStore((state) => state.environments);
  const activeEnvironmentId = useGlobalEnvironmentStore((state) => state.activeEnvironmentId);
  const isLoaded = useGlobalEnvironmentStore((state) => state.isLoaded);
  const loadEnvironments = useGlobalEnvironmentStore((state) => state.loadEnvironments);
  const saveEnvironment = useGlobalEnvironmentStore((state) => state.saveEnvironment);
  const deleteEnvironment = useGlobalEnvironmentStore((state) => state.deleteEnvironment);
  const setActiveEnvironment = useGlobalEnvironmentStore((state) => state.setActiveEnvironment);

  const [search, setSearch] = useState('');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [localVars, setLocalVars] = useState<Array<VarRow>>([]);
  const [isCreatePanelVisible, setIsCreatePanelVisible] = useState(false);
  const [createName, setCreateName] = useState('');
  const [nameModalState, setNameModalState] = useState<NameModalState | null>(null);
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<(() => Promise<void> | void) | null>(null);
  const [isUnsavedGuardVisible, setIsUnsavedGuardVisible] = useState(false);
  const {
    containerRef,
    paneStyle,
    handleResizeKeyDown,
    handleResizeMouseDown,
  } = useHorizontalPaneResize({ initialWidth: 360, minWidth: 280, maxWidth: 520, minSecondaryWidth: 520 });

  useEffect(() => {
    if (!isLoaded) {
      void loadEnvironments();
    }
  }, [isLoaded, loadEnvironments]);

  const searchQuery = search.trim().toLowerCase();

  const visibleEnvironments = useMemo(
    () => environments.filter((environment) => (searchQuery ? environment.name.toLowerCase().includes(searchQuery) : true)),
    [environments, searchQuery],
  );

  const selectedEnvironment = useMemo(
    () => environments.find((environment) => environment.id === selectedEnvironmentId) ?? null,
    [environments, selectedEnvironmentId],
  );

  const draftVariables = useMemo(() => buildVariables(localVars), [localVars]);
  const hasUnsavedChanges = selectedEnvironment ? !sameVariables(draftVariables, selectedEnvironment.variables) : false;
  const visibleIds = useMemo(() => visibleEnvironments.map((environment) => environment.id), [visibleEnvironments]);
  const selectedBatchIds = useMemo(
    () => visibleIds.filter((environmentId) => selectedIds.has(environmentId)),
    [selectedIds, visibleIds],
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((environmentId) => selectedIds.has(environmentId));

  useEffect(() => {
    if (selectedEnvironment) {
      return;
    }

    const nextSelectedEnvironmentId = buildGlobalFallback(activeEnvironmentId, environments);
    if (selectedEnvironmentId !== nextSelectedEnvironmentId) {
      setSelectedEnvironmentId(nextSelectedEnvironmentId);
    }
  }, [activeEnvironmentId, environments, selectedEnvironment, selectedEnvironmentId]);

  useEffect(() => {
    const nextLocalVars = buildVarRows(selectedEnvironment);
    setLocalVars((current) => (sameVarRows(current, nextLocalVars) ? current : nextLocalVars));
  }, [selectedEnvironment]);

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((environmentId) => environments.some((environment) => environment.id === environmentId)));
      if (next.size === current.size) {
        return current;
      }
      return next;
    });
  }, [environments]);

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

  const executeSelect = async (environmentId: string) => {
    setSelectedEnvironmentId(environmentId);

    if (environmentId !== activeEnvironmentId) {
      await setActiveEnvironment(environmentId);
    }
  };

  const handleSelect = (environmentId: string) => {
    if (environmentId === selectedEnvironmentId) {
      void executeSelect(environmentId);
      return;
    }

    runWithUnsavedGuard(() => executeSelect(environmentId));
  };

  const handleToggleRowSelection = (environmentId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(environmentId)) {
        next.delete(environmentId);
      } else {
        next.add(environmentId);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleIds.forEach((environmentId) => next.delete(environmentId));
      } else {
        visibleIds.forEach((environmentId) => next.add(environmentId));
      }
      return next;
    });
  };

  const resetCreateForm = () => {
    setCreateName('');
    setIsCreatePanelVisible(false);
  };

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) {
      message.warning(t('environment.enterName'));
      return;
    }

    const environment: Environment = {
      id: createEnvironmentId(name),
      name,
      variables: {},
    };

    try {
      await saveEnvironment(environment);
      await setActiveEnvironment(environment.id);
      setSelectedEnvironmentId(environment.id);
      setSelectedIds(new Set());
      resetCreateForm();
      message.success(t('environment.saved'));
    } catch {
      message.error(t('environment.failedSave'));
    }
  };

  const handleAddVariable = () => {
    setLocalVars((current) => [...current, { id: String(Date.now()), key: '', value: '' }]);
  };

  const handleVarChange = (id: string, field: 'key' | 'value', value: string) => {
    setLocalVars((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const handleVarRemove = (id: string) => {
    setLocalVars((current) => current.filter((row) => row.id !== id));
  };

  const handleSaveSelected = async (): Promise<boolean> => {
    if (!selectedEnvironment) {
      return true;
    }

    if (!hasUnsavedChanges) {
      return true;
    }

    try {
      await saveEnvironment({ ...selectedEnvironment, variables: draftVariables });
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
    } else if (selectedEnvironment) {
      setLocalVars(buildVarRows(selectedEnvironment));
    }

    closeUnsavedGuard();
    await action();
  };

  const deleteEnvironmentIds = async (environmentIds: string[]) => {
    for (const environmentId of environmentIds) {
      await deleteEnvironment(environmentId);
    }

    setSelectedIds((current) => new Set(Array.from(current).filter((environmentId) => !environmentIds.includes(environmentId))));

    if (selectedEnvironmentId && environmentIds.includes(selectedEnvironmentId)) {
      setSelectedEnvironmentId(null);
    }
  };

  const confirmDelete = (environmentIds: string[]) => {
    const count = environmentIds.length;
    const targetEnvironment = count === 1
      ? environments.find((environment) => environment.id === environmentIds[0]) ?? null
      : null;

    Modal.confirm({
      title: t('environment.deleteConfirm'),
      content: count === 1
        ? t('environment.deleteMessage', { name: targetEnvironment?.name ?? '-' })
        : t('environment.batchDeleteMessage', { count }),
      okText: t('environment.delete'),
      cancelText: t('environment.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteEnvironmentIds(environmentIds);
          message.success(count === 1 ? t('environment.deleted') : t('environment.batchDeleted', { count }));
        } catch {
          message.error(t('environment.failedDelete'));
        }
      },
    });
  };

  const handleDeleteSelected = () => {
    if (!selectedEnvironment) {
      return;
    }

    runWithUnsavedGuard(() => {
      confirmDelete([selectedEnvironment.id]);
    });
  };

  const handleBatchDelete = () => {
    if (selectedBatchIds.length === 0) {
      return;
    }

    runWithUnsavedGuard(() => {
      confirmDelete(selectedBatchIds);
    });
  };

  const openRenameModal = (environmentId: string) => {
    const environment = environments.find((item) => item.id === environmentId);
    if (!environment) {
      return;
    }

    setNameModalState({
      id: environmentId,
      value: environment.name,
    });
  };

  const handleRename = (environmentId: string) => {
    runWithUnsavedGuard(() => {
      openRenameModal(environmentId);
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

    const environment = environments.find((item) => item.id === nameModalState.id);
    if (!environment) {
      setNameModalState(null);
      return;
    }

    if (name === environment.name) {
      setNameModalState(null);
      return;
    }

    try {
      await saveEnvironment({ ...environment, name });
      setNameModalState(null);
      message.success(t('environment.saved'));
    } catch {
      message.error(t('environment.failedSave'));
    }
  };

  const handleDuplicate = (environmentId: string) => {
    runWithUnsavedGuard(async () => {
      const environment = environments.find((item) => item.id === environmentId);
      if (!environment) {
        return;
      }

      const name = buildDuplicateEnvironmentName(
        environment.name,
        environments,
        t('environment.duplicateCopySuffix'),
      );
      const duplicatedEnvironment: Environment = {
        id: createEnvironmentId(name),
        name,
        variables: { ...environment.variables },
      };

      try {
        await saveEnvironment(duplicatedEnvironment);
        await setActiveEnvironment(duplicatedEnvironment.id);
        setSelectedEnvironmentId(duplicatedEnvironment.id);
        setSelectedIds(new Set());
        message.success(t('environment.saved'));
      } catch {
        message.error(t('environment.failedSave'));
      }
    });
  };

  const handleDelete = (environmentId: string) => {
    runWithUnsavedGuard(() => {
      confirmDelete([environmentId]);
    });
  };

  return (
    <div className="env-viewer" ref={containerRef}>
      <div className="env-list-pane" style={paneStyle}>
        <div className="env-title-row">
          <div className="env-title">{t('navRail.environments')}</div>
          <div className="env-title-chip">
            {selectedIds.size > 0 ? t('environment.selectedCount', { count: selectedIds.size }) : t('environment.customGroup')}
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
            onClick={() => setIsCreatePanelVisible((current) => !current)}
          >
            {t('environment.new')}
          </button>
          <button
            type="button"
            className="env-chip"
            disabled={visibleIds.length === 0}
            onClick={handleToggleSelectAll}
          >
            {allVisibleSelected ? t('environment.clearSelection') : t('environment.selectAll')}
          </button>
          <button
            type="button"
            className="env-chip"
            disabled={selectedBatchIds.length === 0}
            onClick={handleBatchDelete}
          >
            {t('environment.deleteSelected', { count: selectedBatchIds.length })}
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
          {visibleEnvironments.length === 0 ? (
            <button type="button" className="env-row disabled" disabled>
              <div className="env-row-name">-</div>
            </button>
          ) : (
            visibleEnvironments.map((environment) => (
              <EnvironmentRow
                key={environment.id}
                environment={environment}
                isChecked={selectedIds.has(environment.id)}
                isSelected={selectedEnvironmentId === environment.id}
                isActive={activeEnvironmentId === environment.id}
                onSelect={() => handleSelect(environment.id)}
                onToggleSelection={() => handleToggleRowSelection(environment.id)}
                onRename={() => handleRename(environment.id)}
                onDuplicate={() => handleDuplicate(environment.id)}
                onDelete={() => handleDelete(environment.id)}
                t={t}
              />
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
              <div className="env-detail-title">{selectedEnvironment?.name || '-'}</div>
              {selectedEnvironment && <div className="env-detail-subtitle">{t('environment.customGroup')}</div>}
            </div>
            <div className="env-detail-chip">{selectedEnvironment ? t('environment.customGroup') : t('environment.notSelected')}</div>
          </div>

          {selectedEnvironment && (
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

        {selectedEnvironment ? (
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
        <div className="env-modal-copy">{t('environment.unsavedChangesMessage', { name: selectedEnvironment?.name ?? '-' })}</div>
      </Modal>
    </div>
  );
};

export default EnvironmentsViewer;
