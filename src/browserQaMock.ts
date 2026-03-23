import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import type {
  ApiDocListItem,
  CheckNewEndpointsResponse,
  GenerateApiDocsOptions,
  GenerateApiDocsResult,
  GlobalEnvironmentsStorage,
  JavaProjectsStorage,
  ParsedJavaProject,
  StoredJavaProject,
} from './services/api';
import { isQaPreset } from './browserQaPreset';
import { createNewRequest } from './types';
import type { CollectionEntry, Environment, HistoryEntry, HttpResponse, Project, RequestFile, TreeNode } from './types';
import { useAppShellStore } from './stores/appShellStore';
import { useHistoryStore } from './stores/historyStore';
import { getNewEndpointIds, getEndpointCompositeKeys, useJavaProjectStore } from './stores/javaProjectStore';
import { useApiDocStore } from './stores/apiDocStore';
import { useNavStore } from './stores/navStore';
import { buildDefaultForm, usePermissionConfigStore } from './stores/permissionConfigStore';
import { useProjectStore } from './stores/projectStore';
import { useRequestStore } from './stores/requestStore';
import { useThemeStore, type ThemeSkin, isThemeSkin } from './stores/themeStore';
import { buildPermissionDraftRows } from './utils/permissionSql';

const SAVED_JAVA_PROJECT_PATH = 'D:/mock/sjy-post/yxcscene-service';
const CURRENT_JAVA_PROJECT_PATH = 'D:/mock/projass/projass-service';
const GENERATED_PROJECT_PATH = 'D:/mock/SjyPostGenerated';
const SAVED_JAVA_PROJECT_ID = 'qa-java-project-saved';
const CURRENT_JAVA_PROJECT_ID = 'qa-java-project-current';
const QA_TIMESTAMP = '2026-03-20T10:00:00.000Z';
const JAVA_IMPORT_QA_NAV = 'javaImport';
const API_DOCS_QA_NAV = 'apiDocs';
const PERMISSION_CONFIG_QA_NAV = 'permissionConfig';
const COLLECTIONS_QA_NAV = 'collections';
const SETTINGS_QA_NAV = 'settings';
const HISTORY_QA_NAV = 'history';
const API_DOCS_QA_PROJECT_PATH = CURRENT_JAVA_PROJECT_PATH;
const HISTORY_QA_PROJECT_PATH = 'D:/mock/sjy-post/history-demo';
const COLLECTIONS_QA_PROJECT_PATH = 'D:/mock/sjy-post/collections-demo';
const COLLECTIONS_QA_ACTIVE_TAB_ID = 'collections-qa-active-tab';
const COLLECTIONS_QA_SECONDARY_TAB_ID = 'collections-qa-secondary-tab';
const API_DOCS_SELECTED_FILE = 'project-contract-list.md';
const PERMISSION_CONFIG_QA_SQL_TIMESTAMP = '2026-03-20 10:00:00';
const PERMISSION_CONFIG_QA_FORM = buildDefaultForm({
  initialServCode: 'OA_PROJECT_CONTRACT_0100',
  appId: 'projass-service',
  createUser: 'qa_user',
});
let GLOBAL_ENVIRONMENTS_STORAGE: GlobalEnvironmentsStorage = {
  environments: [],
  activeEnvironmentId: null,
};
const UPDATER_QA_METADATA = {
  rid: 1,
  currentVersion: '1.0.0',
  version: '1.0.1',
  date: QA_TIMESTAMP,
  body: 'Browser QA mock update package.',
  rawJson: {
    version: '1.0.1',
    notes: 'Browser QA mock update package.',
  },
};

let mocksInstalled = false;

const MOCK_PARSED_DATA: ParsedJavaProject = {
  projectPath: CURRENT_JAVA_PROJECT_PATH,
  controllers: [
    {
      name: 'OaProjectContractController',
      basePath: '/oa/project/contract',
      description: 'Project contract endpoints',
      endpoints: [
        {
          id: 'project-contract-list',
          controllerName: 'OaProjectContractController',
          methodName: 'list',
          httpMethod: 'POST',
          path: '/list',
          fullPath: '/oa/project/contract/list',
          summary: 'List project contracts',
          description: 'Returns the contract list.',
          requestBodyFields: [],
          requestParams: [],
          responseBodyFields: [],
        },
        {
          id: 'project-contract-get-by-id',
          controllerName: 'OaProjectContractController',
          methodName: 'getById',
          httpMethod: 'GET',
          path: '/getById',
          fullPath: '/oa/project/contract/getById',
          summary: 'Get project contract detail',
          description: 'Returns contract detail by id.',
          requestBodyFields: [],
          requestParams: [],
          responseBodyFields: [],
        },
        {
          id: 'project-contract-delete',
          controllerName: 'OaProjectContractController',
          methodName: 'delete',
          httpMethod: 'POST',
          path: '/delete',
          fullPath: '/oa/project/contract/delete',
          summary: 'Delete project contract',
          description: 'Deletes the selected contract.',
          requestBodyFields: [],
          requestParams: [],
          responseBodyFields: [],
        },
      ],
    },
  ],
};

const ALL_ENDPOINT_KEYS = getEndpointCompositeKeys(MOCK_PARSED_DATA);

const API_DOCS_QA_LIST: ApiDocListItem[] = [
  {
    id: 'project-contract-list-doc',
    title: '合同列表接口',
    endpointPath: '/oa/project/contract/list',
    httpMethod: 'POST',
    controllerName: 'OaProjectContractController',
    controllerDescription: '项目合同接口',
    fileName: API_DOCS_SELECTED_FILE,
    generatedAt: QA_TIMESTAMP,
  },
  {
    id: 'project-contract-get-by-id-doc',
    title: '合同详情接口',
    endpointPath: '/oa/project/contract/getById',
    httpMethod: 'GET',
    controllerName: 'OaProjectContractController',
    controllerDescription: '项目合同接口',
    fileName: 'project-contract-detail.md',
    generatedAt: QA_TIMESTAMP,
  },
  {
    id: 'project-contract-delete-doc',
    title: '删除合同接口',
    endpointPath: '/oa/project/contract/delete',
    httpMethod: 'POST',
    controllerName: 'OaProjectContractController',
    controllerDescription: '项目合同接口',
    fileName: 'project-contract-delete.md',
    generatedAt: QA_TIMESTAMP,
  },
];

const API_DOCS_QA_CONTENT: Record<string, string> = {
  [API_DOCS_SELECTED_FILE]: `# 合同列表接口

## 接口说明
用于分页查询项目合同列表，支持按项目名称、合同编号和状态筛选。

## 请求信息
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| pageNum | integer | 是 | 页码 |
| pageSize | integer | 是 | 每页数量 |
| projectName | string | 否 | 项目名称 |
| contractStatus | string | 否 | 合同状态 |

## 响应示例
\`\`\`json
{
  "code": 200,
  "message": "success",
  "data": {
    "total": 2,
    "records": [
      {
        "id": "HT-2026-001",
        "projectName": "星河社区改造项目",
        "contractAmount": 3860000,
        "status": "SIGNED"
      }
    ]
  }
}
\`\`\`

- 返回数据按签约时间倒序排列
- 状态枚举与项目主数据保持一致
`,
  'project-contract-detail.md': `# 合同详情接口

## 接口说明
根据合同 ID 查询合同详情。

## 请求参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | 合同主键 |

## 响应示例
\`\`\`json
{
  "code": 200,
  "data": {
    "id": "HT-2026-001",
    "contractNo": "HT2026001",
    "projectName": "星河社区改造项目"
  }
}
\`\`\`
`,
  'project-contract-delete.md': `# 删除合同接口

## 接口说明
删除指定合同记录。

## 请求参数
| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | 合同主键 |

- 删除后会同步刷新合同列表
- 仅管理员角色可执行
`,
};

const PERMISSION_CONFIG_QA_ENDPOINTS = MOCK_PARSED_DATA.controllers.flatMap((controller) =>
  controller.endpoints.map((endpoint) => ({ ...endpoint, controllerName: controller.name })),
);
const PERMISSION_CONFIG_QA_ENDPOINT_IDS = PERMISSION_CONFIG_QA_ENDPOINTS.map((endpoint) => endpoint.id);
const PERMISSION_CONFIG_QA_ROWS = buildPermissionDraftRows(PERMISSION_CONFIG_QA_ENDPOINTS, PERMISSION_CONFIG_QA_FORM).map((row, index) => ({
  ...row,
  id: `permission-config-row-${index + 1}`,
  insertTime: PERMISSION_CONFIG_QA_SQL_TIMESTAMP,
  createTime: PERMISSION_CONFIG_QA_SQL_TIMESTAMP,
  updateTime: PERMISSION_CONFIG_QA_SQL_TIMESTAMP,
}));

const createSavedProject = (overrides?: Partial<StoredJavaProject>): StoredJavaProject => ({
  id: SAVED_JAVA_PROJECT_ID,
  name: 'yxcscene-service',
  path: SAVED_JAVA_PROJECT_PATH,
  isOpen: false,
  lastParsedAt: QA_TIMESTAMP,
  seenEndpointIds: ALL_ENDPOINT_KEYS,
  ...overrides,
});

const createCurrentProject = (overrides?: Partial<StoredJavaProject>): StoredJavaProject => ({
  id: CURRENT_JAVA_PROJECT_ID,
  name: 'projass-service',
  path: CURRENT_JAVA_PROJECT_PATH,
  isOpen: true,
  lastParsedAt: QA_TIMESTAMP,
  seenEndpointIds: ALL_ENDPOINT_KEYS,
  ...overrides,
});

const upsertProject = (projects: StoredJavaProject[], nextProject: StoredJavaProject) => {
  const existingIndex = projects.findIndex((project) => project.id === nextProject.id || project.path === nextProject.path);
  if (existingIndex === -1) {
    return [...projects, nextProject];
  }

  const updatedProjects = [...projects];
  updatedProjects[existingIndex] = nextProject;
  return updatedProjects;
};
const getDialogSelection = (title: string) => {
  const normalizedTitle = title.toLowerCase();
  if (normalizedTitle.includes('new') || title.includes('新')) {
    return GENERATED_PROJECT_PATH;
  }
  return CURRENT_JAVA_PROJECT_PATH;
};

const cloneTree = (nodes: TreeNode[]): TreeNode[] => (
  nodes.map((node) => ({
    ...node,
    children: cloneTree(node.children),
  }))
);

const cloneEnvironments = (environments: Environment[]): Environment[] => (
  environments.map((environment) => ({
    ...environment,
    variables: { ...environment.variables },
  }))
);

const cloneProject = (project: Project): Project => ({
  ...project,
  config: {
    ...project.config,
    settings: { ...project.config.settings },
  },
});

type QaProjectEnvironmentState = {
  environments: Environment[];
  activeEnvironment: string | null;
};

let qaProjectEnvironmentsByPath: Record<string, QaProjectEnvironmentState> = {};

const createQaProjectEnvironmentState = (
  environments: Environment[],
  activeEnvironment: string | null,
): QaProjectEnvironmentState => ({
  environments: cloneEnvironments(environments),
  activeEnvironment,
});

const upsertEnvironment = (environments: Environment[], environment: Environment): Environment[] => {
  const clonedEnvironment: Environment = {
    ...environment,
    variables: { ...environment.variables },
  };
  const nextEnvironments = cloneEnvironments(environments);
  const existingIndex = nextEnvironments.findIndex((item) => item.id === environment.id);
  if (existingIndex === -1) {
    return [...nextEnvironments, clonedEnvironment];
  }
  nextEnvironments[existingIndex] = clonedEnvironment;
  return nextEnvironments;
};

const resetQaProjectEnvironmentState = () => {
  qaProjectEnvironmentsByPath = {
    [COLLECTIONS_QA_PROJECT_PATH]: createQaProjectEnvironmentState(COLLECTIONS_QA_ENVIRONMENTS, 'dev'),
    [CURRENT_JAVA_PROJECT_PATH]: createQaProjectEnvironmentState(COLLECTIONS_QA_ENVIRONMENTS, 'dev'),
    [HISTORY_QA_PROJECT_PATH]: createQaProjectEnvironmentState(COLLECTIONS_QA_ENVIRONMENTS, 'staging'),
  };
};

const resetGlobalEnvironmentState = () => {
  GLOBAL_ENVIRONMENTS_STORAGE = {
    environments: [],
    activeEnvironmentId: null,
  };
};

const getQaProjectEnvironmentState = (projectPath: string): QaProjectEnvironmentState => {
  const existingState = qaProjectEnvironmentsByPath[projectPath];
  if (existingState) {
    return existingState;
  }

  const nextState = createQaProjectEnvironmentState(COLLECTIONS_QA_ENVIRONMENTS, 'dev');
  qaProjectEnvironmentsByPath = {
    ...qaProjectEnvironmentsByPath,
    [projectPath]: nextState,
  };
  return nextState;
};

const cloneHistoryEntries = (entries: HistoryEntry[] = HISTORY_QA_ENTRIES): HistoryEntry[] => (
  entries.map((entry) => ({
    ...entry,
    request_headers: { ...entry.request_headers },
    response_headers: { ...entry.response_headers },
  }))
);

const getQaProject = (path: string): Project => {
  let project: Project;

  if (path === COLLECTIONS_QA_PROJECT_PATH) {
    project = cloneProject(COLLECTIONS_QA_PROJECT);
  } else if (path === HISTORY_QA_PROJECT_PATH) {
    project = cloneProject(HISTORY_QA_PROJECT);
  } else if (path === CURRENT_JAVA_PROJECT_PATH) {
    project = cloneProject(WELCOME_QA_PROJECT);
  } else {
    const segments = path.split(/[\\/]/).filter(Boolean);
    const name = segments.pop() ?? WELCOME_QA_PROJECT.name;
    project = {
      ...cloneProject(WELCOME_QA_PROJECT),
      path,
      name,
      config: {
        ...WELCOME_QA_PROJECT.config,
        name,
        settings: { ...WELCOME_QA_PROJECT.config.settings },
      },
    };
  }

  const environmentState = getQaProjectEnvironmentState(path);
  return {
    ...project,
    config: {
      ...project.config,
      active_environment: environmentState.activeEnvironment,
    },
  };
};

const getQaTree = (path: string): TreeNode[] => {
  if (path === COLLECTIONS_QA_PROJECT_PATH) {
    return cloneTree(COLLECTIONS_QA_TREE);
  }

  if (path === HISTORY_QA_PROJECT_PATH) {
    return cloneTree(HISTORY_QA_TREE);
  }

  return cloneTree(WELCOME_QA_TREE);
};

const getQaEnvironments = (projectPath: string): Environment[] => {
  return cloneEnvironments(getQaProjectEnvironmentState(projectPath).environments);
};

const createQaCollectionEntry = (
  project: Project,
  treeData: TreeNode[],
  environments: Environment[],
  activeEnvironment: string | null,
): CollectionEntry => ({
  project: cloneProject(project),
  treeData: cloneTree(treeData),
  environments: cloneEnvironments(environments),
  activeEnvironment,
  isCollapsed: false,
  isLoading: false,
});

const setQaProjectState = (entry: CollectionEntry) => {
  useProjectStore.setState({
    collections: {
      [entry.project.path]: entry,
    },
    activeProjectPath: entry.project.path,
    project: entry.project,
    treeData: entry.treeData,
    environments: entry.environments,
    activeEnvironment: entry.activeEnvironment,
    isLoading: false,
    error: null,
  });
};

const seedQaJavaProjectState = () => {
  const savedProject = createSavedProject();
  const currentProject = createCurrentProject();
  useJavaProjectStore.setState({
    projects: [savedProject, currentProject],
    currentProject,
    parsedData: MOCK_PARSED_DATA,
    newEndpointIds: getNewEndpointIds(MOCK_PARSED_DATA, currentProject.seenEndpointIds),
    importedEndpointIds: [],
    isLoading: false,
    isLoaded: true,
    error: null,
  });
  return currentProject;
};

const seedJavaImportViewerState = (theme: ThemeSkin) => {
  useThemeStore.getState().setSkin(theme);
  useNavStore.getState().setActiveNavItem(JAVA_IMPORT_QA_NAV);
  seedQaJavaProjectState();
};

const seedApiDocsViewerState = (theme: ThemeSkin) => {
  useThemeStore.getState().setSkin(theme);
  useNavStore.getState().setActiveNavItem(API_DOCS_QA_NAV);
  useApiDocStore.setState({
    docs: API_DOCS_QA_LIST,
    currentDocContent: API_DOCS_QA_CONTENT[API_DOCS_SELECTED_FILE],
    currentDocFileName: API_DOCS_SELECTED_FILE,
    currentProjectPath: API_DOCS_QA_PROJECT_PATH,
    isLoading: false,
    error: null,
  });
};

const seedPermissionConfigViewerState = (theme: ThemeSkin) => {
  const currentProject = seedQaJavaProjectState();
  const form = { ...PERMISSION_CONFIG_QA_FORM };

  useThemeStore.getState().setSkin(theme);
  useNavStore.getState().setActiveNavItem(PERMISSION_CONFIG_QA_NAV);
  usePermissionConfigStore.setState({
    activeProjectKey: currentProject.path,
    projectForms: {
      [currentProject.path]: { ...form },
    },
    form,
    selectedEndpointIds: [...PERMISSION_CONFIG_QA_ENDPOINT_IDS],
    generatedRows: PERMISSION_CONFIG_QA_ROWS.map((row) => ({ ...row })),
    selectedRowIds: [],
  });
};

const seedWelcomeViewerState = (theme: ThemeSkin) => {
  useThemeStore.getState().setSkin(theme);
  useNavStore.getState().setActiveNavItem(COLLECTIONS_QA_NAV);
  useAppShellStore.setState({ hideWelcome: false, hasShownWelcome: true });
  useProjectStore.setState({
    collections: {},
    activeProjectPath: null,
    project: null,
    treeData: [],
    environments: [],
    activeEnvironment: null,
    isLoading: false,
    error: null,
  });
  useHistoryStore.setState({ entries: [], isLoading: false, error: null, selectedEntryId: null });
  useRequestStore.setState({ tabs: [], activeTabId: null });
};

const seedSettingsViewerState = (theme: ThemeSkin) => {
  useThemeStore.getState().setSkin(theme);
  useNavStore.getState().setActiveNavItem(SETTINGS_QA_NAV);
  useAppShellStore.setState({ hideWelcome: true, hasShownWelcome: true });
  setQaProjectState(
    createQaCollectionEntry(
      getQaProject(CURRENT_JAVA_PROJECT_PATH),
      WELCOME_QA_TREE,
      getQaEnvironments(CURRENT_JAVA_PROJECT_PATH),
      getQaProjectEnvironmentState(CURRENT_JAVA_PROJECT_PATH).activeEnvironment,
    ),
  );
  useHistoryStore.setState({ entries: [], isLoading: false, error: null, selectedEntryId: null });
  useRequestStore.setState({ tabs: [], activeTabId: null });
};

const seedHistoryViewerState = (theme: ThemeSkin) => {
  useThemeStore.getState().setSkin(theme);
  useNavStore.getState().setActiveNavItem(HISTORY_QA_NAV);
  useAppShellStore.setState({ hideWelcome: true, hasShownWelcome: true });
  setQaProjectState(
    createQaCollectionEntry(
      getQaProject(HISTORY_QA_PROJECT_PATH),
      HISTORY_QA_TREE,
      getQaEnvironments(HISTORY_QA_PROJECT_PATH),
      getQaProjectEnvironmentState(HISTORY_QA_PROJECT_PATH).activeEnvironment,
    ),
  );
  useHistoryStore.setState({ entries: [], isLoading: false, error: null, selectedEntryId: null });
  useRequestStore.setState({ tabs: [], activeTabId: null });
};

const COLLECTIONS_QA_ENVIRONMENTS: Environment[] = [
  {
    id: 'dev',
    name: 'Development',
    variables: {
      baseUrl: 'https://dev-api.sjypost.local',
      tenant: 'demo-tenant',
      traceId: 'trace-qa-collections',
    },
  },
  {
    id: 'staging',
    name: 'Staging',
    variables: {
      baseUrl: 'https://staging-api.sjypost.local',
      tenant: 'demo-tenant',
      traceId: 'trace-qa-collections-staging',
    },
  },
  {
    id: 'prod',
    name: 'Production',
    variables: {
      baseUrl: 'https://api.sjypost.local',
      tenant: 'demo-tenant',
      traceId: 'trace-qa-collections-prod',
    },
  },
];

const COLLECTIONS_QA_PROJECT: Project = {
  path: COLLECTIONS_QA_PROJECT_PATH,
  name: 'sjy-post-demo',
  config: {
    version: '1.0.0',
    name: 'sjy-post-demo',
    active_environment: 'dev',
    settings: {
      request_timeout: 30000,
      verify_ssl: true,
      max_history_days: 30,
    },
  },
};

const COLLECTIONS_QA_TREE: TreeNode[] = [
  {
    name: 'Contract List',
    path: 'contracts/contract-list.req.json',
    node_type: 'request',
    method: 'POST',
    children: [],
  },
  {
    name: 'Contract Detail',
    path: 'contracts/contract-detail.req.json',
    node_type: 'request',
    method: 'GET',
    children: [],
  },
  {
    name: 'Delete Contract',
    path: 'contracts/contract-delete.req.json',
    node_type: 'request',
    method: 'POST',
    children: [],
  },
  {
    name: 'Contract Events',
    path: 'realtime/contract-events.ws.json',
    node_type: 'websocket',
    method: 'WS',
    children: [],
  },
];

const WELCOME_QA_PROJECT: Project = {
  path: CURRENT_JAVA_PROJECT_PATH,
  name: 'projass-service',
  config: {
    version: '1.0.0',
    name: 'projass-service',
    active_environment: 'dev',
    settings: {
      request_timeout: 30000,
      verify_ssl: true,
      max_history_days: 30,
    },
  },
};

const WELCOME_QA_TREE: TreeNode[] = [
  {
    name: 'Contract List',
    path: 'contracts/contract-list.req.json',
    node_type: 'request',
    method: 'POST',
    children: [],
  },
  {
    name: 'Contract Detail',
    path: 'contracts/contract-detail.req.json',
    node_type: 'request',
    method: 'GET',
    children: [],
  },
];

const HISTORY_QA_PROJECT: Project = {
  path: HISTORY_QA_PROJECT_PATH,
  name: 'projass-audit-center',
  config: {
    version: '1.0.0',
    name: 'projass-audit-center',
    active_environment: 'staging',
    settings: {
      request_timeout: 30000,
      verify_ssl: true,
      max_history_days: 30,
    },
  },
};

const HISTORY_QA_TREE: TreeNode[] = [
  {
    name: 'Contract Detail',
    path: 'history/contract-detail.req.json',
    node_type: 'request',
    method: 'GET',
    children: [],
  },
  {
    name: 'Audit Timeline',
    path: 'history/audit-timeline.req.json',
    node_type: 'request',
    method: 'GET',
    children: [],
  },
  {
    name: 'Contract List',
    path: 'history/contract-list.req.json',
    node_type: 'request',
    method: 'POST',
    children: [],
  },
];

const HISTORY_QA_ENTRIES: HistoryEntry[] = [
  {
    id: 'history-entry-detail',
    timestamp: '2026-03-20T09:58:00.000Z',
    method: 'GET',
    url: 'https://staging-api.sjypost.local/oa/project/contract/getById?id=HT-2026-001',
    status: 200,
    time_ms: 86,
    size_bytes: 612,
    request_name: '合同详情',
    request_headers: {
      Accept: 'application/json',
      'X-Trace-Id': 'trace-history-001',
    },
    response_headers: {
      'content-type': 'application/json;charset=UTF-8',
    },
    response_body: JSON.stringify({
      code: 200,
      data: {
        id: 'HT-2026-001',
        contractNo: 'HT2026001',
        projectName: '星河社区改造项目',
        status: 'SIGNED',
      },
    }, null, 2),
  },
  {
    id: 'history-entry-audit-error',
    timestamp: '2026-03-20T09:42:00.000Z',
    method: 'GET',
    url: 'https://staging-api.sjypost.local/oa/project/contract/auditTrail?id=HT-2026-001',
    status: 500,
    time_ms: 214,
    size_bytes: 248,
    request_name: '审批轨迹',
    request_headers: {
      Accept: 'application/json',
      'X-Trace-Id': 'trace-history-002',
    },
    response_headers: {
      'content-type': 'application/json;charset=UTF-8',
    },
    response_body: JSON.stringify({
      code: 500,
      message: '审批轨迹服务暂时不可用',
    }, null, 2),
  },
  {
    id: 'history-entry-list',
    timestamp: '2026-03-20T09:10:00.000Z',
    method: 'POST',
    url: 'https://staging-api.sjypost.local/oa/project/contract/list',
    status: 200,
    time_ms: 132,
    size_bytes: 1248,
    request_name: '合同列表',
    request_headers: {
      'Content-Type': 'application/json',
      'X-Trace-Id': 'trace-history-003',
    },
    request_body: JSON.stringify({
      pageNum: 1,
      pageSize: 20,
      contractStatus: 'SIGNED',
    }, null, 2),
    response_headers: {
      'content-type': 'application/json;charset=UTF-8',
    },
    response_body: JSON.stringify({
      code: 200,
      data: {
        total: 2,
        records: [
          { id: 'HT-2026-001', projectName: '星河社区改造项目' },
          { id: 'HT-2026-002', projectName: '滨江公共服务中心' },
        ],
      },
    }, null, 2),
  },
];

const COLLECTIONS_QA_RESPONSE: HttpResponse = {
  status: 200,
  status_text: 'OK',
  headers: {
    'content-type': 'application/json;charset=UTF-8',
    'cache-control': 'no-cache',
    'x-trace-id': 'trace-qa-collection-001',
  },
  body: JSON.stringify({
    code: 200,
    message: 'success',
    data: {
      total: 2,
      records: [
        {
          id: 'HT-2026-001',
          projectName: '星河社区改造项目',
          contractNo: 'HT2026001',
          contractAmount: 3860000,
          status: 'SIGNED',
        },
        {
          id: 'HT-2026-002',
          projectName: '滨江公共服务中心',
          contractNo: 'HT2026002',
          contractAmount: 2150000,
          status: 'APPROVING',
        },
      ],
    },
  }, null, 2),
  body_type: 'json',
  time_ms: 120,
  size_bytes: 1248,
};

const createCollectionsQaRequest = (id: string, name: string, overrides?: Partial<RequestFile>): RequestFile => {
  const request = createNewRequest(name);
  return {
    ...request,
    id,
    name,
    method: 'POST',
    url: '{{baseUrl}}/oa/project/contract/list',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant': '{{tenant}}',
      'X-Trace-Id': '{{traceId}}',
    },
    query: [
      { key: 'pageNum', value: '1', description: '', enabled: true },
      { key: 'pageSize', value: '20', description: '', enabled: true },
    ],
    body: {
      type: 'json',
      content: JSON.stringify({
        projectName: '社区',
        contractStatus: 'SIGNED',
      }, null, 2),
    },
    assertions: [
      {
        type: 'status',
        path: '',
        operator: 'eq',
        value: 200,
      },
    ],
    meta: {
      created_at: QA_TIMESTAMP,
      updated_at: QA_TIMESTAMP,
    },
    ...overrides,
  };
};

const seedCollectionsViewerState = (theme: ThemeSkin) => {
  const activeRequest = createCollectionsQaRequest(COLLECTIONS_QA_ACTIVE_TAB_ID, 'New Request');
  const secondaryRequest = createCollectionsQaRequest(COLLECTIONS_QA_SECONDARY_TAB_ID, 'Contract Detail', {
    method: 'GET',
    url: '{{baseUrl}}/oa/project/contract/getById?id=HT-2026-001',
    query: [{ key: 'id', value: 'HT-2026-001', description: '', enabled: true }],
    body: { type: 'none' },
    assertions: [],
  });

  const environmentState = getQaProjectEnvironmentState(COLLECTIONS_QA_PROJECT_PATH);
  const collectionsEntry: CollectionEntry = {
    project: getQaProject(COLLECTIONS_QA_PROJECT_PATH),
    treeData: COLLECTIONS_QA_TREE,
    environments: getQaEnvironments(COLLECTIONS_QA_PROJECT_PATH),
    activeEnvironment: environmentState.activeEnvironment,
    isCollapsed: false,
    isLoading: false,
  };

  useThemeStore.getState().setSkin(theme);
  useNavStore.getState().setActiveNavItem(COLLECTIONS_QA_NAV);
  useAppShellStore.setState({ hideWelcome: true, hasShownWelcome: true });
  useProjectStore.setState({
    collections: {
      [COLLECTIONS_QA_PROJECT_PATH]: collectionsEntry,
    },
    activeProjectPath: COLLECTIONS_QA_PROJECT_PATH,
    project: collectionsEntry.project,
    treeData: collectionsEntry.treeData,
    environments: collectionsEntry.environments,
    activeEnvironment: collectionsEntry.activeEnvironment,
    isLoading: false,
    error: null,
  });
  useRequestStore.setState({
    tabs: [
      {
        id: activeRequest.id,
        title: activeRequest.name,
        type: 'request',
        request: activeRequest,
        response: COLLECTIONS_QA_RESPONSE,
        isLoading: false,
        isDirty: false,
        filePath: 'contracts/contract-list.req.json',
        projectPath: COLLECTIONS_QA_PROJECT_PATH,
      },
      {
        id: secondaryRequest.id,
        title: secondaryRequest.name,
        type: 'request',
        request: secondaryRequest,
        response: null,
        isLoading: false,
        isDirty: false,
        filePath: 'contracts/contract-detail.req.json',
        projectPath: COLLECTIONS_QA_PROJECT_PATH,
      },
    ],
    activeTabId: COLLECTIONS_QA_ACTIVE_TAB_ID,
  });
};

const installBrowserQaMocks = () => {
  if (mocksInstalled) {
    return;
  }

  mocksInstalled = true;
  mockWindows('main');

  let projects: StoredJavaProject[] = [createSavedProject(), createCurrentProject()];
  let apiDocs: ApiDocListItem[] = [...API_DOCS_QA_LIST];
  let historyEntriesByProject: Record<string, HistoryEntry[]> = {
    [HISTORY_QA_PROJECT_PATH]: cloneHistoryEntries(),
  };

  mockIPC((cmd, payload) => {
    if (cmd.startsWith('plugin:window|')) {
      return null;
    }

    switch (cmd) {
      case 'list_global_environments':
        return {
          environments: cloneEnvironments(GLOBAL_ENVIRONMENTS_STORAGE.environments),
          activeEnvironmentId: GLOBAL_ENVIRONMENTS_STORAGE.activeEnvironmentId,
        };
      case 'save_global_environment': {
        const { environment } = payload as { environment: Environment };
        GLOBAL_ENVIRONMENTS_STORAGE = {
          ...GLOBAL_ENVIRONMENTS_STORAGE,
          environments: upsertEnvironment(GLOBAL_ENVIRONMENTS_STORAGE.environments, environment),
        };
        return null;
      }
      case 'delete_global_environment': {
        const { envId } = payload as { envId: string };
        const nextEnvironments = GLOBAL_ENVIRONMENTS_STORAGE.environments.filter((environment) => environment.id !== envId);
        GLOBAL_ENVIRONMENTS_STORAGE = {
          environments: cloneEnvironments(nextEnvironments),
          activeEnvironmentId: GLOBAL_ENVIRONMENTS_STORAGE.activeEnvironmentId === envId
            ? nextEnvironments[0]?.id ?? null
            : GLOBAL_ENVIRONMENTS_STORAGE.activeEnvironmentId,
        };
        return null;
      }
      case 'set_active_global_environment': {
        const { envId } = payload as { envId: string };
        GLOBAL_ENVIRONMENTS_STORAGE = {
          ...GLOBAL_ENVIRONMENTS_STORAGE,
          activeEnvironmentId: envId,
        };
        return null;
      }
      case 'open_project': {
        const { path } = payload as { path: string };
        return getQaProject(path);
      }
      case 'read_project_tree': {
        const { projectPath } = payload as { projectPath: string };
        return getQaTree(projectPath);
      }
      case 'list_environments': {
        const { projectPath } = payload as { projectPath: string };
        return getQaEnvironments(projectPath);
      }
      case 'save_environment': {
        const { projectPath, environment } = payload as { projectPath: string; environment: Environment };
        const currentState = getQaProjectEnvironmentState(projectPath);
        qaProjectEnvironmentsByPath = {
          ...qaProjectEnvironmentsByPath,
          [projectPath]: {
            ...currentState,
            environments: upsertEnvironment(currentState.environments, environment),
          },
        };
        return null;
      }
      case 'delete_environment': {
        const { projectPath, envId } = payload as { projectPath: string; envId: string };
        const currentState = getQaProjectEnvironmentState(projectPath);
        const nextEnvironments = currentState.environments.filter((environment) => environment.id !== envId);
        qaProjectEnvironmentsByPath = {
          ...qaProjectEnvironmentsByPath,
          [projectPath]: {
            environments: cloneEnvironments(nextEnvironments),
            activeEnvironment: currentState.activeEnvironment === envId
              ? nextEnvironments[0]?.id ?? null
              : currentState.activeEnvironment,
          },
        };
        return null;
      }
      case 'set_active_environment': {
        const { projectPath, envId } = payload as { projectPath: string; envId: string | null };
        const currentState = getQaProjectEnvironmentState(projectPath);
        qaProjectEnvironmentsByPath = {
          ...qaProjectEnvironmentsByPath,
          [projectPath]: {
            ...currentState,
            activeEnvironment: envId,
          },
        };
        return null;
      }
      case 'get_history_entries': {
        const { projectPath, limit } = (payload ?? {}) as { projectPath?: string; limit?: number };
        const projectEntries = historyEntriesByProject[projectPath ?? ''] ?? [];
        return typeof limit === 'number'
          ? cloneHistoryEntries(projectEntries.slice(0, limit))
          : cloneHistoryEntries(projectEntries);
      }
      case 'delete_history_entry': {
        const { projectPath, entryId } = payload as { projectPath: string; entryId: string };
        historyEntriesByProject = {
          ...historyEntriesByProject,
          [projectPath]: (historyEntriesByProject[projectPath] ?? []).filter((entry) => entry.id !== entryId),
        };
        return null;
      }
      case 'clear_history': {
        const { projectPath } = payload as { projectPath: string };
        historyEntriesByProject = {
          ...historyEntriesByProject,
          [projectPath]: [],
        };
        return null;
      }
      case 'plugin:updater|check':
        return UPDATER_QA_METADATA;
      case 'plugin:updater|download_and_install':
        return null;
      case 'plugin:process|restart':
        return null;
      case 'get_java_projects': {
        const storage: JavaProjectsStorage = { projects };
        return storage;
      }
      case 'save_java_project': {
        const nextProject = (payload as { project: StoredJavaProject }).project;
        projects = upsertProject(projects, nextProject);
        return null;
      }
      case 'set_java_project_open': {
        const { projectId, isOpen } = payload as { projectId: string; isOpen: boolean };
        projects = projects.map((project) =>
          project.id === projectId ? { ...project, isOpen } : project,
        );
        return null;
      }
      case 'delete_java_project': {
        const { projectId } = payload as { projectId: string };
        projects = projects.filter((project) => project.id !== projectId);
        return null;
      }
      case 'mark_java_endpoints_seen': {
        const { projectId, endpointIds } = payload as { projectId: string; endpointIds: string[] };
        projects = projects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                seenEndpointIds: [...new Set([...project.seenEndpointIds, ...endpointIds])],
              }
            : project,
        );
        return null;
      }
      case 'check_java_project_updates': {
        const { projectId } = payload as { projectId: string };
        const project = projects.find((entry) => entry.id === projectId) ?? createCurrentProject();
        const response: CheckNewEndpointsResponse = {
          parsedData: MOCK_PARSED_DATA,
          newEndpointIds: getNewEndpointIds(MOCK_PARSED_DATA, project.seenEndpointIds),
        };
        return response;
      }
      case 'parse_java_project':
        return MOCK_PARSED_DATA;
      case 'generate_api_docs': {
        const { endpointIds } = (payload as { options: GenerateApiDocsOptions }).options;
        const result: GenerateApiDocsResult = {
          generatedCount: endpointIds.length,
          filePaths: endpointIds.map((endpointId) => `${CURRENT_JAVA_PROJECT_PATH}/docs/${endpointId}.md`),
        };
        apiDocs = endpointIds.map((endpointId) => ({
          id: `${endpointId}-doc`,
          title: `Doc for ${endpointId}`,
          endpointPath: endpointId,
          httpMethod: 'GET',
          controllerName: 'OaProjectContractController',
          controllerDescription: 'Project contract endpoints',
          fileName: `${endpointId}.md`,
          generatedAt: QA_TIMESTAMP,
        }));
        return result;
      }
      case 'list_api_docs':
        return apiDocs;
      case 'read_api_doc': {
        const { fileName } = payload as { fileName: string };
        return API_DOCS_QA_CONTENT[fileName] ?? '# API Doc\n\nGenerated from browser QA mock.';
      }
      case 'delete_api_doc': {
        const { fileName } = payload as { fileName: string };
        apiDocs = apiDocs.filter((doc) => doc.fileName !== fileName);
        return null;
      }
      case 'batch_delete_api_docs': {
        const { fileNames } = payload as { fileNames: string[] };
        const fileNameSet = new Set(fileNames);
        apiDocs = apiDocs.filter((doc) => !fileNameSet.has(doc.fileName));
        return null;
      }
      case 'plugin:dialog|open': {
        const title = String((payload as { options?: { title?: string } }).options?.title ?? '');
        return getDialogSelection(title);
      }
      default:
        throw new Error(`[browser-qa] Unhandled Tauri command: ${cmd}`);
    }
  }, { shouldMockEvents: true });
};

export const bootstrapBrowserQa = () => {
  const params = new URLSearchParams(globalThis.location.search);
  const presetParam = params.get('qa');

  if (!isQaPreset(presetParam)) {
    return false;
  }

  const themeParam = params.get('theme');
  const theme: ThemeSkin = isThemeSkin(themeParam) ? themeParam : 'light';

  installBrowserQaMocks();
  resetQaProjectEnvironmentState();
  resetGlobalEnvironmentState();

  if (presetParam === 'api-docs') {
    seedApiDocsViewerState(theme);
    return true;
  }

  if (presetParam === 'permission-config') {
    seedPermissionConfigViewerState(theme);
    return true;
  }

  if (presetParam === 'collections') {
    seedCollectionsViewerState(theme);
    return true;
  }

  if (presetParam === 'welcome') {
    seedWelcomeViewerState(theme);
    return true;
  }

  if (presetParam === 'settings') {
    seedSettingsViewerState(theme);
    return true;
  }

  if (presetParam === 'history') {
    seedHistoryViewerState(theme);
    return true;
  }

  seedJavaImportViewerState(theme);
  return true;
};
