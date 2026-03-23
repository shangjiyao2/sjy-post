export interface PermissionConfigFormState {
  initialServCode: string;
  appId: string;
  createUser: string;
  updateUser: string;
  dbName: string;
  tableName: string;
}

export interface PermissionConfigDraftRow {
  id: string;
  endpointId: string;
  controllerName: string;
  appId: string;
  servCode: string;
  servName: string;
  servUrl: string;
  requestType: string;
  servType: string;
  pServId: string;
  servFcode: string;
  servLevel: number;
  servFname: string;
  insertTime: string;
  createTime: string;
  createUser: string;
  updateTime: string;
  updateUser: string;
  delFlag: string;
  remark: string;
}
