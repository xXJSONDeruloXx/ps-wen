import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import * as asar from '@electron/asar';

const execFileAsync = promisify(execFile);
const AUTH_LIKE_COOKIE_RE = /kp_|token|sess|auth|login|sid|npsso|refresh|webduid|jsessionid|dars/i;
const SYSTEM_INFO_CPU_RE = /ryzen|threadripper|xeon|intel\(r\)|core\(|apple m|athlon/i;
const SYSTEM_INFO_GPU_RE = /geforce|radeon|nvidia|intel\(r\).*graphics|arc|quadro/i;

export type PcBinarySummary = {
  path: string;
  present: boolean;
  sha256?: string;
  size?: number;
  pdbPaths?: string[];
  buildHints?: string[];
};

export type PcCookieNameSummary = {
  name: string;
  path: string;
  secure?: boolean;
  httpOnly?: boolean;
  hasExpires?: boolean;
  persistent?: boolean;
  sameSite?: string | number | null;
  sourceScheme?: string | number | null;
  valueLength?: number | null;
  encryptedValueLength?: number | null;
  authLike: boolean;
};

export type PcCookieDomainSummary = {
  domain: string;
  count: number;
  authLikeCount: number;
  names: PcCookieNameSummary[];
};

export type PcCookieDbSummary = {
  path: string;
  present: boolean;
  domains: PcCookieDomainSummary[];
};

export type PcStorageValueClass = 'json' | 'locale' | 'opaque-id' | 'text' | 'binary' | 'empty';

export type PcLocalStorageItemSummary = {
  key: string;
  byteLength: number;
  sha256Prefix: string;
  valueClass: PcStorageValueClass;
  jsonKeys?: string[];
  jsonNestedKeys?: Record<string, string[]>;
};

export type PcLocalStorageDbSummary = {
  path: string;
  present: boolean;
  origins: string[];
  items: PcLocalStorageItemSummary[];
};

export type PcSettingsSummary = {
  path: string;
  present: boolean;
  entries: Record<string, string>;
};

export type PcSysinfoSummary = {
  path: string;
  present: boolean;
  utf16StringCount: number;
  hasWindowsVersion: boolean;
  hasCpuModel: boolean;
  hasGpuModel: boolean;
};

export type PcBrowserProfileSummary = {
  rootDir: string;
  present: boolean;
  backends: string[];
  indexedDbOrigins: string[];
  sessionStorageFiles: string[];
  preferenceTopLevelKeys: string[];
  networkPersistentStateKeys: string[];
};

export type PcProcessSummary = {
  name: string;
  processId: number;
  parentProcessId: number;
  executablePath?: string;
  commandLine?: string;
};

export type PcTcpConnectionSummary = {
  state: string;
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  owningProcess: number;
};

export type PcRuntimeProcessSnapshot = {
  processes: PcProcessSummary[];
  tcpConnections: PcTcpConnectionSummary[];
};

export type PcSurfaceSummary = {
  generatedAt: string;
  installRoot: string;
  settingsDir: string;
  roamingProfileDir: string;
  shell: {
    packageName: string | null;
    packageVersion: string | null;
    runtimeVersion: string | null;
    mainEntry: string | null;
    dependencyNames: string[];
    userAgentSuffix: string | null;
    allowlistPatterns: string[];
    mainProcessCommandHandlers: string[];
    preloadCommands: string[];
    notifierCommands: string[];
    windowEvents: string[];
    currentAppUrl: string | null;
    currentSettingsDir: string | null;
  };
  ipc: {
    localWebSocket: {
      host: string;
      port: number;
      keepConnected: boolean;
    };
    listeningOnLocalhost1235: boolean;
    localConnectionCount: number;
  };
  updater: {
    metaUrl: string | null;
  };
  binaries: {
    launcher: PcBinarySummary;
    updater: PcBinarySummary;
    asar: PcBinarySummary;
  };
  storage: {
    currentQtWebEngine: {
      cookies: PcCookieDbSummary;
      localStorage: PcLocalStorageDbSummary;
      qasSettings: PcSettingsSummary;
      sysinfo: PcSysinfoSummary;
    };
    roamingProfile: {
      browserProfile: PcBrowserProfileSummary;
      cookies: PcCookieDbSummary;
    };
  };
  processSnapshot?: PcRuntimeProcessSnapshot;
  notes: string[];
};

export type PcAuthSummary = {
  generatedAt: string;
  currentAppUrl: string | null;
  settingsDir: string;
  roamingProfileDir: string;
  likelySignedIn: boolean;
  cookieSurfaces: Array<{
    path: string;
    present: boolean;
    authLikeDomains: Array<{
      domain: string;
      names: string[];
    }>;
  }>;
  localStorage: {
    path: string;
    present: boolean;
    keys: string[];
    classifiedKeys: Array<{
      key: string;
      valueClass: PcStorageValueClass;
      jsonKeys?: string[];
    }>;
  };
  indexedDbOrigins: string[];
  notes: string[];
};

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(target: string) {
  const data = await fs.readFile(target);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function extractAsciiStrings(buffer: Buffer, minLength = 6): string[] {
  const results: string[] = [];
  let current = '';
  for (const byte of buffer) {
    if (byte >= 32 && byte < 127) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= minLength) results.push(current);
      current = '';
    }
  }
  if (current.length >= minLength) results.push(current);
  return results;
}

function extractUtf16Strings(buffer: Buffer, minLength = 3): string[] {
  const results: string[] = [];
  let current = '';
  for (let index = 0; index < buffer.length - 1; index += 2) {
    const a = buffer[index];
    const b = buffer[index + 1];
    if (b === 0 && a >= 32 && a < 127) {
      current += String.fromCharCode(a);
    } else {
      if (current.length >= minLength) results.push(current);
      current = '';
    }
  }
  if (current.length >= minLength) results.push(current);
  return results;
}

function extractPdbPaths(strings: string[]) {
  return uniqueSorted(strings.filter((value) => /\.pdb$/i.test(value))).slice(0, 40);
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (typeof value === 'number') return Buffer.from(String(value), 'utf8');
  if (value === null || typeof value === 'undefined') return Buffer.alloc(0);
  return Buffer.from(String(value), 'utf8');
}

function isMostlyPrintable(text: string) {
  if (!text.length) return true;
  const sample = text.slice(0, 512);
  let printable = 0;
  for (const char of sample) {
    const code = char.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code < 127)) {
      printable += 1;
    }
  }
  return printable / sample.length >= 0.85;
}

function decodeLikelyText(buffer: Buffer) {
  if (!buffer.length) return '';

  let oddZeroes = 0;
  let pairs = 0;
  for (let index = 1; index < Math.min(buffer.length, 128); index += 2) {
    pairs += 1;
    if (buffer[index] === 0) oddZeroes += 1;
  }

  if (pairs > 0 && oddZeroes / pairs >= 0.45) {
    const decoded = buffer.toString('utf16le').replace(/\u0000+$/g, '');
    if (isMostlyPrintable(decoded)) return decoded;
  }

  const utf8 = buffer.toString('utf8').replace(/\u0000+$/g, '');
  if (isMostlyPrintable(utf8)) return utf8;
  return undefined;
}

function summarizeJsonShape(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { jsonKeys: undefined, jsonNestedKeys: undefined };
  }

  const objectValue = value as Record<string, unknown>;
  const jsonKeys = uniqueSorted(Object.keys(objectValue));
  const jsonNestedKeys = Object.fromEntries(
    Object.entries(objectValue)
      .filter(([, nestedValue]) => nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue))
      .slice(0, 20)
      .map(([key, nestedValue]) => [key, uniqueSorted(Object.keys(nestedValue as Record<string, unknown>)).slice(0, 40)])
  );

  return {
    jsonKeys,
    jsonNestedKeys: Object.keys(jsonNestedKeys).length > 0 ? jsonNestedKeys : undefined
  };
}

export function summarizeStorageValue(value: unknown): Omit<PcLocalStorageItemSummary, 'key'> {
  const buffer = toBuffer(value);
  const summary: Omit<PcLocalStorageItemSummary, 'key'> = {
    byteLength: buffer.length,
    sha256Prefix: crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16),
    valueClass: buffer.length === 0 ? 'empty' : 'binary'
  };

  if (!buffer.length) return summary;

  const text = decodeLikelyText(buffer);
  if (!text) return summary;

  try {
    const parsed = JSON.parse(text);
    const { jsonKeys, jsonNestedKeys } = summarizeJsonShape(parsed);
    return {
      ...summary,
      valueClass: 'json',
      jsonKeys,
      jsonNestedKeys
    };
  } catch {
    // fall through
  }

  if (/^[a-z]{2}-[A-Z]{2}$/.test(text)) {
    return { ...summary, valueClass: 'locale' };
  }

  if (/^[A-Za-z0-9._:-]{16,}$/.test(text) && !/\s/.test(text)) {
    return { ...summary, valueClass: 'opaque-id' };
  }

  return { ...summary, valueClass: 'text' };
}

export function extractAllowlistPatterns(source: string) {
  return uniqueSorted(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .map((line) => {
        const match = line.match(/^\/\^(.+)\/i,?$/);
        return match?.[1] ?? '';
      })
      .filter(Boolean)
  );
}

export function extractMainCommandHandlers(source: string) {
  return uniqueSorted(
    [...source.matchAll(/command\s*===\s*'([^']+)'|command\s*==\s*'([^']+)'/g)].flatMap((match) =>
      match.slice(1).filter((value): value is string => Boolean(value))
    )
  );
}

export function extractPreloadCommands(source: string) {
  return uniqueSorted([
    ...[...source.matchAll(/send\(\s*\{\s*command:\s*'([^']+)'/g)].map((match) => match[1]),
    ...[...source.matchAll(/send\(\s*\{\s*'command':\s*'([^']+)'/g)].map((match) => match[1]),
    ...[...source.matchAll(/sendQASCommand\(\s*'([^']+)'/g)].map((match) => match[1])
  ]);
}

export function extractWindowEvents(source: string) {
  return uniqueSorted([...source.matchAll(/emit\('window-([^']+)'/g)].map((match) => match[1]));
}

export function extractUserAgentSuffix(source: string) {
  return source.match(/setUserAgent\([^\n]+\+\s*'([^']+)'\)/)?.[1]?.trim() ?? null;
}

export function extractWebSocketDefaults(source: string) {
  const host = source.match(/host = '([^']+)'/)?.[1] ?? 'localhost';
  const port = Number(source.match(/port = (\d+)/)?.[1] ?? 1235);
  const keepConnectedMatch = source.match(/keepConnected = (true|false)/);
  const keepConnected = keepConnectedMatch ? keepConnectedMatch[1] === 'true' : true;
  return { host, port, keepConnected };
}

export function extractProcessArg(commandLine: string | undefined, key: string) {
  if (!commandLine) return null;
  const expression = new RegExp(`(?:^|\\s)--${escapeRegExp(key)}=(?:\"([^\"]+)\"|(\\S+))`);
  const match = commandLine.match(expression);
  return match?.[1] ?? match?.[2] ?? null;
}

export function parseChromiumOriginName(fileName: string) {
  const normalized = path.basename(fileName);
  const match = normalized.match(/^(https?)_(.+?)_0\.(?:indexeddb\.leveldb|localstorage)(?:-journal)?$/i);
  if (!match) return null;
  return `${match[1]}://${match[2]}`;
}

async function copyFileToTemp(target: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-wen-sqlite-'));
  const tempPath = path.join(tempDir, path.basename(target));
  await fs.copyFile(target, tempPath);
  return {
    tempDir,
    tempPath,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}

async function withReadonlyDatabase<T>(dbPath: string, callback: (database: { prepare: (sql: string) => { all: () => any[] } }) => T) {
  const { tempPath, cleanup } = await copyFileToTemp(dbPath);
  try {
    const sqlite = (await import('node:sqlite')) as typeof import('node:sqlite');
    const database = new sqlite.DatabaseSync(tempPath);
    try {
      return callback(database);
    } finally {
      database.close();
    }
  } finally {
    await cleanup();
  }
}

export async function summarizeCookieDb(dbPath: string): Promise<PcCookieDbSummary> {
  if (!(await pathExists(dbPath))) {
    return { path: dbPath, present: false, domains: [] };
  }

  return withReadonlyDatabase(dbPath, (database) => {
    const columns = database
      .prepare('pragma table_info(cookies)')
      .all()
      .map((row: Record<string, unknown>) => String(row.name));

    const columnNames = {
      secure: columns.includes('secure') ? 'secure' : columns.includes('is_secure') ? 'is_secure' : undefined,
      httpOnly: columns.includes('httponly') ? 'httponly' : columns.includes('is_httponly') ? 'is_httponly' : undefined,
      persistent: columns.includes('persistent') ? 'persistent' : columns.includes('is_persistent') ? 'is_persistent' : undefined,
      hasExpires: columns.includes('has_expires') ? 'has_expires' : undefined,
      sameSite: columns.includes('samesite') ? 'samesite' : undefined,
      sourceScheme: columns.includes('source_scheme') ? 'source_scheme' : undefined,
      value: columns.includes('value') ? 'value' : undefined,
      encryptedValue: columns.includes('encrypted_value') ? 'encrypted_value' : undefined
    };

    const selectColumns = [
      'host_key',
      'name',
      'path',
      ...(columnNames.secure ? [columnNames.secure] : []),
      ...(columnNames.httpOnly ? [columnNames.httpOnly] : []),
      ...(columnNames.hasExpires ? [columnNames.hasExpires] : []),
      ...(columnNames.persistent ? [columnNames.persistent] : []),
      ...(columnNames.sameSite ? [columnNames.sameSite] : []),
      ...(columnNames.sourceScheme ? [columnNames.sourceScheme] : []),
      ...(columnNames.value ? [`length(${columnNames.value}) as value_length`] : []),
      ...(columnNames.encryptedValue ? [`length(${columnNames.encryptedValue}) as encrypted_value_length`] : [])
    ];

    const rows = database
      .prepare(`select ${selectColumns.join(', ')} from cookies order by host_key, name`)
      .all() as Array<Record<string, unknown>>;

    const domains = new Map<string, PcCookieNameSummary[]>();
    for (const row of rows) {
      const domain = String(row.host_key ?? '');
      const names = domains.get(domain) ?? [];
      const item: PcCookieNameSummary = {
        name: String(row.name ?? ''),
        path: String(row.path ?? ''),
        secure: columnNames.secure ? Boolean(row[columnNames.secure]) : undefined,
        httpOnly: columnNames.httpOnly ? Boolean(row[columnNames.httpOnly]) : undefined,
        hasExpires: columnNames.hasExpires ? Boolean(row[columnNames.hasExpires]) : undefined,
        persistent: columnNames.persistent ? Boolean(row[columnNames.persistent]) : undefined,
        sameSite: columnNames.sameSite ? (row[columnNames.sameSite] as string | number | null) : undefined,
        sourceScheme: columnNames.sourceScheme ? (row[columnNames.sourceScheme] as string | number | null) : undefined,
        valueLength: 'value_length' in row && typeof row.value_length === 'number' ? row.value_length : null,
        encryptedValueLength:
          'encrypted_value_length' in row && typeof row.encrypted_value_length === 'number'
            ? row.encrypted_value_length
            : null,
        authLike: AUTH_LIKE_COOKIE_RE.test(String(row.name ?? ''))
      };
      names.push(item);
      domains.set(domain, names);
    }

    return {
      path: dbPath,
      present: true,
      domains: [...domains.entries()]
        .map(([domain, names]) => ({
          domain,
          count: names.length,
          authLikeCount: names.filter((item) => item.authLike).length,
          names: names.sort((left, right) => left.name.localeCompare(right.name))
        }))
        .sort((left, right) => left.domain.localeCompare(right.domain))
    };
  });
}

export async function summarizeLocalStorageDb(dbPath: string): Promise<PcLocalStorageDbSummary> {
  if (!(await pathExists(dbPath))) {
    return { path: dbPath, present: false, origins: [], items: [] };
  }

  return withReadonlyDatabase(dbPath, (database) => {
    const items = database
      .prepare('select key, value from ItemTable order by key')
      .all() as Array<Record<string, unknown>>;

    return {
      path: dbPath,
      present: true,
      origins: uniqueSorted([parseChromiumOriginName(path.basename(dbPath)) ?? '']),
      items: items.map((row) => ({
        key: String(row.key ?? ''),
        ...summarizeStorageValue(row.value)
      }))
    };
  });
}

export async function summarizeIniLikeSettings(filePath: string): Promise<PcSettingsSummary> {
  if (!(await pathExists(filePath))) {
    return { path: filePath, present: false, entries: {} };
  }

  const text = await fs.readFile(filePath, 'utf8');
  const entries = Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith(';') && !line.startsWith('#') && !line.startsWith('['))
      .map((line) => {
        const [rawKey, ...rest] = line.split('=');
        return [rawKey.trim(), rest.join('=').trim()];
      })
      .filter(([key]) => key)
  );

  return { path: filePath, present: true, entries };
}

export async function summarizeSysinfoFile(filePath: string): Promise<PcSysinfoSummary> {
  if (!(await pathExists(filePath))) {
    return {
      path: filePath,
      present: false,
      utf16StringCount: 0,
      hasWindowsVersion: false,
      hasCpuModel: false,
      hasGpuModel: false
    };
  }

  const buffer = await fs.readFile(filePath);
  const strings = extractUtf16Strings(buffer, 3);
  return {
    path: filePath,
    present: true,
    utf16StringCount: strings.length,
    hasWindowsVersion: strings.some((value) => /microsoft windows|^\d+\.\d+\.\d+/i.test(value)),
    hasCpuModel: strings.some((value) => SYSTEM_INFO_CPU_RE.test(value)),
    hasGpuModel: strings.some((value) => SYSTEM_INFO_GPU_RE.test(value))
  };
}

async function summarizeBrowserProfile(rootDir: string): Promise<PcBrowserProfileSummary> {
  if (!(await pathExists(rootDir))) {
    return {
      rootDir,
      present: false,
      backends: [],
      indexedDbOrigins: [],
      sessionStorageFiles: [],
      preferenceTopLevelKeys: [],
      networkPersistentStateKeys: []
    };
  }

  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const backends = uniqueSorted(entries.map((entry) => entry.name));

  const indexedDbDir = path.join(rootDir, 'IndexedDB');
  const indexedDbOrigins = (await pathExists(indexedDbDir))
    ? uniqueSorted(
        (await fs.readdir(indexedDbDir, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => parseChromiumOriginName(entry.name) ?? '')
      )
    : [];

  const sessionStorageDir = path.join(rootDir, 'Session Storage');
  const sessionStorageFiles = (await pathExists(sessionStorageDir))
    ? uniqueSorted(await fs.readdir(sessionStorageDir))
    : [];

  const preferenceTopLevelKeys = await readJsonTopLevelKeys(path.join(rootDir, 'Preferences'));
  const networkPersistentStateKeys = await readJsonTopLevelKeys(path.join(rootDir, 'Network Persistent State'));

  return {
    rootDir,
    present: true,
    backends,
    indexedDbOrigins,
    sessionStorageFiles,
    preferenceTopLevelKeys,
    networkPersistentStateKeys
  };
}

async function readJsonTopLevelKeys(filePath: string) {
  if (!(await pathExists(filePath))) return [];
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
    return uniqueSorted(Object.keys(parsed));
  } catch {
    return [];
  }
}

async function summarizeBinary(filePath: string): Promise<PcBinarySummary> {
  if (!(await pathExists(filePath))) {
    return { path: filePath, present: false };
  }

  const [stat, hash, buffer] = await Promise.all([fs.stat(filePath), sha256File(filePath), fs.readFile(filePath)]);
  const strings = extractAsciiStrings(buffer, 8);
  const pdbPaths = extractPdbPaths(strings);
  const buildHints = uniqueSorted(
    strings.filter((value) => /gitlab-runner|gaikai-player-build|gkp-electron|gkqtkit|node-gyp\\cache\\9\.0\.4/i.test(value))
  ).slice(0, 40);

  return {
    path: filePath,
    present: true,
    sha256: hash,
    size: stat.size,
    pdbPaths,
    buildHints
  };
}

async function summarizeRunningWindowsProcesses(): Promise<PcRuntimeProcessSnapshot | undefined> {
  try {
    const script = [
      "$processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'pspluslauncher|agl' } | Select-Object Name, ProcessId, ParentProcessId, ExecutablePath, CommandLine)",
      "$connections = @(Get-NetTCPConnection | Where-Object { ($processes.ProcessId -contains $_.OwningProcess) -or $_.LocalPort -eq 1235 -or $_.RemotePort -eq 1235 } | Select-Object @{Name='State';Expression={[string]$_.State}}, LocalAddress, LocalPort, RemoteAddress, RemotePort, OwningProcess)",
      '[PSCustomObject]@{ processes = $processes; tcpConnections = $connections } | ConvertTo-Json -Depth 5 -Compress'
    ].join('; ');

    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    });

    if (!stdout.trim()) return undefined;
    const parsed = JSON.parse(stdout) as {
      processes?: Array<Record<string, unknown>> | Record<string, unknown>;
      tcpConnections?: Array<Record<string, unknown>> | Record<string, unknown>;
    };

    const rawProcesses = Array.isArray(parsed.processes)
      ? parsed.processes
      : parsed.processes
        ? [parsed.processes]
        : [];
    const rawConnections = Array.isArray(parsed.tcpConnections)
      ? parsed.tcpConnections
      : parsed.tcpConnections
        ? [parsed.tcpConnections]
        : [];

    const processes: PcProcessSummary[] = rawProcesses.map((entry) => ({
      name: String(entry.Name ?? entry.name ?? ''),
      processId: Number(entry.ProcessId ?? entry.processId ?? 0),
      parentProcessId: Number(entry.ParentProcessId ?? entry.parentProcessId ?? 0),
      executablePath: String(entry.ExecutablePath ?? entry.executablePath ?? ''),
      commandLine: String(entry.CommandLine ?? entry.commandLine ?? '')
    }));

    const tcpConnections: PcTcpConnectionSummary[] = rawConnections.map((entry) => ({
      state: String(entry.State ?? entry.state ?? ''),
      localAddress: String(entry.LocalAddress ?? entry.localAddress ?? ''),
      localPort: Number(entry.LocalPort ?? entry.localPort ?? 0),
      remoteAddress: String(entry.RemoteAddress ?? entry.remoteAddress ?? ''),
      remotePort: Number(entry.RemotePort ?? entry.remotePort ?? 0),
      owningProcess: Number(entry.OwningProcess ?? entry.owningProcess ?? 0)
    }));

    return {
      processes,
      tcpConnections
    };
  } catch {
    return undefined;
  }
}

async function readAsarFiles(asarPath: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-wen-pc-app-'));
  asar.extractAll(asarPath, tempDir);
  try {
    const packageJsonPath = path.join(tempDir, 'package.json');
    const mainJsPath = path.join(tempDir, 'main.js');
    const preloadPath = path.join(tempDir, 'html', 'preload.js');
    const preloadNotifierPath = path.join(tempDir, 'html', 'preloadNotifier.js');
    const websocketClientPath = path.join(tempDir, 'html', 'websocket_client.js');

    const [packageJson, mainJs, preloadJs, preloadNotifierJs, websocketClientJs] = await Promise.all([
      fs.readFile(packageJsonPath, 'utf8'),
      fs.readFile(mainJsPath, 'utf8'),
      fs.readFile(preloadPath, 'utf8'),
      fs.readFile(preloadNotifierPath, 'utf8'),
      fs.readFile(websocketClientPath, 'utf8')
    ]);

    return {
      packageJson: JSON.parse(packageJson) as {
        name?: string;
        version?: string;
        main?: string;
        dependencies?: Record<string, string>;
      },
      mainJs,
      preloadJs,
      preloadNotifierJs,
      websocketClientJs
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export function defaultPlaystationPlusInstallRoot() {
  return path.join('C:', 'Program Files (x86)', 'PlayStationPlus');
}

export function defaultPlaystationPlusSettingsDir() {
  return path.join(os.homedir(), 'AppData', 'Local', 'Sony Interactive Entertainment Inc', 'PlayStationPlus');
}

export function defaultPlaystationPlusRoamingProfileDir() {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'playstation-now');
}

export async function summarizePlaystationPlusPcSurface(options?: {
  installRoot?: string;
  settingsDir?: string;
  roamingProfileDir?: string;
}): Promise<PcSurfaceSummary> {
  const installRoot = path.resolve(options?.installRoot ?? defaultPlaystationPlusInstallRoot());
  const settingsDir = path.resolve(options?.settingsDir ?? defaultPlaystationPlusSettingsDir());
  const roamingProfileDir = path.resolve(options?.roamingProfileDir ?? defaultPlaystationPlusRoamingProfileDir());

  const asarPath = path.join(installRoot, 'agl', 'resources', 'app.asar');
  const versionPath = path.join(installRoot, 'agl', 'version');
  const updaterIniPath = path.join(installRoot, 'unidater.ini');
  const launcherPath = path.join(installRoot, 'pspluslauncher.exe');
  const updaterPath = path.join(installRoot, 'unidater.exe');
  const currentCookieDbPath = path.join(settingsDir, 'QtWebEngine', 'Default', 'Coookies');
  const currentLocalStoragePath = path.join(
    settingsDir,
    'QtWebEngine',
    'Default',
    'Local Storage',
    'https_psnow.playstation.com_0.localstorage'
  );
  const qasSettingsPath = path.join(settingsDir, 'qasSettings.dat');
  const sysinfoPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Sony Interactive Entertainment Inc', 'PlayStationPlus', 'sysinfo.dat');
  const roamingCookieDbPath = path.join(roamingProfileDir, 'Cookies');

  const [
    asarFiles,
    runtimeVersion,
    launcherBinary,
    updaterBinary,
    asarBinary,
    updaterIni,
    currentCookies,
    currentLocalStorage,
    qasSettings,
    sysinfo,
    roamingProfile,
    roamingCookies,
    processSnapshot
  ] = await Promise.all([
    readAsarFiles(asarPath),
    (async () => ((await pathExists(versionPath)) ? fs.readFile(versionPath, 'utf8').then((value) => value.trim()) : null))(),
    summarizeBinary(launcherPath),
    summarizeBinary(updaterPath),
    summarizeBinary(asarPath),
    summarizeIniLikeSettings(updaterIniPath),
    summarizeCookieDb(currentCookieDbPath),
    summarizeLocalStorageDb(currentLocalStoragePath),
    summarizeIniLikeSettings(qasSettingsPath),
    summarizeSysinfoFile(sysinfoPath),
    summarizeBrowserProfile(roamingProfileDir),
    summarizeCookieDb(roamingCookieDbPath),
    summarizeRunningWindowsProcesses()
  ]);

  const currentAppUrl =
    processSnapshot?.processes
      .map((processEntry) => extractProcessArg(processEntry.commandLine, 'url'))
      .find((value): value is string => Boolean(value)) ?? null;
  const currentSettingsDir =
    processSnapshot?.processes
      .map((processEntry) => extractProcessArg(processEntry.commandLine, 'settings-dir'))
      .find((value): value is string => Boolean(value)) ?? null;

  const websocketDefaults = extractWebSocketDefaults(asarFiles.websocketClientJs);
  const listeningOnLocalhost1235 =
    processSnapshot?.tcpConnections.some(
      (connection) => connection.localAddress === '127.0.0.1' && connection.localPort === websocketDefaults.port
    ) ?? false;
  const localConnectionCount =
    processSnapshot?.tcpConnections.filter(
      (connection) => connection.localPort === websocketDefaults.port || connection.remotePort === websocketDefaults.port
    ).length ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    installRoot,
    settingsDir,
    roamingProfileDir,
    shell: {
      packageName: asarFiles.packageJson.name ?? null,
      packageVersion: asarFiles.packageJson.version ?? null,
      runtimeVersion,
      mainEntry: asarFiles.packageJson.main ?? null,
      dependencyNames: uniqueSorted(Object.keys(asarFiles.packageJson.dependencies ?? {})),
      userAgentSuffix: extractUserAgentSuffix(asarFiles.mainJs),
      allowlistPatterns: extractAllowlistPatterns(asarFiles.mainJs),
      mainProcessCommandHandlers: extractMainCommandHandlers(asarFiles.mainJs),
      preloadCommands: extractPreloadCommands(asarFiles.preloadJs),
      notifierCommands: extractPreloadCommands(asarFiles.preloadNotifierJs),
      windowEvents: uniqueSorted([
        ...extractWindowEvents(asarFiles.preloadJs),
        ...extractWindowEvents(asarFiles.preloadNotifierJs)
      ]),
      currentAppUrl,
      currentSettingsDir
    },
    ipc: {
      localWebSocket: websocketDefaults,
      listeningOnLocalhost1235,
      localConnectionCount
    },
    updater: {
      metaUrl: updaterIni.entries.URL ?? null
    },
    binaries: {
      launcher: launcherBinary,
      updater: updaterBinary,
      asar: asarBinary
    },
    storage: {
      currentQtWebEngine: {
        cookies: currentCookies,
        localStorage: currentLocalStorage,
        qasSettings,
        sysinfo
      },
      roamingProfile: {
        browserProfile: roamingProfile,
        cookies: roamingCookies
      }
    },
    processSnapshot,
    notes: [
      'Summary intentionally redacts cookie values and storage values; only names, paths, sizes, hashes, and JSON key shapes are emitted.',
      'Running-process data is optional and only appears when powershell.exe and the app are available on the local machine.',
      'The current Windows client presents as a PlayStation Plus launcher wrapping a legacy playstation-now Electron shell.'
    ]
  };
}

export async function summarizePlaystationPlusPcAuth(options?: {
  installRoot?: string;
  settingsDir?: string;
  roamingProfileDir?: string;
}): Promise<PcAuthSummary> {
  const surface = await summarizePlaystationPlusPcSurface(options);

  const cookieSurfaces = [surface.storage.currentQtWebEngine.cookies, surface.storage.roamingProfile.cookies].map((cookieDb) => ({
    path: cookieDb.path,
    present: cookieDb.present,
    authLikeDomains: cookieDb.domains
      .filter((domain) => domain.authLikeCount > 0)
      .map((domain) => ({
        domain: domain.domain,
        names: domain.names.filter((name) => name.authLike).map((name) => name.name)
      }))
  }));

  const localStorage = {
    path: surface.storage.currentQtWebEngine.localStorage.path,
    present: surface.storage.currentQtWebEngine.localStorage.present,
    keys: surface.storage.currentQtWebEngine.localStorage.items.map((item) => item.key),
    classifiedKeys: surface.storage.currentQtWebEngine.localStorage.items.map((item) => ({
      key: item.key,
      valueClass: item.valueClass,
      jsonKeys: item.jsonKeys
    }))
  };

  const likelySignedIn =
    cookieSurfaces.some((cookieDb) => cookieDb.authLikeDomains.some((domain) => domain.names.length > 0)) &&
    (localStorage.keys.includes('currentUser') || surface.storage.roamingProfile.browserProfile.indexedDbOrigins.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    currentAppUrl: surface.shell.currentAppUrl,
    settingsDir: surface.settingsDir,
    roamingProfileDir: surface.roamingProfileDir,
    likelySignedIn,
    cookieSurfaces,
    localStorage,
    indexedDbOrigins: surface.storage.roamingProfile.browserProfile.indexedDbOrigins,
    notes: [
      'Raw cookie values, bearer material, and opaque identifiers are intentionally not emitted.',
      'The summary is intended for redacted auth-surface mapping only.'
    ]
  };
}

export async function writePlaystationPlusPcSurfaceSummary(options?: {
  installRoot?: string;
  settingsDir?: string;
  roamingProfileDir?: string;
  outputPath?: string;
}) {
  const summary = await summarizePlaystationPlusPcSurface(options);
  const outputPath = path.resolve(options?.outputPath ?? 'artifacts/static/playstation-plus-pc-surface.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return { summary, outputPath };
}

export async function writePlaystationPlusPcAuthSummary(options?: {
  installRoot?: string;
  settingsDir?: string;
  roamingProfileDir?: string;
  outputPath?: string;
}) {
  const summary = await summarizePlaystationPlusPcAuth(options);
  const outputPath = path.resolve(options?.outputPath ?? 'artifacts/auth/playstation-plus-pc-auth-summary.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return { summary, outputPath };
}
