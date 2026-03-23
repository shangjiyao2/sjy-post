import { invoke } from '@tauri-apps/api/core';
import type { RequestFile, HttpResponse, Project, TreeNode, Environment, HistoryEntry, WsConfig, WsStatus, WsMessage, Assertion, AssertResult } from '../types';

// Project commands
export async function createProject(path: string, name: string): Promise<Project> {
  return invoke('create_project', { path, name });
}

export async function openProject(path: string): Promise<Project> {
  return invoke('open_project', { path });
}

export async function readProjectTree(projectPath: string): Promise<TreeNode[]> {
  return invoke('read_project_tree', { projectPath });
}

export async function createFolder(projectPath: string, parentPath: string, name: string): Promise<TreeNode> {
  return invoke('create_folder', { projectPath, parentPath, name });
}

export async function renameNode(projectPath: string, nodePath: string, newName: string): Promise<void> {
  return invoke('rename_node', { projectPath, nodePath, newName });
}

export async function deleteNode(projectPath: string, nodePath: string): Promise<void> {
  return invoke('delete_node', { projectPath, nodePath });
}

export async function saveRequest(projectPath: string, requestPath: string, request: RequestFile): Promise<void> {
  return invoke('save_request', { projectPath, requestPath, request });
}

export async function readRequest(projectPath: string, requestPath: string): Promise<RequestFile> {
  return invoke('read_request', { projectPath, requestPath });
}

// Request commands
export async function sendRequest(request: RequestFile, variables?: Record<string, string>): Promise<HttpResponse> {
  return invoke('send_request', { request, variables });
}

// Environment commands
export async function listEnvironments(projectPath: string): Promise<Environment[]> {
  return invoke('list_environments', { projectPath });
}

export async function saveEnvironment(projectPath: string, environment: Environment): Promise<void> {
  return invoke('save_environment', { projectPath, environment });
}

export async function deleteEnvironment(projectPath: string, envId: string): Promise<void> {
  return invoke('delete_environment', { projectPath, envId });
}

export async function setActiveEnvironment(projectPath: string, envId: string | null): Promise<void> {
  return invoke('set_active_environment', { projectPath, envId });
}

export async function resolveVariables(template: string, variables: Record<string, string>): Promise<string> {
  return invoke('resolve_variables', { template, variables });
}

// Global environment commands
export interface GlobalEnvironmentsStorage {
  environments: Environment[];
  activeEnvironmentId: string | null;
}

export async function listGlobalEnvironments(): Promise<GlobalEnvironmentsStorage> {
  return invoke('list_global_environments');
}

export async function saveGlobalEnvironment(environment: Environment): Promise<void> {
  return invoke('save_global_environment', { environment });
}

export async function deleteGlobalEnvironment(envId: string): Promise<void> {
  return invoke('delete_global_environment', { envId });
}

export async function setActiveGlobalEnvironment(envId: string): Promise<void> {
  return invoke('set_active_global_environment', { envId });
}

// Import types
export interface ImportPreview {
  source_type: string;
  total_requests: number;
  total_folders: number;
  environments: number;
  tree_preview: ImportNode[];
}

export interface ImportNode {
  name: string;
  node_type: string;
  children: ImportNode[];
}

export interface ImportOptions {
  source_path: string;
  target_project_path: string;
  target_folder_path?: string;
  include_environments: boolean;
}

// Import commands
export async function previewImport(filePath: string): Promise<ImportPreview> {
  return invoke('preview_import', { filePath });
}

export async function executeImport(options: ImportOptions): Promise<void> {
  return invoke('execute_import', { options });
}

export async function importRequestFile(sourcePath: string, projectPath: string, targetFolder: string): Promise<RequestFile> {
  return invoke('import_request_file', { sourcePath, projectPath, targetFolder });
}

// History commands
export async function addHistoryEntry(projectPath: string, entry: HistoryEntry): Promise<void> {
  return invoke('add_history_entry', { projectPath, entry });
}

export async function getHistoryEntries(projectPath: string, limit?: number): Promise<HistoryEntry[]> {
  return invoke('get_history_entries', { projectPath, limit });
}

export async function getHistoryEntry(projectPath: string, entryId: string): Promise<HistoryEntry> {
  return invoke('get_history_entry', { projectPath, entryId });
}

export async function deleteHistoryEntry(projectPath: string, entryId: string): Promise<void> {
  return invoke('delete_history_entry', { projectPath, entryId });
}

export async function clearHistory(projectPath: string): Promise<void> {
  return invoke('clear_history', { projectPath });
}

// WebSocket commands
export async function wsConnect(config: WsConfig): Promise<void> {
  return invoke('ws_connect', { config });
}

export async function wsDisconnect(id: string): Promise<void> {
  return invoke('ws_disconnect', { id });
}

export async function wsSend(id: string, message: string): Promise<void> {
  return invoke('ws_send', { id, message });
}

export async function wsGetStatus(id: string): Promise<WsStatus | null> {
  return invoke('ws_get_status', { id });
}

export async function wsGetMessages(id: string): Promise<WsMessage[]> {
  return invoke('ws_get_messages', { id });
}

export async function wsClearMessages(id: string): Promise<void> {
  return invoke('ws_clear_messages', { id });
}

// Assertion commands
export async function runAssertions(assertions: Assertion[], response: HttpResponse): Promise<AssertResult[]> {
  return invoke('run_assertions', { assertions, response });
}

// Java Import types
export interface JavaField {
  name: string;
  type: string;
  description: string;
  required: boolean;
  children?: JavaField[];
}

export interface JavaRequestParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

export interface JavaEndpoint {
  id: string;
  controllerName: string;
  methodName: string;
  httpMethod: string;
  path: string;
  fullPath: string;
  summary: string;
  description: string;
  requestBodyType?: string;
  requestBodyFields: JavaField[];
  requestParams: JavaRequestParam[];
  responseType?: string;
  responseBodyFields: JavaField[];
}

export interface JavaController {
  name: string;
  basePath: string;
  description: string;
  endpoints: JavaEndpoint[];
}

export interface ParsedJavaProject {
  projectPath: string;
  controllers: JavaController[];
}

export interface JavaImportOptions {
  projectPath: string;
  projectName?: string;
  endpoints: string[];
  parsedData: ParsedJavaProject;
  baseUrl: string;
  createNewProject: boolean;
}

export interface JavaImportResult {
  projectPath: string;
  importedFiles: string[];
}

// Java Import commands
export async function parseJavaProject(projectPath: string): Promise<ParsedJavaProject> {
  return invoke('parse_java_project', { projectPath });
}

export async function importJavaEndpoints(options: JavaImportOptions): Promise<JavaImportResult> {
  return invoke('import_java_endpoints', { options });
}

// Java Project Persistence types
export interface StoredJavaProject {
  id: string;
  name: string;
  path: string;
  isOpen: boolean;
  lastParsedAt: string;
  seenEndpointIds: string[];
}

export interface JavaProjectsStorage {
  projects: StoredJavaProject[];
}

export interface CheckNewEndpointsResponse {
  parsedData: ParsedJavaProject;
  newEndpointIds: string[];
}

// Java Project Persistence commands
export async function getJavaProjects(): Promise<JavaProjectsStorage> {
  return invoke('get_java_projects');
}

export async function saveJavaProject(project: StoredJavaProject): Promise<void> {
  return invoke('save_java_project', { project });
}

export async function setJavaProjectOpen(projectId: string, isOpen: boolean): Promise<void> {
  return invoke('set_java_project_open', { projectId, isOpen });
}

export async function deleteJavaProject(projectId: string): Promise<void> {
  return invoke('delete_java_project', { projectId });
}

export async function markJavaEndpointsSeen(projectId: string, endpointIds: string[]): Promise<void> {
  return invoke('mark_java_endpoints_seen', { projectId, endpointIds });
}

export async function checkJavaProjectUpdates(projectId: string): Promise<CheckNewEndpointsResponse> {
  return invoke('check_java_project_updates', { projectId });
}

// API Docs types
export interface ApiDocListItem {
  id: string;
  title: string;
  endpointPath: string;
  httpMethod: string;
  controllerName: string;
  controllerDescription: string;
  fileName: string;
  generatedAt: string;
}

export interface GenerateApiDocsOptions {
  projectPath: string;
  endpointIds: string[];
  parsedData: ParsedJavaProject;
  javaProjectPath: string;
}

export interface GenerateApiDocsResult {
  generatedCount: number;
  filePaths: string[];
}

// API Docs commands
export async function generateApiDocs(options: GenerateApiDocsOptions): Promise<GenerateApiDocsResult> {
  return invoke('generate_api_docs', { options });
}

export async function listApiDocs(projectPath: string): Promise<ApiDocListItem[]> {
  return invoke('list_api_docs', { projectPath });
}

export async function readApiDoc(projectPath: string, fileName: string): Promise<string> {
  return invoke('read_api_doc', { projectPath, fileName });
}

export async function deleteApiDoc(projectPath: string, fileName: string): Promise<void> {
  return invoke('delete_api_doc', { projectPath, fileName });
}

export async function batchDeleteApiDocs(projectPath: string, fileNames: string[]): Promise<void> {
  return invoke('batch_delete_api_docs', { projectPath, fileNames });
}
