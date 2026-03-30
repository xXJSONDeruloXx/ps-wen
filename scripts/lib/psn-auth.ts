/**
 * PSN auth-token reading and exchange utilities.
 *
 * The PlayStation Plus PC client (Electron runtime 9.0.4) stores cookies in a
 * plain Chromium SQLite format without DPAPI encryption.  That means the NPSSO
 * and every other session cookie can be read directly from the on-disk SQLite
 * databases, which are copied to a temp file before reading so they remain safe
 * to open while the app is running.
 *
 * Once we have the NPSSO we can obtain a fresh short-lived bearer token (or auth
 * code) by driving the same OAuth authorize URL the app itself uses — with the
 * NPSSO set as a Cookie header.  No password and no re-login are required.
 *
 * Observed OAuth client IDs (extracted from live browser cache, data_1):
 *
 *   bc6b0777  code  kamaji:commerce_native kamaji:commerce_container kamaji:lists kamaji:s2s.subscriptionsPremium.get
 *   dc523cc2  token kamaji:get_internal_entitlements user:account.attributes.validate kamaji:get_privacy_settings user:account.settings.privacy.get kamaji:s2s.subscriptionsPremium.get
 *   7bdba4ee  code  kamaji:commerce_native versa:user_update_entitlements_first_play kamaji:lists
 *   95505df0  code  kamaji:commerce_native
 *   52b0e92a  code  sso:none
 *
 * Gaikai stream client IDs (from PSN_Event_GotClientId in code cache):
 *   gkClient      7bdba4ee-43dc-47e9-b3de-f72c95cb5010
 *   ps3GkClientId 95505df0-0bd8-444a-81b8-8f420c990ca6
 */

import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Known OAuth client parameters observed in the live browser cache
// ---------------------------------------------------------------------------

export type PsnOAuthClientId =
  | 'commerce'
  | 'entitlements'
  | 'firstplay'
  | 'commerce-basic'
  | 'sso';

export const PSN_OAUTH_CLIENTS: Record<
  PsnOAuthClientId,
  { clientId: string; responseType: 'code' | 'token'; scope: string }
> = {
  /** Main commerce / lists / subscription – authorization_code grant */
  commerce: {
    clientId: 'bc6b0777-abb5-40da-92ca-e133cf18e989',
    responseType: 'code',
    scope:
      'kamaji:commerce_native kamaji:commerce_container kamaji:lists kamaji:s2s.subscriptionsPremium.get',
  },
  /** Internal entitlements + account attributes – implicit grant → direct access_token */
  entitlements: {
    clientId: 'dc523cc2-b51b-4190-bff0-3397c06871b3',
    responseType: 'token',
    scope:
      'kamaji:get_internal_entitlements user:account.attributes.validate kamaji:get_privacy_settings user:account.settings.privacy.get kamaji:s2s.subscriptionsPremium.get',
  },
  /** First-play / versa entitlement update – authorization_code grant */
  firstplay: {
    clientId: '7bdba4ee-43dc-47e9-b3de-f72c95cb5010',
    responseType: 'code',
    scope: 'kamaji:commerce_native versa:user_update_entitlements_first_play kamaji:lists',
  },
  /** Basic commerce – authorization_code grant */
  'commerce-basic': {
    clientId: '95505df0-0bd8-444a-81b8-8f420c990ca6',
    responseType: 'code',
    scope: 'kamaji:commerce_native',
  },
  /** SSO-only – authorization_code grant */
  sso: {
    clientId: '52b0e92a-e131-4940-86f5-5d4447c73dd1',
    responseType: 'code',
    scope: 'sso:none',
  },
};

/** Gaikai stream client IDs observed in PSN_Event_GotClientId */
export const GAIKAI_CLIENT_IDS = {
  gkClient: '7bdba4ee-43dc-47e9-b3de-f72c95cb5010',
  ps3GkClientId: '95505df0-0bd8-444a-81b8-8f420c990ca6',
};

// ---------------------------------------------------------------------------
// Storage paths
// ---------------------------------------------------------------------------

export function defaultRoamingCookiesPath(): string {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'playstation-now', 'Cookies');
}

export function defaultQtWebEngineCookiesPath(): string {
  return path.join(
    os.homedir(),
    'AppData',
    'Local',
    'Sony Interactive Entertainment Inc',
    'PlayStationPlus',
    'QtWebEngine',
    'Default',
    'Coookies' // NB: typo is in the actual Sony path
  );
}

// ---------------------------------------------------------------------------
// Low-level SQLite cookie reader (copies to temp before opening)
// ---------------------------------------------------------------------------

export type RawCookie = {
  hostKey: string;
  name: string;
  value: string;
  path: string;
  expiresUtcStr: string;
  isSecure: number;
};

async function readCookiesFromDb(dbPath: string): Promise<RawCookie[]> {
  let tmpPath: string | null = null;
  try {
    tmpPath = path.join(os.tmpdir(), `ps-wen-cookies-${crypto.randomBytes(6).toString('hex')}.db`);
    await fs.copyFile(dbPath, tmpPath);
    const db = new DatabaseSync(tmpPath);

    // Detect which column names this particular SQLite schema uses
    const cols = db
      .prepare('pragma table_info(cookies)')
      .all()
      .map((r) => String((r as Record<string, unknown>).name ?? ''));
    const secureCol = cols.includes('is_secure') ? 'is_secure' : cols.includes('secure') ? 'secure' : null;
    const secureExpr = secureCol ? `COALESCE(${secureCol}, 0)` : '0';

    const rows = db
      .prepare(
        `select host_key, name, value, path,
         CAST(expires_utc AS TEXT) as expires_utc_str,
         ${secureExpr} as is_secure
         from cookies
         order by host_key, name`
      )
      .all() as Array<Record<string, unknown>>;
    db.close();
    return rows.map((row) => ({
      hostKey: String(row.host_key ?? ''),
      name: String(row.name ?? ''),
      value: String(row.value ?? ''),
      path: String(row.path ?? ''),
      expiresUtcStr: String(row.expires_utc_str ?? '0'),
      isSecure: Number(row.is_secure ?? 0),
    }));
  } finally {
    if (tmpPath) {
      await fs.unlink(tmpPath).catch(() => undefined);
    }
  }
}

function findCookie(cookies: RawCookie[], name: string, hostHint?: string): string | null {
  const matching = cookies.filter(
    (c) => c.name === name && (!hostHint || c.hostKey.includes(hostHint))
  );
  return matching[0]?.value ?? null;
}

// ---------------------------------------------------------------------------
// Public token-reading APIs
// ---------------------------------------------------------------------------

export type PsnNpssoCookies = {
  npsso: string;
  dars: string | null;
  kpUidz: string | null;
};

export type PsnSessionCookies = {
  jsessionId: string | null;
  webduid: string | null;
};

export type PsnLocalCookies = {
  roaming: PsnNpssoCookies;
  qtWebEngine: PsnSessionCookies;
};

export type BrowserStorageStateCookie = {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};

export async function readNpssoFromStorageState(storageStatePath: string): Promise<string> {
  const raw = await fs.readFile(storageStatePath, 'utf8');
  const json = JSON.parse(raw) as { cookies?: BrowserStorageStateCookie[] };
  const cookie = (json.cookies ?? []).find(
    (c) => c.name === 'npsso' && /sony\.com|playstation\.com/i.test(String(c.domain ?? ''))
  );
  return String(cookie?.value ?? '');
}

export async function resolveNpsso(options?: {
  explicitNpsso?: string;
  storageStatePath?: string;
  roamingCookiesPath?: string;
  qtCookiesPath?: string;
}): Promise<{ npsso: string; source: 'flag' | 'storage-state' | 'app-db' | 'none' }> {
  const explicitNpsso = options?.explicitNpsso?.trim();
  if (explicitNpsso) {
    return { npsso: explicitNpsso, source: 'flag' };
  }

  const storageStatePath = options?.storageStatePath?.trim();
  if (storageStatePath) {
    const npsso = await readNpssoFromStorageState(storageStatePath).catch(() => '');
    if (npsso) {
      return { npsso, source: 'storage-state' };
    }
  }

  const cookies = await readLocalPsnCookies({
    roamingCookiesPath: options?.roamingCookiesPath,
    qtCookiesPath: options?.qtCookiesPath,
  });
  if (cookies.roaming.npsso) {
    return { npsso: cookies.roaming.npsso, source: 'app-db' };
  }

  return { npsso: '', source: 'none' };
}

/**
 * Read all auth-relevant cookies from both on-disk SQLite databases.
 * Safe to call while the PlayStation Plus app is running.
 */
export async function readLocalPsnCookies(options?: {
  roamingCookiesPath?: string;
  qtCookiesPath?: string;
}): Promise<PsnLocalCookies> {
  const roamingPath = options?.roamingCookiesPath ?? defaultRoamingCookiesPath();
  const qtPath = options?.qtCookiesPath ?? defaultQtWebEngineCookiesPath();

  const [roamingCookies, qtCookies] = await Promise.all([
    fs
      .access(roamingPath)
      .then(() => readCookiesFromDb(roamingPath))
      .catch(() => [] as RawCookie[]),
    fs
      .access(qtPath)
      .then(() => readCookiesFromDb(qtPath))
      .catch(() => [] as RawCookie[]),
  ]);

  return {
    roaming: {
      npsso: findCookie(roamingCookies, 'npsso', 'sony.com') ?? '',
      dars: findCookie(roamingCookies, 'dars', 'sony.com'),
      kpUidz: findCookie(roamingCookies, 'KP_uIDz', 'sony.com'),
    },
    qtWebEngine: {
      jsessionId: findCookie(qtCookies, 'JSESSIONID', 'psnow.playstation.com'),
      webduid: findCookie(qtCookies, 'WEBDUID', 'psnow.playstation.com'),
    },
  };
}

// ---------------------------------------------------------------------------
// OAuth exchange helpers
// ---------------------------------------------------------------------------

const OAUTH_AUTHORIZE_BASE = 'https://ca.account.sony.com/api/v1/oauth/authorize';
const PSNOW_REDIRECT_URI =
  'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/grc-response.html';
const GAIKAI_LOCAL_REDIRECT_URI = 'gaikai://local';
const OBSERVED_DUID = '000000070040008864383a34333a61653a31343a35613a6130';

function buildAuthorizeUrl(
  clientId: string,
  responseType: 'code' | 'token',
  scope: string,
  duid = OBSERVED_DUID,
  redirectUri = PSNOW_REDIRECT_URI
): string {
  const params = new URLSearchParams({
    smcid: 'pc:psnow',
    applicationId: 'psnow',
    response_type: responseType,
    scope,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    service_entity: 'urn:service-entity:psn',
    prompt: 'none',
    renderMode: 'mobilePortrait',
    hidePageElements: 'forgotPasswordLink',
    displayFooter: 'none',
    disableLinks: 'qriocityLink',
    mid: 'PSNOW',
    layout_type: 'popup',
    service_logo: 'ps',
    tp_psn: 'true',
    noEVBlock: 'true',
    duid,
  });
  return `${OAUTH_AUTHORIZE_BASE}?${params.toString()}`;
}

function parseCodeRedirect(location: string): { code: string; correlationId: string; targetUrl: string | null } {
  try {
    const url = new URL(location);
    const directCode = url.searchParams.get('code');
    const directCid = url.searchParams.get('cid');
    if (directCode) {
      return {
        code: directCode,
        correlationId: directCid ?? '',
        targetUrl: null,
      };
    }

    const targetUrl = url.searchParams.get('targetUrl');
    if (targetUrl) {
      const nested = new URL(targetUrl);
      const nestedCode = nested.searchParams.get('code');
      const nestedCid = nested.searchParams.get('cid');
      if (nestedCode) {
        return {
          code: nestedCode,
          correlationId: nestedCid ?? '',
          targetUrl,
        };
      }
    }
  } catch {
    // fall back to regex below
  }

  const directCode = location.match(/[?&]code=([^&\s]+)/)?.[1];
  const directCid = location.match(/[?&]cid=([^&\s]+)/)?.[1];
  if (directCode) {
    return {
      code: decodeURIComponent(directCode),
      correlationId: directCid ? decodeURIComponent(directCid) : '',
      targetUrl: null,
    };
  }

  const nestedTargetRaw = location.match(/[?&]targetUrl=([^&\s]+)/)?.[1];
  if (nestedTargetRaw) {
    const nestedTarget = decodeURIComponent(nestedTargetRaw);
    const nestedCode = nestedTarget.match(/[?&]code=([^&\s]+)/)?.[1];
    const nestedCid = nestedTarget.match(/[?&]cid=([^&\s]+)/)?.[1];
    if (nestedCode) {
      return {
        code: decodeURIComponent(nestedCode),
        correlationId: nestedCid ? decodeURIComponent(nestedCid) : '',
        targetUrl: nestedTarget,
      };
    }
  }

  throw new Error(`No code in redirect location: ${location.slice(0, 300)}`);
}

export type TokenExchangeResult = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  correlationId: string;
  obtainedAt: string;
  clientId: string;
  scope: string;
};

export type CodeExchangeResult = {
  code: string;
  correlationId: string;
  obtainedAt: string;
  clientId: string;
  scope: string;
  redirectLocation?: string;
  targetUrl?: string | null;
};

export type GaikaiAuthCodeKind = 'cloud' | 'cloud-ps4' | 'ps3' | 'sso';

export const GAIKAI_AUTH_CODE_FLOWS: Record<
  GaikaiAuthCodeKind,
  { clientId: string; scope: string; redirectUri: string }
> = {
  cloud: {
    clientId: GAIKAI_CLIENT_IDS.gkClient,
    scope: 'kamaji:commerce_native versa:user_update_entitlements_first_play versa:user_get_devices',
    redirectUri: GAIKAI_LOCAL_REDIRECT_URI,
  },
  'cloud-ps4': {
    clientId: GAIKAI_CLIENT_IDS.gkClient,
    scope: 'kamaji:commerce_native versa:user_update_entitlements_first_play versa:user_get_devices kamaji:lists',
    redirectUri: GAIKAI_LOCAL_REDIRECT_URI,
  },
  ps3: {
    clientId: GAIKAI_CLIENT_IDS.ps3GkClientId,
    scope: 'kamaji:commerce_native',
    redirectUri: GAIKAI_LOCAL_REDIRECT_URI,
  },
  sso: {
    clientId: PSN_OAUTH_CLIENTS.sso.clientId,
    scope: PSN_OAUTH_CLIENTS.sso.scope,
    redirectUri: GAIKAI_LOCAL_REDIRECT_URI,
  },
};

/**
 * Exchange NPSSO for a fresh bearer access_token via the implicit (token) grant.
 * Uses the observed `entitlements` client by default which covers the broadest
 * set of Kamaji scopes for API queries.
 */
export async function exchangeNpssoForToken(
  npsso: string,
  clientName: PsnOAuthClientId = 'entitlements',
  duid = OBSERVED_DUID
): Promise<TokenExchangeResult> {
  const client = PSN_OAUTH_CLIENTS[clientName];
  if (client.responseType !== 'token') {
    throw new Error(
      `Client "${clientName}" uses response_type=code, not token. Use exchangeNpssoForCode instead.`
    );
  }

  const url = buildAuthorizeUrl(client.clientId, 'token', client.scope, duid, PSNOW_REDIRECT_URI);
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      Cookie: `npsso=${npsso}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) gkApollo',
    },
  });

  if (response.status !== 302) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Expected 302 redirect from OAuth authorize, got ${response.status}. Body: ${body.slice(0, 300)}`
    );
  }

  const location = response.headers.get('location') ?? '';
  const tokenMatch = location.match(/[#&]access_token=([^&\s]+)/);
  const cidMatch = location.match(/[#&]cid=([^&\s]+)/);
  const typeMatch = location.match(/[#&]token_type=([^&\s]+)/);
  const expiresMatch = location.match(/[#&]expires_in=([^&\s]+)/);

  if (!tokenMatch) {
    throw new Error(`No access_token in redirect location: ${location.slice(0, 300)}`);
  }

  return {
    accessToken: decodeURIComponent(tokenMatch[1]),
    tokenType: typeMatch ? decodeURIComponent(typeMatch[1]) : 'bearer',
    expiresIn: expiresMatch ? Number(expiresMatch[1]) : 1199,
    correlationId: cidMatch ? decodeURIComponent(cidMatch[1]) : '',
    obtainedAt: new Date().toISOString(),
    clientId: client.clientId,
    scope: client.scope,
  };
}

/**
 * Exchange NPSSO for a short-lived authorization code via the code grant.
 */
export async function exchangeNpssoForCode(
  npsso: string,
  clientName: PsnOAuthClientId = 'commerce',
  duid = OBSERVED_DUID
): Promise<CodeExchangeResult> {
  const client = PSN_OAUTH_CLIENTS[clientName];
  const url = buildAuthorizeUrl(client.clientId, 'code', client.scope, duid, PSNOW_REDIRECT_URI);
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      Cookie: `npsso=${npsso}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) gkApollo',
    },
  });

  if (response.status !== 302) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Expected 302 redirect from OAuth authorize, got ${response.status}. Body: ${body.slice(0, 300)}`
    );
  }

  const location = response.headers.get('location') ?? '';
  const parsed = parseCodeRedirect(location);

  return {
    code: parsed.code,
    correlationId: parsed.correlationId,
    obtainedAt: new Date().toISOString(),
    clientId: client.clientId,
    scope: client.scope,
    redirectLocation: location,
    targetUrl: parsed.targetUrl,
  };
}

export async function exchangeNpssoForGaikaiCode(
  npsso: string,
  kind: GaikaiAuthCodeKind = 'cloud',
  duid = OBSERVED_DUID
): Promise<CodeExchangeResult & { kind: GaikaiAuthCodeKind }> {
  const flow = GAIKAI_AUTH_CODE_FLOWS[kind];
  const url = buildAuthorizeUrl(flow.clientId, 'code', flow.scope, duid, flow.redirectUri);
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      Cookie: `npsso=${npsso}`,
      'User-Agent': APP_UA,
    },
  });

  if (response.status !== 302) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Expected 302 redirect from Gaikai OAuth authorize, got ${response.status}. Body: ${body.slice(0, 300)}`
    );
  }

  const location = response.headers.get('location') ?? '';
  const parsed = parseCodeRedirect(location);
  return {
    kind,
    code: parsed.code,
    correlationId: parsed.correlationId,
    obtainedAt: new Date().toISOString(),
    clientId: flow.clientId,
    scope: flow.scope,
    redirectLocation: location,
    targetUrl: parsed.targetUrl,
  };
}

// ---------------------------------------------------------------------------
// Live Kamaji API helpers
// ---------------------------------------------------------------------------

export type KamajiGeoResult = {
  region: string;
  postalCodes: string;
  timezone: string;
  queriedAt: string;
};

/** Query the geo endpoint — works with any valid bearer token (or none). */
export async function queryKamajiGeo(accessToken?: string): Promise<KamajiGeoResult> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) gkApollo',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(
    'https://psnow.playstation.com/kamaji/api/psnow/00_09_000/geo',
    { headers }
  );

  const body = (await response.json()) as {
    header?: { status_code?: string; message_key?: string };
    data?: string;
    postal_code?: string;
    timezone?: string;
  };

  if (body.header?.status_code !== '0x0000') {
    throw new Error(
      `Kamaji geo returned error: ${body.header?.message_key ?? 'unknown'} (${body.header?.status_code ?? '?'})`
    );
  }

  return {
    region: body.data ?? '',
    postalCodes: body.postal_code ?? '',
    timezone: body.timezone ?? '',
    queriedAt: new Date().toISOString(),
  };
}

export type KamajiSessionStatus =
  | 'no-session'
  | 'session-active'
  | 'session-expired'
  | 'auth-required'
  | 'unknown';

/**
 * Probe a session-gated Kamaji endpoint to classify the current session state.
 * Returns the raw status code and a normalized status string.
 */
export async function probeKamajiSessionState(
  accessToken: string,
  jsessionId?: string | null,
  webduid?: string | null
): Promise<{ status: KamajiSessionStatus; httpStatus: number; rawCode: string }> {
  const cookies: string[] = [];
  if (jsessionId) cookies.push(`JSESSIONID=${jsessionId}`);
  if (webduid) cookies.push(`WEBDUID=${webduid}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) gkApollo',
  };
  if (cookies.length > 0) {
    headers['Cookie'] = cookies.join('; ');
  }

  const response = await fetch(
    'https://psnow.playstation.com/kamaji/api/psnow/00_09_000/user',
    { headers }
  );

  const body = (await response.json().catch(() => ({}))) as {
    header?: { status_code?: string; message_key?: string };
  };

  const rawCode = body.header?.status_code ?? '';
  let sessionStatus: KamajiSessionStatus;

  if (response.status === 200 && rawCode === '0x0000') {
    sessionStatus = 'session-active';
  } else if (rawCode === '0x0005') {
    sessionStatus = jsessionId ? 'session-expired' : 'no-session';
  } else if (response.status === 401 || response.status === 403) {
    sessionStatus = 'auth-required';
  } else {
    sessionStatus = 'unknown';
  }

  return { status: sessionStatus, httpStatus: response.status, rawCode };
}

// ---------------------------------------------------------------------------
// Broker WebSocket probe helpers
// ---------------------------------------------------------------------------

export type BrokerProbeResult = {
  reachable: boolean;
  url: string;
  probedAt: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Gaikai HTTP helpers
// ---------------------------------------------------------------------------

export type GaikaiApolloIdResult = {
  apolloId: string;
  clientSessionId: string;
  method: 'GET' | 'POST';
  queriedAt: string;
};

export async function queryGaikaiApolloId(
  accessToken: string,
  options?: { method?: 'GET' | 'POST'; clientSessionId?: string | null }
): Promise<GaikaiApolloIdResult> {
  const method = options?.method ?? 'GET';
  const headers: Record<string, string> = {
    'X-Access-Token': accessToken,
    'X-NP-Env': 'np',
    Accept: 'application/json',
    'User-Agent': APP_UA,
  };
  if (options?.clientSessionId) {
    headers['X-Gaikai-ClientSessionId'] = options.clientSessionId;
  }
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch('https://cc.prod.gaikai.com/v1/apollo/id', {
    method,
    headers,
    body: method === 'POST' ? '{}' : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gaikai apollo/id failed: ${response.status}. Body: ${text.slice(0, 300)}`);
  }

  const json = JSON.parse(text) as { apolloId?: string; clientSessionId?: string };
  return {
    apolloId: String(json.apolloId ?? ''),
    clientSessionId: String(json.clientSessionId ?? ''),
    method,
    queriedAt: new Date().toISOString(),
  };
}

export type GaikaiConfigResult = {
  rawConfigBase64: string;
  decodedConfig: Record<string, unknown>;
  queriedAt: string;
};

export async function queryGaikaiConfig(
  accessToken: string,
  options?: { clientSessionId?: string | null }
): Promise<GaikaiConfigResult> {
  const headers: Record<string, string> = {
    'X-Access-Token': accessToken,
    'X-NP-Env': 'np',
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': APP_UA,
  };
  if (options?.clientSessionId) {
    headers['X-Gaikai-ClientSessionId'] = options.clientSessionId;
  }

  const response = await fetch('https://config.cc.prod.gaikai.com/v1/config', {
    method: 'POST',
    headers,
    body: '{}',
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gaikai config failed: ${response.status}. Body: ${text.slice(0, 300)}`);
  }

  const json = JSON.parse(text) as { config?: string };
  const rawConfigBase64 = String(json.config ?? '');
  const decodedText = Buffer.from(rawConfigBase64, 'base64').toString('utf8');
  const decodedConfig = JSON.parse(decodedText) as Record<string, unknown>;

  return {
    rawConfigBase64,
    decodedConfig,
    queriedAt: new Date().toISOString(),
  };
}

export type GaikaiDispatchResult = {
  ok: boolean;
  status: number;
  bodyText: string;
  bodyJson: unknown | null;
  dispatchedAt: string;
};

async function dispatchGaikaiJson(
  endpoint: 'events' | 'logs',
  accessToken: string,
  clientSessionId: string,
  payload: unknown
): Promise<GaikaiDispatchResult> {
  const response = await fetch(`https://client.cc.prod.gaikai.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'X-Gaikai-ClientSessionId': clientSessionId,
      'X-Access-Token': accessToken,
      'X-NP-Env': 'np',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': APP_UA,
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  let bodyJson: unknown | null = null;
  try {
    bodyJson = bodyText.trim() ? JSON.parse(bodyText) as unknown : null;
  } catch {
    bodyJson = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    bodyText,
    bodyJson,
    dispatchedAt: new Date().toISOString(),
  };
}

export function dispatchGaikaiEvent(
  accessToken: string,
  clientSessionId: string,
  payload: unknown
): Promise<GaikaiDispatchResult> {
  return dispatchGaikaiJson('events', accessToken, clientSessionId, payload);
}

export function dispatchGaikaiLog(
  accessToken: string,
  clientSessionId: string,
  payload: unknown
): Promise<GaikaiDispatchResult> {
  return dispatchGaikaiJson('logs', accessToken, clientSessionId, payload);
}

// ---------------------------------------------------------------------------
// Kamaji session establishment
// ---------------------------------------------------------------------------

/**
 * The Electron app uses runtime 9.0.4's Chromium, which means its Akamai
 * bot-management cookies (_abck, bm_sz) are seeded by ANY request that reaches
 * ca.account.sony.com.  The Kamaji /user/session endpoint validates those
 * cookies as a bot-protection gate before creating a new JSESSIONID.
 *
 * Confirmed flow (intercepted via Playwright 2026-03-30):
 *   1. GET ca.account.sony.com/api/v1/oauth/authorize?...&client_id=bc6b0777...
 *      → receives _abck + bm_sz Set-Cookie headers (even on 403)
 *   2. POST psnow.playstation.com/kamaji/api/pcnow/00_09_000/user/session
 *      body (form-encoded): country_code=US&language_code=en&date_of_birth=YYYY-MM-DD
 *      cookie: the _abck + bm_sz from step 1 + akacd_psnow-manifest
 *      → 200  Set-Cookie: JSESSIONID=...  WEBDUID=...
 *      → body: { data: { sessionUrl, recognizedSession:false, age, country, ... } }
 *
 * The initial session has recognizedSession=false (guest context).  Authenticated
 * endpoints (/user, /user/entitlements, /user/subscription) require the session
 * to be "recognized" — a subsequent GrandCentral SDK step we have not yet fully
 * traced.  Guest-context endpoints that work immediately: /user/stores, /geo.
 *
 * The date_of_birth must match the Sony account.  The value observed in
 * production was 1981-01-01 (age 45 at time of capture).
 */

export type KamajiSessionResult = {
  jsessionId: string;
  webduid: string;
  sessionUrl: string;
  country: string;
  language: string;
  age: number;
  accountType: number;
  recognizedSession: boolean;
  accountId: string | null;
  onlineId: string | null;
  currencies: Array<{ code: string; symbol: string }>;
  establishedAt: string;
};

const AKAMAI_SEED_URL =
  'https://ca.account.sony.com/api/v1/oauth/authorize' +
  '?smcid=pc%3Apsnow&applicationId=psnow&response_type=code' +
  '&scope=kamaji%3Acommerce_native%20kamaji%3Acommerce_container%20kamaji%3Alists%20kamaji%3As2s.subscriptionsPremium.get' +
  '&client_id=bc6b0777-abb5-40da-92ca-e133cf18e989' +
  '&redirect_uri=https%3A%2F%2Fpsnow.playstation.com%2Fapp%2F2.2.0%2F133%2F5cdcc037d%2Fgrc-response.html' +
  '&service_entity=urn%3Aservice-entity%3Apsn&prompt=none&renderMode=mobilePortrait' +
  '&hidePageElements=forgotPasswordLink&displayFooter=none&disableLinks=qriocityLink' +
  '&mid=PSNOW&layout_type=popup&service_logo=ps&tp_psn=true&noEVBlock=true' +
  `&duid=${OBSERVED_DUID}`;

const KAMAJI_SESSION_URL =
  'https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/user/session';

async function seedAkamaiCookies(npsso: string) {
  const seedResp = await fetch(AKAMAI_SEED_URL, {
    redirect: 'follow',
    headers: {
      Cookie: `npsso=${npsso}`,
      'User-Agent': APP_UA,
      Referer: 'https://psnow.playstation.com/',
      Accept: 'text/html,application/xhtml+xml,*/*',
    },
  });

  const seedCookies = (seedResp.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie?.() ?? [seedResp.headers.get('set-cookie') ?? ''].filter(Boolean);

  const bmSz = seedCookies.find((c) => c.startsWith('bm_sz='))?.split(';')[0] ?? '';
  const abck = seedCookies.find((c) => c.startsWith('_abck='))?.split(';')[0] ?? '';
  return { bmSz, abck, seedStatus: seedResp.status };
}

// Persistent CDN routing cookie observed in the Qt WebEngine store
const AKACD_COOKIE =
  'akacd_psnow-manifest=2177452799~rv=99~id=62761835be9be88fe3ee3bfadc057b1e';

const APP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)' +
  ' Chrome/87.0.4280.141 Electron/11.2.3 Safari/537.36 gkApollo';

/**
 * Establish a fresh Kamaji guest session from scratch using only the NPSSO.
 *
 * @param npsso     - Raw NPSSO cookie value from the local SQLite store
 * @param dateOfBirth - User's date of birth in YYYY-MM-DD format.  Must match
 *                    the Sony account.  The app uses the value returned by the
 *                    GrandCentral UserSessionService — observed as 1981-01-01.
 * @param countryCode  - ISO 3166-1 alpha-2 country code (default: 'US')
 * @param languageCode - BCP 47 language subtag (default: 'en')
 */
export async function establishKamajiSession(
  npsso: string,
  dateOfBirth: string,
  countryCode = 'US',
  languageCode = 'en'
): Promise<KamajiSessionResult> {
  // Step 1: seed Akamai bot-management cookies via any request to Sony auth
  const { bmSz, abck } = await seedAkamaiCookies(npsso);
  const cookieStr = [bmSz, abck, AKACD_COOKIE].filter(Boolean).join('; ');

  // Step 2: POST to /user/session with demographics
  const body = new URLSearchParams({
    country_code: countryCode,
    language_code: languageCode,
    date_of_birth: dateOfBirth,
  }).toString();

  const sessionResp = await fetch(KAMAJI_SESSION_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '*/*',
      'User-Agent': APP_UA,
      Origin: 'https://psnow.playstation.com',
      Referer: 'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/',
      Cookie: cookieStr,
    },
    body,
  });

  if (!sessionResp.ok && sessionResp.status !== 200) {
    const errBody = await sessionResp.text().catch(() => '');
    throw new Error(
      `Kamaji session POST failed: ${sessionResp.status}. Body: ${errBody.slice(0, 300)}`
    );
  }

  const sessionCookies = (
    sessionResp.headers as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie?.() ?? [sessionResp.headers.get('set-cookie') ?? ''].filter(Boolean);

  const jsessionId =
    sessionCookies.find((c) => c.startsWith('JSESSIONID='))?.split(';')[0].split('=')[1] ?? '';
  const webduid =
    sessionCookies.find((c) => c.startsWith('WEBDUID='))?.split(';')[0].split('=')[1] ?? '';

  const json = (await sessionResp.json()) as {
    header?: { status_code?: string; message_key?: string };
    data?: {
      sessionUrl?: string;
      country?: string;
      language?: string;
      age?: number;
      account_type?: number;
      recognizedSession?: boolean;
      accountId?: string | null;
      onlineId?: string | null;
      currencies?: Array<{ code?: string; symbol?: string }>;
    };
  };

  if (json.header?.status_code !== '0x0000') {
    throw new Error(
      `Kamaji session init error: ${json.header?.message_key ?? 'unknown'} (${json.header?.status_code ?? '?'})`
    );
  }

  if (!jsessionId) {
    throw new Error('Kamaji session POST succeeded but no JSESSIONID was returned.');
  }

  const data = json.data ?? {};
  return {
    jsessionId,
    webduid,
    sessionUrl: data.sessionUrl ?? 'https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/',
    country: data.country ?? countryCode,
    language: data.language ?? languageCode,
    age: data.age ?? 0,
    accountType: data.account_type ?? 0,
    recognizedSession: data.recognizedSession ?? false,
    accountId: data.accountId ?? null,
    onlineId: data.onlineId ?? null,
    currencies: (data.currencies ?? []).map((c) => ({ code: c.code ?? '', symbol: c.symbol ?? '' })),
    establishedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Guest-session Kamaji queries (work with recognizedSession=false)
// ---------------------------------------------------------------------------

export type KamajiStoresResult = {
  baseUrl: string;
  searchUrl: string;
  rootUrl: string;
  tumblerUrl: string;
  externalSigninUrl: string;
  psPlusUrl: string;
  eventsEnv: string;
  recUrl: string;
  psPlusWelcomeMatUrl: string;
  psPlusDealsUrl: string;
  queriedAt: string;
};

/**
 * Fetch store URLs — works with any JSESSIONID, even a guest session.
 * Returns the full store/search/PS-Plus URL map.
 */
export async function queryKamajiUserStores(
  accessToken: string,
  jsessionId: string,
  webduid: string
): Promise<KamajiStoresResult> {
  const cookieStr = `JSESSIONID=${jsessionId}; WEBDUID=${webduid}`;
  const response = await fetch(
    'https://psnow.playstation.com/kamaji/api/psnow/00_09_000/user/stores',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': APP_UA,
        Origin: 'https://psnow.playstation.com',
        Cookie: cookieStr,
      },
    }
  );

  const json = (await response.json()) as {
    header?: { status_code?: string; message_key?: string };
    data?: {
      base_url?: string;
      search_url?: string;
      root_url?: string;
      tumbler_url?: string;
      external_signin_url?: string;
      psplus_url?: string;
      events_env?: string;
      rec_url?: string;
      psPlusWelcomeMatUrl?: string;
      psPlusDealsUrl?: string;
    };
  };

  if (json.header?.status_code !== '0x0000') {
    throw new Error(
      `Kamaji user/stores error: ${json.header?.message_key ?? 'unknown'} (${json.header?.status_code ?? '?'})`
    );
  }

  const d = json.data ?? {};
  return {
    baseUrl: d.base_url ?? '',
    searchUrl: d.search_url ?? '',
    rootUrl: d.root_url ?? '',
    tumblerUrl: d.tumbler_url ?? '',
    externalSigninUrl: d.external_signin_url ?? '',
    psPlusUrl: d.psplus_url ?? '',
    eventsEnv: d.events_env ?? '',
    recUrl: d.rec_url ?? '',
    psPlusWelcomeMatUrl: d.psPlusWelcomeMatUrl ?? '',
    psPlusDealsUrl: d.psPlusDealsUrl ?? '',
    queriedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Access-token session establishment (authenticated session path)
// ---------------------------------------------------------------------------

/**
 * Directly replicates GrandCentral.UserSessionService.createAccessTokenSession():
 *
 *   POST /kamaji/api/pcnow/00_09_000/user/session
 *   Content-Type: application/x-www-form-urlencoded
 *   body: token=<urlencoded_access_token>
 *
 * This returns a session with non-null accountId/onlineId/signInId and unlocks
 * `/user/profile` and `/user/entitlements` immediately.
 */
export async function establishKamajiAccessTokenSession(
  npsso: string,
  accessToken: string
): Promise<KamajiSessionResult> {
  const { bmSz, abck } = await seedAkamaiCookies(npsso);
  const cookieStr = [bmSz, abck, AKACD_COOKIE].filter(Boolean).join('; ');
  const body = `token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(KAMAJI_SESSION_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': APP_UA,
      Origin: 'https://psnow.playstation.com',
      Referer: 'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/',
      Cookie: cookieStr,
    },
    body,
  });

  const sessionCookies = (
    response.headers as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''].filter(Boolean);

  const jsessionId =
    sessionCookies.find((c) => c.startsWith('JSESSIONID='))?.split(';')[0].split('=')[1] ?? '';
  const webduid =
    sessionCookies.find((c) => c.startsWith('WEBDUID='))?.split(';')[0].split('=')[1] ?? '';

  const json = (await response.json()) as {
    header?: { status_code?: string; message_key?: string };
    data?: {
      sessionUrl?: string;
      country?: string;
      language?: string;
      age?: number;
      account_type?: number;
      recognizedSession?: boolean;
      accountId?: string | null;
      onlineId?: string | null;
      signInId?: string | null;
      currencies?: Array<{ code?: string; symbol?: string }>;
    };
  };

  if (json.header?.status_code !== '0x0000') {
    throw new Error(
      `Kamaji access-token session error: ${json.header?.message_key ?? 'unknown'} (${json.header?.status_code ?? '?'})`
    );
  }

  const data = json.data ?? {};
  return {
    jsessionId,
    webduid,
    sessionUrl: data.sessionUrl ?? 'https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/',
    country: data.country ?? 'US',
    language: data.language ?? 'en',
    age: data.age ?? 0,
    accountType: data.account_type ?? 0,
    recognizedSession: data.recognizedSession ?? false,
    accountId: data.accountId ?? null,
    onlineId: data.onlineId ?? null,
    currencies: (data.currencies ?? []).map((c) => ({ code: c.code ?? '', symbol: c.symbol ?? '' })),
    establishedAt: new Date().toISOString(),
  };
}

export type KamajiProfileResult = {
  onlineId: string;
  onlineName: string;
  aboutMe: string;
  avatarUrl: string;
  mediumAvatarUrl: string;
  smallAvatarUrl: string;
  queriedAt: string;
};

export async function queryKamajiUserProfile(
  accessToken: string,
  jsessionId: string,
  webduid: string
): Promise<KamajiProfileResult> {
  const response = await fetch('https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/user/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': APP_UA,
      Cookie: `JSESSIONID=${jsessionId}; WEBDUID=${webduid}`,
    },
  });
  const json = await response.json() as { header?: { status_code?: string; message_key?: string }; data?: Record<string, unknown> };
  if (json.header?.status_code !== '0x0000') {
    throw new Error(`Kamaji user/profile error: ${json.header?.message_key ?? 'unknown'} (${json.header?.status_code ?? '?'})`);
  }
  const d = json.data ?? {};
  return {
    onlineId: String(d.onlineid ?? ''),
    onlineName: String(d.onlinename ?? ''),
    aboutMe: String(d.aboutme ?? ''),
    avatarUrl: String(d.avatarurl ?? ''),
    mediumAvatarUrl: String(d.medium_avatarurl ?? ''),
    smallAvatarUrl: String(d.small_avatarurl ?? ''),
    queriedAt: new Date().toISOString(),
  };
}

export type KamajiEntitlementsResult = {
  totalResults: number;
  revisionId: number;
  entitlements: Array<{
    id: string;
    skuId: string;
    activeDate: string;
    inactiveDate: string;
  }>;
  queriedAt: string;
};

export async function queryKamajiUserEntitlements(
  accessToken: string,
  jsessionId: string,
  webduid: string
): Promise<KamajiEntitlementsResult> {
  const response = await fetch('https://psnow.playstation.com/kamaji/api/psnow/00_09_000/user/entitlements', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': APP_UA,
      Cookie: `JSESSIONID=${jsessionId}; WEBDUID=${webduid}`,
    },
  });
  const json = await response.json() as { header?: { status_code?: string; message_key?: string }; data?: Record<string, unknown> };
  if (json.header?.status_code !== '0x0000') {
    throw new Error(`Kamaji user/entitlements error: ${json.header?.message_key ?? 'unknown'} (${json.header?.status_code ?? '?'})`);
  }
  const data = (json.data ?? {}) as Record<string, unknown>;
  const ents = Array.isArray(data.entitlements) ? data.entitlements as Array<Record<string, unknown>> : [];
  return {
    totalResults: Number(data.totalResults ?? 0),
    revisionId: Number(data.revisionId ?? 0),
    entitlements: ents.map((e) => ({
      id: String(e.id ?? ''),
      skuId: String(e.sku_id ?? ''),
      activeDate: String(e.active_date ?? ''),
      inactiveDate: String(e.inactive_date ?? ''),
    })),
    queriedAt: new Date().toISOString(),
  };
}

/**
 * Check whether the localhost broker WebSocket is reachable.
 * Uses a raw TCP HTTP-upgrade probe so valid `101 Switching Protocols`
 * responses are treated as success instead of surfacing as fetch-level errors.
 */
export async function probeBrokerReachability(
  host = 'localhost',
  port = 1235
): Promise<BrokerProbeResult> {
  const wsUrl = `ws://${host}:${port}/`;
  try {
    const statusCode = await new Promise<number>((resolve, reject) => {
      const socket = net.connect({ host, port });
      let settled = false;
      let responseBuffer = '';

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        socket.destroy();
        fn();
      };

      socket.setTimeout(3000, () => {
        finish(() => reject(new Error('timed out')));
      });

      socket.once('error', (error) => {
        finish(() => reject(error));
      });

      socket.once('connect', () => {
        const request = [
          'GET / HTTP/1.1',
          `Host: ${host}:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${Buffer.from(crypto.randomBytes(16)).toString('base64')}`,
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n');
        socket.write(request);
      });

      socket.on('data', (chunk) => {
        responseBuffer += Buffer.from(chunk).toString('utf8');
        const lineEnd = responseBuffer.indexOf('\r\n');
        if (lineEnd === -1) return;
        const statusLine = responseBuffer.slice(0, lineEnd);
        const match = statusLine.match(/^HTTP\/1\.[01]\s+(\d{3})\b/);
        if (!match) {
          finish(() => reject(new Error(`Unexpected HTTP response: ${statusLine}`)));
          return;
        }
        finish(() => resolve(Number(match[1])));
      });
    });

    return {
      reachable: statusCode === 101 || statusCode === 400,
      url: wsUrl,
      probedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      reachable: false,
      url: wsUrl,
      probedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
