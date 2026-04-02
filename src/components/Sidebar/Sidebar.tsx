import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tree, Button, Input, Dropdown, Modal, Select, message } from 'antd';
import type { MenuProps, TreeProps } from 'antd';
import {
  PlusOutlined,
  FolderAddOutlined,
  EditOutlined,
  DeleteOutlined,
  FileAddOutlined,
  ImportOutlined,
  ApiOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  CloseOutlined,
  SettingOutlined,
  MoreOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '../../stores/projectStore';
import { useRequestStore } from '../../stores/requestStore';
import { useNavStore } from '../../stores/navStore';
import type { Environment, TreeNode as AppTreeNode } from '../../types';
import { buildDuplicateEnvironmentName, buildDuplicateName, createEnvironmentId, createNewRequest, getHttpMethodColor } from '../../types';
import * as api from '../../services/api';
import ImportDialog from '../Import/ImportDialog';
import { ChevronDownIcon, FolderIcon, SearchIcon } from './TreeIcons';
import type { NavRailItem } from '../NavRail/NavRail';
import './Sidebar.css';

interface AntTreeNode {
  key: string;
  title: string;
  isLeaf?: boolean;
  children?: AntTreeNode[];
  method?: string;
  nodePath: string;
  nodeType: string;
}

interface RenderableAntTreeNode extends Omit<AntTreeNode, 'title' | 'children'> {
  title: React.ReactNode;
  children?: RenderableAntTreeNode[];
}

type RenderableTreeSelectInfo = Parameters<NonNullable<TreeProps<RenderableAntTreeNode>['onSelect']>>[1];

const EMPTY_TREE_SELECTED_KEYS: React.Key[] = [];
const INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|]/;

function normalizeNodePath(nodePath: string): string {
  return nodePath.replaceAll('\\', '/');
}

function getParentFolderPath(nodePath: string): string {
  const normalizedPath = normalizeNodePath(nodePath);
  const lastSlashIndex = normalizedPath.lastIndexOf('/');
  return lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : '.';
}

function findTreeNodeByPath(nodes: AppTreeNode[], targetPath: string): AppTreeNode | null {
  for (const node of nodes) {
    if (normalizeNodePath(node.path) === targetPath) {
      return node;
    }

    const matchedChild = findTreeNodeByPath(node.children, targetPath);
    if (matchedChild) {
      return matchedChild;
    }
  }

  return null;
}

function getRequestNamesInFolder(nodes: AppTreeNode[], folderPath: string): string[] {
  const normalizedFolderPath = normalizeNodePath(folderPath);
  const siblingNodes = normalizedFolderPath === '.'
    ? nodes
    : findTreeNodeByPath(nodes, normalizedFolderPath)?.children ?? [];

  return siblingNodes
    .filter((node) => node.node_type === 'request')
    .map((node) => node.name);
}

function buildRequestTreeOverrideKey(projectPath: string, nodePath: string): string {
  return `${projectPath}::${normalizeNodePath(nodePath)}`;
}

type EnvironmentRenameState = {
  projectPath: string;
  envId: string;
  value: string;
};

interface SidebarProps {
  activeNavItem: NavRailItem;
}

const Sidebar: React.FC<SidebarProps> = ({ activeNavItem }) => {
  const [width, setWidth] = useState(360);
  const [searchValue, setSearchValue] = useState('');
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFolderPath, setSelectedFolderPath] = useState('');
  const [newFolderProjectPath, setNewFolderProjectPath] = useState('');
  const [newProjectModalVisible, setNewProjectModalVisible] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameNodePath, setRenameNodePath] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  const [renameOriginalName, setRenameOriginalName] = useState('');
  const [renameNodeProjectPath, setRenameNodeProjectPath] = useState('');
  const [importDialogVisible, setImportDialogVisible] = useState(false);
  const [environmentRenameState, setEnvironmentRenameState] = useState<EnvironmentRenameState | null>(null);

  const { t } = useTranslation();
  const {
    collections,
    activeProjectPath,
    openProject,
    createProject,
    createFolder,
    renameNode,
    deleteNode,
    refreshTree,
    closeCollection,
    setActiveProject,
    setActiveEnvironment,
    saveEnvironment,
    deleteEnvironment,
    toggleCollapse,
    isLoading,
  } = useProjectStore();
  const openRequest = useRequestStore((s) => s.openRequest);
  const openNewTab = useRequestStore((s) => s.openNewTab);
  const activeRequestTab = useRequestStore((s) => s.getActiveTab());
  const requestTabs = useRequestStore((s) => s.tabs);
  const setActiveNavItem = useNavStore((s) => s.setActiveNavItem);
  const normalizedSearchValue = searchValue.trim().toLowerCase();
  const requestTreeOverrides = useMemo(() => {
    const overrides = new Map<string, { name: string; method?: string }>();

    for (const tab of requestTabs) {
      if (tab.type !== 'request' || !tab.projectPath || !tab.filePath) {
        continue;
      }

      overrides.set(buildRequestTreeOverrideKey(tab.projectPath, tab.filePath), {
        name: tab.request.name,
        method: tab.request.method,
      });
    }

    return overrides;
  }, [requestTabs]);

  // Convert AppTreeNode to Ant Design Tree format
  const convertToAntTree = (nodes: AppTreeNode[], projectPath: string): AntTreeNode[] => {
    return nodes.map((node) => {
      const override = node.node_type === 'request'
        ? requestTreeOverrides.get(buildRequestTreeOverrideKey(projectPath, node.path))
        : undefined;

      return {
        key: node.path,
        title: override?.name ?? node.name,
        isLeaf: node.node_type !== 'folder',
        children: node.children.length > 0 ? convertToAntTree(node.children, projectPath) : undefined,
        method: override?.method ?? node.method,
        nodePath: node.path,
        nodeType: node.node_type,
      };
    });
  };

  const filterTree = (nodes: AntTreeNode[]): AntTreeNode[] => {
    return nodes
      .map((node) => {
        if (node.children) {
          const filteredChildren = filterTree(node.children);
          if (filteredChildren.length > 0) {
            return { ...node, children: filteredChildren };
          }
        }

        if (node.title.toLowerCase().includes(normalizedSearchValue)) {
          return node;
        }

        return null;
      })
      .filter((node): node is AntTreeNode => node !== null);
  };

  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      setWidth(Math.min(500, Math.max(200, startWidth + moveEvent.clientX - startX)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleOpenProject = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('sidebar.selectProjectFolder'),
      });

      if (typeof selected === 'string') {
        await openProject(selected);
        message.success(t('sidebar.projectOpened'));
      }
    } catch (e) {
      message.error(t('sidebar.failedOpenProject', { error: e }));
    }
  };

  const handleSelectFolderForNewProject = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('sidebar.selectFolderForNew'),
      });

      if (typeof selected === 'string') {
        setNewProjectPath(selected);
        const pathParts = selected.split(/[\\/]/);
        const folderName = pathParts[pathParts.length - 1] || 'New Project';
        setNewProjectName(folderName);
        setNewProjectModalVisible(true);
      }
    } catch (e) {
      message.error(t('sidebar.failedSelectFolder', { error: e }));
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      message.warning(t('sidebar.enterProjectName'));
      return;
    }

    try {
      await createProject(newProjectPath, newProjectName.trim());
      message.success(t('sidebar.projectCreated'));
      setNewProjectModalVisible(false);
      setNewProjectName('');
      setNewProjectPath('');
    } catch (e) {
      message.error(t('sidebar.failedCreateProject', { error: e }));
    }
  };

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    switch (key) {
      case 'new-request':
        openNewTab();
        break;
      case 'new-websocket':
        openNewTab('websocket');
        break;
      case 'new-folder':
        if (activeProjectPath) {
          setNewFolderProjectPath(activeProjectPath);
          setSelectedFolderPath('');
          setNewFolderName('');
          setNewFolderModalVisible(true);
        }
        break;
      case 'import':
        setImportDialogVisible(true);
        break;
      case 'import-file':
        if (activeProjectPath) {
          handleImportFile(activeProjectPath);
        }
        break;
      case 'open-collection':
        handleOpenProject();
        break;
      case 'new-collection':
        handleSelectFolderForNewProject();
        break;
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      message.warning(t('sidebar.enterFolderName'));
      return;
    }

    try {
      await createFolder(newFolderProjectPath, selectedFolderPath || '.', newFolderName.trim());
      message.success(t('sidebar.folderCreated'));
      setNewFolderModalVisible(false);
      setNewFolderName('');
    } catch (e) {
      message.error(t('sidebar.failedCreateFolder', { error: e }));
    }
  };

  const resetRenameState = () => {
    setRenameModalVisible(false);
    setRenameNodePath('');
    setRenameNewName('');
    setRenameOriginalName('');
    setRenameNodeProjectPath('');
  };

  // Context menu handlers
  const handleContextMenuRename = (node: AntTreeNode, projectPath: string) => {
    setRenameNodePath(node.nodePath);
    setRenameNodeProjectPath(projectPath);
    setRenameNewName(node.title);
    setRenameOriginalName(node.title);
    setRenameModalVisible(true);
  };

  const handleRename = async () => {
    const trimmedName = renameNewName.trim();
    const trimmedOriginalName = renameOriginalName.trim();

    if (!trimmedName) {
      message.warning(t('sidebar.enterName'));
      return;
    }

    if (trimmedName === trimmedOriginalName) {
      resetRenameState();
      return;
    }

    if (INVALID_FILE_NAME_CHARS.test(trimmedName)) {
      message.warning(t('sidebar.invalidNodeName'));
      return;
    }

    try {
      await renameNode(renameNodeProjectPath, renameNodePath, trimmedName);
      message.success(t('sidebar.renamedSuccess'));
      resetRenameState();
    } catch (e) {
      message.error(t('sidebar.failedRename', { error: e }));
    }
  };

  const handleContextMenuDelete = async (node: AntTreeNode, projectPath: string) => {
    Modal.confirm({
      title: t('sidebar.deleteConfirm'),
      content: t('sidebar.deleteMessage', { name: node.title }),
      okText: t('sidebar.delete'),
      okType: 'danger',
      cancelText: t('sidebar.cancel'),
      onOk: async () => {
        try {
          await deleteNode(projectPath, node.nodePath);
          message.success(t('sidebar.deletedSuccess'));
        } catch (e) {
          message.error(t('sidebar.failedDelete', { error: e }));
        }
      },
    });
  };

  const handleContextMenuNewRequest = async (node: AntTreeNode, projectPath: string) => {
    try {
      const newReq = createNewRequest('New Request');
      const parentPath = node.nodeType === 'folder' ? node.nodePath : '.';
      await api.saveRequest(projectPath, `${parentPath}/${newReq.name}.req.json`, newReq);
      await refreshTree(projectPath);
      message.success(t('sidebar.requestCreated'));
    } catch (e) {
      message.error(t('sidebar.failedCreateRequest', { error: e }));
    }
  };

  const handleContextMenuDuplicateRequest = async (node: AntTreeNode, projectPath: string) => {
    if (node.nodeType !== 'request') {
      return;
    }

    try {
      const request = await api.readRequest(projectPath, node.nodePath);
      const parentPath = getParentFolderPath(node.nodePath);
      const siblingRequestNames = getRequestNamesInFolder(collections[projectPath]?.treeData ?? [], parentPath);
      const name = buildDuplicateName(request.name, siblingRequestNames, t('sidebar.duplicateCopySuffix'));
      const now = new Date().toISOString();
      const duplicatedRequest = {
        ...request,
        id: crypto.randomUUID(),
        name,
        meta: {
          created_at: now,
          updated_at: now,
        },
      };

      const duplicatePath = parentPath === '.' ? `${name}.req.json` : `${parentPath}/${name}.req.json`;
      await api.saveRequest(projectPath, duplicatePath, duplicatedRequest);
      await refreshTree(projectPath);
      message.success(t('sidebar.requestDuplicated'));
    } catch (e) {
      message.error(t('sidebar.failedDuplicateRequest', { error: e }));
    }
  };

  const handleContextMenuNewFolder = (node: AntTreeNode, projectPath: string) => {
    const parentPath = node.nodeType === 'folder' ? node.nodePath : '.';
    setNewFolderProjectPath(projectPath);
    setSelectedFolderPath(parentPath);
    setNewFolderName('');
    setNewFolderModalVisible(true);
  };

  const handleImportFile = async (projectPath: string, targetFolder?: string) => {
    try {
      const selected = await open({
        multiple: false,
        title: t('sidebar.importFileTitle'),
        filters: [
          { name: t('sidebar.importRequestFile'), extensions: ['req.json'] },
          { name: t('sidebar.importRequestFileFilter'), extensions: ['json'] },
        ],
      });

      if (typeof selected === 'string') {
        const folder = targetFolder || '.';
        await api.importRequestFile(selected, projectPath, folder);
        await refreshTree(projectPath);
        message.success(t('sidebar.importSuccess'));
      }
    } catch (e) {
      message.error(t('sidebar.failedImport', { error: e }));
    }
  };

  const handleContextMenuImportFile = (node: AntTreeNode, projectPath: string) => {
    const targetFolder = node.nodeType === 'folder' ? node.nodePath : '.';
    handleImportFile(projectPath, targetFolder);
  };

  const getContextMenuItems = (node: AntTreeNode): MenuProps['items'] => {
    const items: MenuProps['items'] = [];

    if (node.nodeType === 'folder') {
      items.push(
        { key: 'new-request', label: t('sidebar.newRequest'), icon: <FileAddOutlined /> },
        { key: 'new-folder', label: t('sidebar.newFolder'), icon: <FolderAddOutlined /> },
        { key: 'import-file', label: t('sidebar.importFile'), icon: <DownloadOutlined /> },
        { type: 'divider' },
      );
    }

    if (node.nodeType === 'request') {
      items.push(
        { key: 'duplicate', label: t('sidebar.duplicate'), icon: <CopyOutlined /> },
      );
    }

    items.push(
      { key: 'rename', label: t('sidebar.rename'), icon: <EditOutlined /> },
      { key: 'delete', label: t('sidebar.delete'), icon: <DeleteOutlined />, danger: true },
    );

    return items;
  };

  const handleContextMenuClick = (key: string, node: AntTreeNode, projectPath: string) => {
    switch (key) {
      case 'new-request':
        handleContextMenuNewRequest(node, projectPath);
        break;
      case 'new-folder':
        handleContextMenuNewFolder(node, projectPath);
        break;
      case 'import-file':
        handleContextMenuImportFile(node, projectPath);
        break;
      case 'duplicate':
        void handleContextMenuDuplicateRequest(node, projectPath);
        break;
      case 'rename':
        handleContextMenuRename(node, projectPath);
        break;
      case 'delete':
        handleContextMenuDelete(node, projectPath);
        break;
    }
  };

  const handleTreeSelect = async (
    _selectedKeys: React.Key[],
    info: RenderableTreeSelectInfo,
    projectPath: string,
  ) => {
    const node = info.node;

    if (node.nodeType === 'request') {
      try {
        const request = await api.readRequest(projectPath, node.nodePath);
        openRequest(node.nodePath, request, projectPath);
      } catch (e) {
        message.error(t('sidebar.failedOpenRequest', { error: e }));
      }
    }
  };

  const hasCollections = Object.keys(collections).length > 0;

  const menuItems: MenuProps['items'] = [
    { key: 'new-request', label: t('sidebar.newRequest'), icon: <FileAddOutlined />, disabled: !hasCollections },
    { key: 'new-websocket', label: t('sidebar.newWebSocket'), icon: <ApiOutlined />, disabled: !hasCollections },
    { key: 'new-folder', label: t('sidebar.newFolder'), icon: <FolderAddOutlined />, disabled: !hasCollections },
    { type: 'divider' },
    { key: 'import-file', label: t('sidebar.importFile'), icon: <DownloadOutlined />, disabled: !hasCollections },
    { key: 'import', label: t('sidebar.import'), icon: <ImportOutlined />, disabled: !hasCollections },
    { type: 'divider' },
    { key: 'open-collection', label: t('sidebar.openCollection'), icon: <FolderOpenOutlined /> },
    { key: 'new-collection', label: t('sidebar.newCollection'), icon: <PlusOutlined /> },
  ];

  // Collection header context menu
  const getCollectionHeaderMenuItems = (_projectPath: string): MenuProps['items'] => [
    { key: 'new-request', label: t('sidebar.newRequest'), icon: <FileAddOutlined /> },
    { key: 'new-folder', label: t('sidebar.newFolder'), icon: <FolderAddOutlined /> },
    { type: 'divider' },
    { key: 'close-collection', label: t('sidebar.closeCollection'), icon: <CloseOutlined /> },
  ];

  const handleCollectionHeaderMenuClick = (key: string, projectPath: string) => {
    switch (key) {
      case 'new-request': {
        openNewTab();
        setActiveProject(projectPath);
        break;
      }
      case 'new-folder': {
        setNewFolderProjectPath(projectPath);
        setSelectedFolderPath('');
        setNewFolderName('');
        setNewFolderModalVisible(true);
        break;
      }
      case 'close-collection': {
        closeCollection(projectPath);
        break;
      }
    }
  };

  const renderTreeTitle = (node: AntTreeNode, projectPath: string) => {
    const actionMenu: MenuProps = {
      items: getContextMenuItems(node),
      onClick: ({ key }) => handleContextMenuClick(String(key), node, projectPath),
    };

    const titleContent = node.isLeaf && node.method ? (
      <span className="tree-node-title">
        <span className="method-tag" style={{ color: getHttpMethodColor(node.method) }}>
          {node.method}
        </span>
        <span className="node-name">{node.title}</span>
      </span>
    ) : (
      <span className="tree-node-title">
        <FolderIcon className="tree-folder-icon" />
        <span className="node-name">{node.title}</span>
      </span>
    );

    return (
      <Dropdown menu={actionMenu} trigger={['contextMenu']}>
        <span className="tree-title-wrapper">
          <span className="tree-title-main">{titleContent}</span>
          <Dropdown menu={actionMenu} trigger={['click']}>
            <button
              type="button"
              className="tree-row-actions-trigger"
              aria-label={t(node.nodeType === 'folder' ? 'sidebar.folderActions' : 'sidebar.requestActions')}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <MoreOutlined />
            </button>
          </Dropdown>
        </span>
      </Dropdown>
    );
  };

  const renderTreeNodes = (nodes: AntTreeNode[], projectPath: string): RenderableAntTreeNode[] => {
    return nodes.map((node) => ({
      ...node,
      title: renderTreeTitle(node, projectPath),
      children: node.children ? renderTreeNodes(node.children, projectPath) : undefined,
    }));
  };

  const filteredCollections = Object.entries(collections)
    .map(([projectPath, entry]) => {
      const antTree = convertToAntTree(entry.treeData, projectPath);
      const filteredTree = normalizedSearchValue ? filterTree(antTree) : antTree;

      return {
        projectPath,
        entry,
        treeNodes: renderTreeNodes(filteredTree, projectPath),
      };
    })
    .filter(({ treeNodes }) => !normalizedSearchValue || treeNodes.length > 0);

  const currentCollectionPath = activeProjectPath ?? Object.keys(collections)[0] ?? null;
  const currentCollection = currentCollectionPath ? collections[currentCollectionPath] : undefined;
  const currentEnvironmentOptions = (currentCollection?.environments ?? []).map((env) => ({
    label: env.name,
    value: env.id,
  }));
  const activeProjectEnvironment = currentCollection?.activeEnvironment
    ? currentCollection.environments.find((environment) => environment.id === currentCollection.activeEnvironment) ?? null
    : null;
  const isEnvironmentActionDisabled = !currentCollectionPath || !activeProjectEnvironment;

  const closeEnvironmentRenameModal = () => {
    setEnvironmentRenameState(null);
  };

  const openEnvironmentRenameModal = () => {
    if (!currentCollectionPath || !activeProjectEnvironment) {
      return;
    }

    setEnvironmentRenameState({
      projectPath: currentCollectionPath,
      envId: activeProjectEnvironment.id,
      value: activeProjectEnvironment.name,
    });
  };

  const handleConfirmEnvironmentRename = async () => {
    if (!environmentRenameState) {
      return;
    }

    const name = environmentRenameState.value.trim();
    if (!name) {
      message.warning(t('environment.enterName'));
      return;
    }

    const collectionEntry = collections[environmentRenameState.projectPath];
    const environment = collectionEntry?.environments.find((item) => item.id === environmentRenameState.envId);
    if (!environment) {
      closeEnvironmentRenameModal();
      return;
    }

    if (name === environment.name) {
      closeEnvironmentRenameModal();
      return;
    }

    try {
      setActiveProject(environmentRenameState.projectPath);
      await saveEnvironment(environmentRenameState.projectPath, { ...environment, name });
      closeEnvironmentRenameModal();
      message.success(t('environment.saved'));
    } catch {
      message.error(t('environment.failedSave'));
    }
  };

  const handleDuplicateActiveEnvironment = async () => {
    if (!currentCollectionPath || !activeProjectEnvironment) {
      return;
    }

    const name = buildDuplicateEnvironmentName(
      activeProjectEnvironment.name,
      currentCollection?.environments ?? [],
      t('environment.duplicateCopySuffix'),
    );
    const duplicateEnvironment: Environment = {
      id: createEnvironmentId(name),
      name,
      variables: { ...activeProjectEnvironment.variables },
    };

    try {
      setActiveProject(currentCollectionPath);
      await saveEnvironment(currentCollectionPath, duplicateEnvironment);
      await setActiveEnvironment(currentCollectionPath, duplicateEnvironment.id);
      message.success(t('environment.saved'));
    } catch {
      message.error(t('environment.failedSave'));
    }
  };

  const handleDeleteActiveEnvironment = () => {
    if (!currentCollectionPath || !activeProjectEnvironment) {
      return;
    }

    Modal.confirm({
      title: t('environment.deleteConfirm'),
      content: t('environment.deleteMessage', { name: activeProjectEnvironment.name }),
      okText: t('environment.delete'),
      okType: 'danger',
      cancelText: t('environment.cancel'),
      onOk: async () => {
        try {
          setActiveProject(currentCollectionPath);
          await deleteEnvironment(currentCollectionPath, activeProjectEnvironment.id);
          message.success(t('environment.deleted'));
        } catch {
          message.error(t('environment.failedDelete'));
        }
      },
    });
  };

  const environmentActionMenu: MenuProps = {
    items: [
      { key: 'rename', label: t('environment.rename') },
      { key: 'duplicate', label: t('environment.duplicate') },
      { key: 'delete', label: t('environment.delete'), danger: true },
    ],
    onClick: ({ key }) => {
      if (isEnvironmentActionDisabled) {
        return;
      }

      switch (key) {
        case 'rename':
          openEnvironmentRenameModal();
          break;
        case 'duplicate':
          void handleDuplicateActiveEnvironment();
          break;
        case 'delete':
          handleDeleteActiveEnvironment();
          break;
        default:
          break;
      }
    },
  };

  const handleOpenEnvironmentManager = () => {
    if (currentCollectionPath) {
      setActiveProject(currentCollectionPath);
    }
    setActiveNavItem('environments');
  };

  const renderCollectionsPanel = () => {
    if (!hasCollections) {
      return (
        <div className="sidebar-content">
          <div className="workspace-header">
            <span className="workspace-title">{t('navRail.collections')}</span>
          </div>

          <div className="empty-state">
            <div className="empty-state-content">
              <h3 className="empty-state-title">{t('sidebar.noCollections')}</h3>
              <p className="empty-state-subtitle">{t('sidebar.openOrCreateHint')}</p>
            </div>

            <div className="empty-state-actions">
              <Button type="primary" className="action-btn-primary" onClick={handleOpenProject} loading={isLoading}>
                {t('sidebar.openProject')}
              </Button>
              <Button className="action-btn-secondary" onClick={handleSelectFolderForNewProject}>
                {t('sidebar.newProject')}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="sidebar-content">
        <div className="workspace-header">
          <span className="workspace-title">{t('navRail.collections')}</span>
          <div className="workspace-actions">
            <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['click']}>
              <Button className="workspace-chip" icon={<PlusOutlined />} loading={isLoading}>
                {t('sidebar.createRequest')}
              </Button>
            </Dropdown>
          </div>
        </div>

        <div className="sidebar-header">
          <Input
            allowClear
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={t('sidebar.searchPlaceholder')}
            prefix={<SearchIcon />}
          />
          <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['click']}>
            <Button type="text" icon={<PlusOutlined />} aria-label={t('sidebar.createRequest')} />
          </Dropdown>
        </div>

        <div className="env-selector-bar">
          <Select
            value={currentCollection?.activeEnvironment || undefined}
            placeholder={t('environment.selectEnv')}
            options={currentEnvironmentOptions}
            disabled={!currentCollectionPath || currentEnvironmentOptions.length === 0}
            style={{ flex: 1 }}
            onChange={(value) => {
              if (!currentCollectionPath) {
                return;
              }
              setActiveProject(currentCollectionPath);
              void setActiveEnvironment(currentCollectionPath, value).catch(() => {
                message.error(t('environment.failedActivate'));
              });
            }}
          />
          <Dropdown menu={environmentActionMenu} trigger={['click']} disabled={isEnvironmentActionDisabled}>
            <Button
              type="text"
              className="env-selector-actions-trigger"
              icon={<MoreOutlined />}
              aria-label={t('environment.rowActions')}
              title={t('environment.rowActions')}
              disabled={isEnvironmentActionDisabled}
            />
          </Dropdown>
          <Button
            type="text"
            icon={<SettingOutlined />}
            aria-label={t('environment.manage')}
            title={t('environment.manage')}
            onClick={handleOpenEnvironmentManager}
          />
        </div>

        <div className="collections-list">
          {filteredCollections.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-content">
                <h3 className="empty-state-title">{t('sidebar.noMatch')}</h3>
                <p className="empty-state-subtitle">{t('sidebar.searchPlaceholder')}</p>
              </div>
            </div>
          ) : (
            filteredCollections.map(({ projectPath, entry, treeNodes }) => {
              const isActiveCollection = activeProjectPath === projectPath;
              const isExpanded = !entry.isCollapsed;
              const collectionActionMenu: MenuProps = {
                items: getCollectionHeaderMenuItems(projectPath),
                onClick: ({ key }) => handleCollectionHeaderMenuClick(String(key), projectPath),
              };

              return (
                <div key={projectPath} className="collection-section">
                  <Dropdown menu={collectionActionMenu} trigger={['contextMenu']}>
                    <div className={`collection-header ${isActiveCollection ? 'active' : ''}`}>
                      <button
                        type="button"
                        className="collection-header-main"
                        onClick={() => {
                          if (activeProjectPath !== projectPath) {
                            setActiveProject(projectPath);
                            if (entry.isCollapsed) {
                              toggleCollapse(projectPath);
                            }
                            return;
                          }
                          toggleCollapse(projectPath);
                        }}
                      >
                        <ChevronDownIcon className={`collapse-icon ${isExpanded ? 'expanded' : ''}`} />
                        <span className="collection-name">{entry.project.name}</span>
                      </button>

                      <Dropdown menu={collectionActionMenu} trigger={['click']}>
                        <button
                          type="button"
                          className="collection-actions-trigger"
                          aria-label={t('sidebar.collectionActions')}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <MoreOutlined />
                        </button>
                      </Dropdown>
                    </div>
                  </Dropdown>

                  {!entry.isCollapsed && (
                    <div className="collection-body">
                      {treeNodes.length > 0 ? (
                        <Tree<RenderableAntTreeNode>
                          blockNode
                          showIcon={false}
                          switcherIcon={<ChevronDownIcon className="tree-switcher-icon" />}
                          treeData={treeNodes}
                          selectedKeys={
                            activeRequestTab?.projectPath === projectPath && activeRequestTab.filePath
                              ? [activeRequestTab.filePath]
                              : EMPTY_TREE_SELECTED_KEYS
                          }
                          onSelect={(selectedKeys, info) => {
                            setActiveProject(projectPath);
                            handleTreeSelect(selectedKeys, info, projectPath);
                          }}
                        />
                      ) : (
                        <div className="collection-empty">
                          {searchValue ? t('sidebar.noMatch') : t('sidebar.noRequests')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const getPanelTitle = () => {
    switch (activeNavItem) {
      case 'collections':
        return t('navRail.collections');
      case 'history':
        return t('navRail.history');
      case 'environments':
        return t('navRail.environments');
      case 'javaImport':
        return t('navRail.javaImport');
      case 'apiDocs':
        return t('navRail.apiDocs');
      case 'permissionConfig':
        return t('navRail.permissionConfig');
      case 'settings':
        return t('navRail.settings');
      default:
        return '';
    }
  };

  return (
    <div className="sidebar" style={{ width }}>
      {activeNavItem !== 'collections' && (
        <div className="sidebar-panel-header">
          <span className="panel-title">{getPanelTitle()}</span>
        </div>
      )}

      {activeNavItem === 'collections' && renderCollectionsPanel()}

      <button
        type="button"
        className="resize-handle"
        aria-label="Resize sidebar"
        onMouseDown={handleResize}
      />

      <Modal
        title={t('sidebar.newFolderTitle')}
        open={newFolderModalVisible}
        onOk={handleCreateFolder}
        onCancel={() => setNewFolderModalVisible(false)}
        okText={t('sidebar.create')}
        cancelText={t('sidebar.cancel')}
      >
        <Input
          placeholder={t('sidebar.folderNamePlaceholder')}
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
          autoFocus
        />
      </Modal>

      <Modal
        title={t('sidebar.createNewProject')}
        open={newProjectModalVisible}
        onOk={handleCreateProject}
        onCancel={() => {
          setNewProjectModalVisible(false);
          setNewProjectName('');
          setNewProjectPath('');
        }}
        okText={t('sidebar.create')}
        cancelText={t('sidebar.cancel')}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('sidebar.location')}
          </label>
          <Input value={newProjectPath} disabled />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('sidebar.projectName')}
          </label>
          <Input
            placeholder={t('sidebar.projectNamePlaceholder')}
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onPressEnter={handleCreateProject}
            autoFocus
          />
        </div>
      </Modal>

      <Modal
        title={t('sidebar.renameTitle')}
        open={renameModalVisible}
        onOk={handleRename}
        onCancel={resetRenameState}
        okText={t('sidebar.rename')}
        cancelText={t('sidebar.cancel')}
      >
        <Input
          placeholder={t('sidebar.newNamePlaceholder')}
          value={renameNewName}
          onChange={(e) => setRenameNewName(e.target.value)}
          onPressEnter={handleRename}
          autoFocus
        />
      </Modal>

      <Modal
        title={t('environment.renameTitle')}
        open={Boolean(environmentRenameState)}
        onOk={() => void handleConfirmEnvironmentRename()}
        onCancel={closeEnvironmentRenameModal}
        okText={t('environment.save')}
        cancelText={t('environment.cancel')}
      >
        <Input
          value={environmentRenameState?.value ?? ''}
          onChange={(event) => setEnvironmentRenameState((current) => (current ? { ...current, value: event.target.value } : current))}
          onPressEnter={() => void handleConfirmEnvironmentRename()}
          placeholder={t('environment.envNamePlaceholder')}
          autoFocus
        />
      </Modal>

      <ImportDialog
        open={importDialogVisible}
        onClose={() => setImportDialogVisible(false)}
      />
    </div>
  );
};

export default Sidebar;
