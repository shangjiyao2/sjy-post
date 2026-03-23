// Request types
export interface RequestFile {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  query: KeyValueItem[];
  body: RequestBody;
  auth: AuthConfig;
  assertions: Assertion[];
  meta: RequestMeta;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const HTTP_METHOD_COLOR_MAP: Record<HttpMethod, string> = {
  GET: 'var(--method-get)',
  POST: 'var(--method-post)',
  PUT: 'var(--method-put)',
  PATCH: 'var(--method-patch)',
  DELETE: 'var(--method-delete)',
  HEAD: 'var(--method-head)',
  OPTIONS: 'var(--method-options)',
};

export function getHttpMethodColor(method?: string, fallback = 'var(--text-tertiary)'): string {
  if (!method) {
    return fallback;
  }

  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === 'WS') {
    return 'var(--method-patch)';
  }

  return HTTP_METHOD_COLOR_MAP[normalizedMethod as HttpMethod] ?? fallback;
}

export type RequestBody =
  | { type: 'none' }
  | { type: 'json'; content: string }
  | { type: 'form'; content: KeyValueItem[] }
  | { type: 'raw'; content: { content: string; content_type: string } }
  | { type: 'binary'; content: string };

export interface KeyValueItem {
  key: string;
  value: string;
  description: string;
  enabled: boolean;
  /** Value type for form body items: 'text' (default) or 'file' */
  valueType?: 'text' | 'file';
}

export interface RequestMeta {
  created_at: string;
  updated_at: string;
}

// Response types
export interface HttpResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  body_type: ResponseBodyType;
  time_ms: number;
  size_bytes: number;
}

export type ResponseBodyType = 'json' | 'html' | 'xml' | 'text' | 'binary';

// Auth types
export type AuthConfig =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apikey'; key: string; value: string; add_to: 'header' | 'query' }
  | { type: 'oauth2' } & OAuth2Config;

export interface OAuth2Config {
  grant_type: 'authorization_code' | 'client_credentials' | 'password';
  auth_url: string;
  token_url: string;
  client_id: string;
  client_secret: string;
  scope: string;
  state: string;
}

// Assertion types
export interface Assertion {
  type: AssertionType;
  path: string;
  operator: AssertionOperator;
  value: unknown;
}

export type AssertionType = 'status' | 'responseTime' | 'jsonPath';
export type AssertionOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists';

export interface AssertResult {
  assertion: Assertion;
  passed: boolean;
  actual_value: string;
  message: string;
}

// Project types
export interface Project {
  path: string;
  name: string;
  config: ProjectConfig;
}

export interface ProjectConfig {
  version: string;
  name: string;
  active_environment: string | null;
  settings: ProjectSettings;
}

export interface ProjectSettings {
  request_timeout: number;
  verify_ssl: boolean;
  max_history_days: number;
}

export interface TreeNode {
  name: string;
  path: string;
  node_type: 'folder' | 'request' | 'websocket';
  children: TreeNode[];
  method?: string;
}

// Environment types
export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
}

export function createEnvironmentId(name: string): string {
  const baseId = name
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^a-z0-9-_]/g, '');

  return `${baseId || 'env'}-${Date.now()}`;
}

export function formatProjectPathLabel(path: string): string {
  return path.split(/[\\/]/).slice(-2).join('/') || path;
}

// Collection entry for multi-project support
export interface CollectionEntry {
  project: Project;
  treeData: TreeNode[];
  environments: Environment[];
  activeEnvironment: string | null;
  isCollapsed: boolean;
  isLoading: boolean;
}

// Helper to create a new request
export function createNewRequest(name: string = 'New Request'): RequestFile {
  return {
    id: crypto.randomUUID(),
    name,
    method: 'GET',
    url: '',
    headers: {},
    query: [],
    body: { type: 'none' },
    auth: { type: 'none' },
    assertions: [],
    meta: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

// History types
export interface HistoryEntry {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  time_ms: number;
  size_bytes: number;
  request_name?: string;
  request_headers: Record<string, string>;
  request_body?: string;
  response_headers: Record<string, string>;
  response_body?: string;
}

// WebSocket types
export interface WsConfig {
  id: string;
  name: string;
  url: string;
  headers?: Record<string, string>;
  protocols?: string[];
  auto_reconnect?: boolean;
}

export type WsStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WsMessage {
  direction: 'sent' | 'received' | 'system';
  data: string;
  timestamp: number;
}
