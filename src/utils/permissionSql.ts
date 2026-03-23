import type { JavaEndpoint } from '../services/api';
import type { PermissionConfigDraftRow, PermissionConfigFormState } from '../types/permission';

function padNumber(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function parseServCode(input: string): { prefix: string; number: number; width: number } | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    prefix: match[1],
    number: Number(match[2]),
    width: match[2].length,
  };
}

export function incrementServCode(base: string, offset: number): string {
  const parsed = parseServCode(base);
  if (!parsed) {
    return offset === 0 ? base : `${base}${offset}`;
  }

  return `${parsed.prefix}${padNumber(parsed.number + offset, parsed.width)}`;
}

export function formatSqlDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1, 2);
  const day = padNumber(date.getDate(), 2);
  const hours = padNumber(date.getHours(), 2);
  const minutes = padNumber(date.getMinutes(), 2);
  const seconds = padNumber(date.getSeconds(), 2);
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

export function buildPermissionDraftRows(
  endpoints: Array<JavaEndpoint & { controllerName: string }>,
  form: PermissionConfigFormState,
): PermissionConfigDraftRow[] {
  const now = formatSqlDate();
  const updateUser = form.updateUser.trim() || form.createUser.trim();

  return endpoints.map((endpoint, index) => {
    const servCode = incrementServCode(form.initialServCode, index);
    const servName = endpoint.summary || endpoint.methodName || endpoint.fullPath;

    return {
      id: crypto.randomUUID().replace(/-/g, ''),
      endpointId: endpoint.id,
      controllerName: endpoint.controllerName,
      appId: form.appId,
      servCode,
      servName,
      servUrl: endpoint.fullPath,
      requestType: endpoint.httpMethod,
      servType: '',
      pServId: '',
      servFcode: servCode,
      servLevel: 1,
      servFname: servName,
      insertTime: now,
      createTime: now,
      createUser: form.createUser,
      updateTime: now,
      updateUser,
      delFlag: '0',
      remark: '',
    };
  });
}

export function buildPermissionSql(row: PermissionConfigDraftRow, dbName: string, tableName: string): string {
  return `INSERT INTO \`${escapeSqlString(dbName)}\`.\`${escapeSqlString(tableName)}\` (\`ID\`, \`APP_ID\`, \`SERV_CODE\`, \`SERV_NAME\`, \`SERV_URL\`, \`REQUEST_TYPE\`, \`SERV_TYPE\`, \`P_SERV_ID\`, \`SERV_FCODE\`, \`SERV_LEVEL\`, \`SERV_FNAME\`, \`INSERT_TIME\`, \`CREATE_TIME\`, \`CREATE_USER\`, \`UPDATE_TIME\`, \`UPDATE_USER\`, \`DEL_FLAG\`, \`REMARK\`) VALUES ('${escapeSqlString(row.id)}', '${escapeSqlString(row.appId)}', '${escapeSqlString(row.servCode)}', '${escapeSqlString(row.servName)}', '${escapeSqlString(row.servUrl)}', '${escapeSqlString(row.requestType)}', ${row.servType ? `'${escapeSqlString(row.servType)}'` : 'NULL'}, ${row.pServId ? `'${escapeSqlString(row.pServId)}'` : 'NULL'}, '${escapeSqlString(row.servFcode)}', ${row.servLevel}, '${escapeSqlString(row.servFname)}', '${escapeSqlString(row.insertTime)}', '${escapeSqlString(row.createTime)}', '${escapeSqlString(row.createUser)}', '${escapeSqlString(row.updateTime)}', '${escapeSqlString(row.updateUser)}', '${escapeSqlString(row.delFlag)}', '${escapeSqlString(row.remark)}');`;
}

export function buildBatchPermissionSql(rows: PermissionConfigDraftRow[], dbName: string, tableName: string): string {
  return rows.map((row) => buildPermissionSql(row, dbName, tableName)).join('\n');
}
