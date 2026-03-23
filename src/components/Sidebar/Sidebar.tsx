import React, { useState } from 'react';
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
} from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '../../stores/projectStore';
import { useRequestStore } from '../../stores/requestStore';
import { useNavStore } from '../../stores/navStore';
import type { TreeNode as AppTreeNode } from '../../types';
import { createNewRequest, getHttpMethodColor } from '../../types';
import * as api from '../../services/api';
import ImportDialog from '../Import/ImportDialog';
import { ChevronDownIcon, SearchIcon } from './TreeIcons';
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
  const [renameNodeProjectPath, setRenameNodeProjectPath] = useState('');
  const [importDialogVisible, setImportDialogVisible] = useState(false);

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
    toggleCollapse,
    isLoading,
  } = useProjectStore();
  const openRequest = useRequestStore((s) => s.openRequest);
  const openNewTab = useRequestStore((s) => s.openNewTab);
  const activeRequestTab = useRequestStore((s) => s.getActiveTab());
  const setActiveNavItem = useNavStore((s) => s.setActiveNavItem);
  const normalizedSearchValue = searchValue.trim().toLowerCase();

  // Convert AppTreeNode to Ant Design Tree format
  const convertToAntTree = (nodes: AppTreeNode[]): AntTreeNode[] => {
    return nodes.map((node) => ({
      key: node.path,
      title: node.name,
      isLeaf: node.node_type !== 'folder',
      children: node.children.length > 0 ? convertToAntTree(node.children) : undefined,
      method: node.method,
      nodePath: node.path,
      nodeType: node.node_type,
    }));
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

  // Context menu handlers
  const handleContextMenuRename = (node: AntTreeNode, projectPath: string) => {
    setRenameNodePath(node.nodePath);
    setRenameNodeProjectPath(projectPath);
    setRenameNewName(node.title);
    setRenameModalVisible(true);
  };

  const handleRename = async () => {
    if (!renameNewName.trim()) {
      message.warning(t('sidebar.enterName'));
      return;
    }

    try {
      await renameNode(renameNodeProjectPath, renameNodePath, renameNewName.trim());
      message.success(t('sidebar.renamedSuccess'));
      setRenameModalVisible(false);
      setRenameNodePath('');
      setRenameNewName('');
      setRenameNodeProjectPath('');
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
    const titleContent = node.isLeaf && node.method ? (
      <span className="tree-node-title">
        <span className="method-tag" style={{ color: getHttpMethodColor(node.method) }}>
          {node.method}
        </span>
        <span className="node-name">{node.title}</span>
      </span>
    ) : (
      <span className="tree-node-title">
        <span className="node-name">{node.title}</span>
      </span>
    );

    return (
      <Dropdown
        menu={{
          items: getContextMenuItems(node),
          onClick: ({ key }) => handleContextMenuClick(String(key), node, projectPath),
        }}
        trigger={['contextMenu']}
      >
        <span className="tree-title-wrapper">{titleContent}</span>
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
      const antTree = convertToAntTree(entry.treeData);
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

              return (
                <div key={projectPath} className="collection-section">
                  <Dropdown
                    menu={{
                      items: getCollectionHeaderMenuItems(projectPath),
                      onClick: ({ key }) => handleCollectionHeaderMenuClick(String(key), projectPath),
                    }}
                    trigger={['contextMenu']}
                  >
                    <button
                      type="button"
                      className={`collection-header ${isActiveCollection ? 'active' : ''}`}
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
        onCancel={() => {
          setRenameModalVisible(false);
          setRenameNodePath('');
          setRenameNewName('');
          setRenameNodeProjectPath('');
        }}
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

      <ImportDialog
        open={importDialogVisible}
        onClose={() => setImportDialogVisible(false)}
      />
    </div>
  );
};

export default Sidebar;
