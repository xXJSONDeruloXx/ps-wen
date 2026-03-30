/**
 * psn-direct-cli.ts
 *
 * CLI for directly querying PSN/Kamaji APIs using the locally-stored NPSSO
 * cookie, without requiring the PlayStation Plus app to be running.
 *
 * Addresses the "blocked / missing for a true Sony-app replacement" section of
 * the roadmap by providing live evidence collection for:
 *   - Auth/session ownership  (token exchange, session probe)
 *   - Entitlements surface    (Kamaji session gating documented)
 *   - Broker adapter seam     (localhost:1235 reachability probe)
 *   - Geo / region data       (confirmed working with bearer token only)
 *
 * Usage:
 *   npm run api:psn-direct -- token [--client entitlements|commerce|...] [--json]
 *   npm run api:psn-direct -- geo [--json]
 *   npm run api:psn-direct -- session-probe [--json]
 *   npm run api:psn-direct -- broker [--host localhost] [--port 1235] [--json]
 *   npm run api:psn-direct -- broker send <command> [payload-json] [--target QAS] [--wait-ms 1500] [--json]
 *   npm run api:psn-direct -- broker send --raw '{"command":"requestClientId"}' [--json]
 *   npm run api:psn-direct -- status [--json]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  readLocalPsnCookies,
  resolveNpsso,
  exchangeNpssoForToken,
  exchangeNpssoForCode,
  queryKamajiGeo,
  probeBrokerReachability,
  establishKamajiSession,
  establishKamajiAccessTokenSession,
  queryKamajiUserStores,
  queryKamajiUserProfile,
  queryKamajiUserEntitlements,
  PSN_OAUTH_CLIENTS,
  type PsnOAuthClientId,
} from '../lib/psn-auth.js';
import { loadEnv, resolveArtifactPath } from '../lib/env.js';

const env = loadEnv();
const DEFAULT_TOKEN_OUT = 'artifacts/auth/psn-token-exchange.json';

type ParsedArgs = {
  command?: string;
  positional: string[];
  flags: Record<string, string | true>;
};

type NpssoResolution = {
  npsso: string;
  source: 'flag' | 'storage-state' | 'app-db' | 'none';
};

function usage(): never {
  throw new Error(
    [
      'Usage:',
      '  npm run api:psn-direct -- token [--client entitlements|commerce|firstplay|commerce-basic|sso] [--out <path>] [--json]',
      '  npm run api:psn-direct -- geo [--json]',
      '  npm run api:psn-direct -- session [--mode token|guest] [--dob YYYY-MM-DD] [--country US] [--lang en] [--json]',
      '  npm run api:psn-direct -- stores [--mode token|guest] [--dob YYYY-MM-DD] [--json]',
      '  npm run api:psn-direct -- profile [--json]',
      '  npm run api:psn-direct -- entitlements [--limit 20] [--json]',
      '  npm run api:psn-direct -- manifest [--json]',
      '  npm run api:psn-direct -- catalog [--cat STORE-MSF192018-APOLLOROOT] [--size 20] [--dob YYYY-MM-DD] [--json]',
      '  npm run api:psn-direct -- session-probe [--json]',
      '  npm run api:psn-direct -- broker [--host localhost] [--port 1235] [--json]',
      '  npm run api:psn-direct -- broker send <command> [payload-json] [--target QAS] [--wait-ms 1500] [--json]',
      '  npm run api:psn-direct -- broker send --payload <json> <command>',
      '  npm run api:psn-direct -- broker send --raw <text>',
      '  npm run api:psn-direct -- status [--json]',
      '',
      'Global NPSSO sources (checked in this order):',
      '  --npsso <value>',
      '  --storage-state <playwright-storage-state.json>',
      '  local Sony app cookie DB (legacy fallback)',
      '',
      'Client names map to observed OAuth client IDs and scopes:',
      ...Object.entries(PSN_OAUTH_CLIENTS).map(
        ([name, cfg]) => `  ${name.padEnd(18)} ${cfg.clientId}  (${cfg.responseType})  ${cfg.scope.split(' ').slice(0, 2).join(' ')}...`
      ),
    ].join('\n')
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('--')) { positional.push(token); continue; }
    const [rawKey, inlineVal] = token.slice(2).split('=', 2);
    if (inlineVal !== undefined) { flags[rawKey] = inlineVal; continue; }
    const next = rest[i + 1];
    if (!next || next.startsWith('--')) { flags[rawKey] = true; continue; }
    flags[rawKey] = next; i++;
  }
  return { command, positional, flags };
}

function asJson(parsed: ParsedArgs) { return Boolean(parsed.flags.json); }

function safeJsonParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function parseJsonFlag(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON for ${label}: ${detail}`);
  }
}

async function writeArtifact(data: unknown, outputPath: string) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function resolvedStorageStatePath(parsed: ParsedArgs): string | undefined {
  const flagPath = typeof parsed.flags['storage-state'] === 'string' ? parsed.flags['storage-state'] : undefined;
  const envPath = env.PSN_STORAGE_STATE;
  const rawPath = flagPath ?? envPath;
  return rawPath ? resolveArtifactPath(rawPath, rawPath) : undefined;
}

async function getNpsso(parsed: ParsedArgs): Promise<NpssoResolution> {
  return resolveNpsso({
    explicitNpsso:
      typeof parsed.flags.npsso === 'string' ? parsed.flags.npsso : env.PSN_NPSSO,
    storageStatePath: resolvedStorageStatePath(parsed),
  });
}

function missingNpssoMessage(parsed: ParsedArgs): string {
  const storageStatePath = resolvedStorageStatePath(parsed);
  return [
    'No NPSSO found.',
    storageStatePath
      ? `Checked Playwright storage-state: ${storageStatePath}`
      : 'No Playwright storage-state path was provided.',
    'Acquire NPSSO app-free via the official browser login flow:',
    '  1. npm run auth:psn-headed',
    '  2. complete Sony sign-in in the opened browser',
    '  3. npm run auth:extract-npsso',
    'Then re-run this command with --storage-state artifacts/auth/playstation-storage-state.json',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// token  — exchange NPSSO for a fresh bearer token
// ---------------------------------------------------------------------------
async function cmdToken(parsed: ParsedArgs) {
  const clientName = (parsed.flags.client as PsnOAuthClientId | undefined) ?? 'entitlements';
  if (!(clientName in PSN_OAUTH_CLIENTS)) {
    throw new Error(`Unknown client name: "${clientName}". Valid: ${Object.keys(PSN_OAUTH_CLIENTS).join(', ')}`);
  }

  const { npsso, source } = await getNpsso(parsed);
  if (!npsso) {
    throw new Error(missingNpssoMessage(parsed));
  }

  const client = PSN_OAUTH_CLIENTS[clientName];

  if (client.responseType === 'token') {
    const exchange = await exchangeNpssoForToken(npsso, clientName);
    const result = {
      generatedAt: exchange.obtainedAt,
      kind: 'access_token' as const,
      clientName,
      clientId: exchange.clientId,
      accessToken: exchange.accessToken,
      tokenType: exchange.tokenType,
      expiresIn: exchange.expiresIn,
      expiresAt: new Date(Date.now() + exchange.expiresIn * 1000).toISOString(),
      scope: exchange.scope,
      correlationId: exchange.correlationId,
      npssoSource: source,
    };

    if (parsed.flags.out || !asJson(parsed)) {
      const outputPath = resolveArtifactPath(
        typeof parsed.flags.out === 'string' ? parsed.flags.out : undefined,
        DEFAULT_TOKEN_OUT
      );
      await writeArtifact(result, outputPath);
      if (!asJson(parsed)) console.log(`[psn-direct] Wrote: ${outputPath}`);
    }

    if (asJson(parsed)) { console.log(JSON.stringify(result, null, 2)); return; }

    console.log(`Client       : ${clientName} (${result.clientId})`);
    console.log(`Token type   : ${result.tokenType}`);
    console.log(`Expires in   : ${result.expiresIn}s`);
    console.log(`Scope        : ${result.scope}`);
    console.log(`Access token : ${result.accessToken.slice(0, 8)}...`);
    console.log(`NPSSO source : ${result.npssoSource}`);

  } else {
    const exchange = await exchangeNpssoForCode(npsso, clientName);
    const result = {
      generatedAt: exchange.obtainedAt,
      kind: 'authorization_code' as const,
      clientName,
      clientId: exchange.clientId,
      code: exchange.code,
      scope: exchange.scope,
      correlationId: exchange.correlationId,
      npssoSource: source,
      note: 'Authorization codes are single-use and expire in seconds. Exchange immediately.',
    };

    if (parsed.flags.out || !asJson(parsed)) {
      const outputPath = resolveArtifactPath(
        typeof parsed.flags.out === 'string' ? parsed.flags.out : undefined,
        DEFAULT_TOKEN_OUT
      );
      await writeArtifact(result, outputPath);
      if (!asJson(parsed)) console.log(`[psn-direct] Wrote: ${outputPath}`);
    }

    if (asJson(parsed)) { console.log(JSON.stringify(result, null, 2)); return; }

    console.log(`Client       : ${clientName} (${result.clientId})`);
    console.log(`Code         : ${result.code}`);
    console.log(`Scope        : ${result.scope}`);
    console.log(`NPSSO source : ${result.npssoSource}`);
    console.log('(Single-use auth code — use it immediately for session init)');
  }
}

// ---------------------------------------------------------------------------
// geo  — query Kamaji geo endpoint (works with bearer token only)
// ---------------------------------------------------------------------------
async function cmdGeo(parsed: ParsedArgs) {
  const { npsso } = await getNpsso(parsed);
  let token: string | undefined;

  if (npsso) {
    try {
      const exchange = await exchangeNpssoForToken(npsso, 'entitlements');
      token = exchange.accessToken;
    } catch {
      // geo works without a token too, fall through
    }
  }

  const geo = await queryKamajiGeo(token);

  if (asJson(parsed)) {
    console.log(JSON.stringify(geo, null, 2));
    return;
  }

  console.log(`Region       : ${geo.region}`);
  console.log(`Timezone     : ${geo.timezone}`);
  console.log(`Postal codes : ${geo.postalCodes.slice(0, 60)}...`);
  console.log(`Queried at   : ${geo.queriedAt}`);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// session  — establish a fresh Kamaji JSESSIONID from scratch
// ---------------------------------------------------------------------------
const DEFAULT_SESSION_OUT = 'artifacts/auth/psn-kamaji-session.json';

async function cmdSession(parsed: ParsedArgs) {
  const { npsso, source } = await getNpsso(parsed);
  if (!npsso) {
    throw new Error(missingNpssoMessage(parsed));
  }

  const mode    = typeof parsed.flags.mode === 'string' ? parsed.flags.mode : 'token';
  const dob     = typeof parsed.flags.dob     === 'string' ? parsed.flags.dob     : '1981-01-01';
  const country = typeof parsed.flags.country === 'string' ? parsed.flags.country : 'US';
  const lang    = typeof parsed.flags.lang    === 'string' ? parsed.flags.lang    : 'en';

  const tokenResult = await exchangeNpssoForToken(npsso, 'entitlements');
  const session = mode === 'guest'
    ? await establishKamajiSession(npsso, dob, country, lang)
    : await establishKamajiAccessTokenSession(npsso, tokenResult.accessToken);

  const result = {
    generatedAt: session.establishedAt,
    mode,
    npssoSource: source,
    jsessionId: session.jsessionId,
    webduid: session.webduid,
    sessionUrl: session.sessionUrl,
    country: session.country,
    language: session.language,
    age: session.age,
    accountType: session.accountType,
    recognizedSession: session.recognizedSession,
    accountId: session.accountId,
    onlineId: session.onlineId,
    currencies: session.currencies,
    notes: mode === 'token'
      ? [
          'Access-token session established via GrandCentral createAccessTokenSession() equivalent.',
          '/user/profile and /user/entitlements are now accessible.',
          '`recognizedSession` may remain false even though accountId/onlineId are populated.',
        ]
      : [
          'Guest session established via demographic POST to /user/session.',
          '/user/stores and /geo are accessible.',
          '/user/profile and /user/entitlements require token mode.',
        ],
  };

  const outputPath = resolveArtifactPath(
    typeof parsed.flags.out === 'string' ? parsed.flags.out : undefined,
    DEFAULT_SESSION_OUT
  );
  await writeArtifact(result, outputPath);

  if (asJson(parsed)) { console.log(JSON.stringify(result, null, 2)); return; }

  console.log(`[psn-direct] Wrote: ${outputPath}`);
  console.log(`Mode              : ${mode}`);
  console.log(`NPSSO source      : ${source}`);
  console.log(`JSESSIONID        : ${session.jsessionId.slice(0, 16)}...`);
  console.log(`WEBDUID           : ${session.webduid.slice(0, 20)}...`);
  console.log(`Session URL       : ${session.sessionUrl}`);
  console.log(`Country           : ${session.country}`);
  console.log(`Age               : ${session.age}`);
  console.log(`Recognized        : ${session.recognizedSession}`);
  console.log(`Account ID        : ${session.accountId ?? '(null — guest session)'}`);
  console.log(`Online ID         : ${session.onlineId ?? '(null)'}`);
  for (const note of result.notes) console.log(`Note              : ${note}`);
}

// ---------------------------------------------------------------------------
// stores  — fetch store/catalog URL map (works with guest session)
// ---------------------------------------------------------------------------
async function cmdStores(parsed: ParsedArgs) {
  const { npsso } = await getNpsso(parsed);
  if (!npsso) {
    throw new Error(missingNpssoMessage(parsed));
  }

  const mode    = typeof parsed.flags.mode === 'string' ? parsed.flags.mode : 'token';
  const dob     = typeof parsed.flags.dob     === 'string' ? parsed.flags.dob     : '1981-01-01';
  const country = typeof parsed.flags.country === 'string' ? parsed.flags.country : 'US';
  const lang    = typeof parsed.flags.lang    === 'string' ? parsed.flags.lang    : 'en';

  const tokenResult = await exchangeNpssoForToken(npsso, 'entitlements');
  const session = mode === 'guest'
    ? await establishKamajiSession(npsso, dob, country, lang)
    : await establishKamajiAccessTokenSession(npsso, tokenResult.accessToken);

  const stores = await queryKamajiUserStores(
    tokenResult.accessToken,
    session.jsessionId,
    session.webduid
  );

  if (asJson(parsed)) { console.log(JSON.stringify(stores, null, 2)); return; }

  console.log(`Base URL          : ${stores.baseUrl}`);
  console.log(`Search URL        : ${stores.searchUrl}`);
  console.log(`Root URL          : ${stores.rootUrl}`);
  console.log(`PS Plus URL       : ${stores.psPlusUrl}`);
  console.log(`PS Plus Deals     : ${stores.psPlusDealsUrl}`);
  console.log(`Recommendations   : ${stores.recUrl}`);
  console.log(`Events Env        : ${stores.eventsEnv}`);
  console.log(`Queried at        : ${stores.queriedAt}`);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// profile  — fetch recognized account profile via access-token session
// ---------------------------------------------------------------------------
async function cmdProfile(parsed: ParsedArgs) {
  const { npsso } = await getNpsso(parsed);
  if (!npsso) throw new Error(missingNpssoMessage(parsed));
  const token = await exchangeNpssoForToken(npsso, 'entitlements');
  const session = await establishKamajiAccessTokenSession(npsso, token.accessToken);
  const profile = await queryKamajiUserProfile(token.accessToken, session.jsessionId, session.webduid);
  if (asJson(parsed)) { console.log(JSON.stringify(profile, null, 2)); return; }
  console.log(`Online ID         : ${profile.onlineId}`);
  console.log(`Display Name      : ${profile.onlineName}`);
  console.log(`Avatar            : ${profile.avatarUrl}`);
  console.log(`Queried at        : ${profile.queriedAt}`);
}

// ---------------------------------------------------------------------------
// entitlements  — fetch live entitlement inventory via access-token session
// ---------------------------------------------------------------------------
async function cmdEntitlements(parsed: ParsedArgs) {
  const { npsso } = await getNpsso(parsed);
  if (!npsso) throw new Error(missingNpssoMessage(parsed));
  const limit = typeof parsed.flags.limit === 'string' ? parseInt(parsed.flags.limit, 10) : 20;
  const token = await exchangeNpssoForToken(npsso, 'entitlements');
  const session = await establishKamajiAccessTokenSession(npsso, token.accessToken);
  const data = await queryKamajiUserEntitlements(token.accessToken, session.jsessionId, session.webduid);
  if (asJson(parsed)) { console.log(JSON.stringify(data, null, 2)); return; }
  console.log(`Total entitlements: ${data.totalResults}`);
  console.log(`Revision ID       : ${data.revisionId}`);
  for (const ent of data.entitlements.slice(0, limit)) {
    console.log(` - ${ent.id}  ::  ${ent.skuId}`);
  }
}

// ---------------------------------------------------------------------------
// manifest  — fetch the live app manifest (no auth required)
// ---------------------------------------------------------------------------
async function cmdManifest(parsed: ParsedArgs) {
  const r = await fetch(
    'https://psnow.playstation.com/exp-manifest/ms/pc/1.0/apollo/application/json/manifest',
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) gkApollo', 'Accept': 'application/json' } }
  );
  const json = await r.json() as Record<string, unknown>;
  if (asJson(parsed)) { console.log(JSON.stringify(json, null, 2)); return; }
  const app = (json.app as Record<string, unknown> | undefined) ?? {};
  const apollo = (app.apollo as Record<string, string> | undefined) ?? {};
  console.log(`Manifest version : ${json.version ?? '?'}`);
  console.log(`App URL (np)     : ${apollo.np ?? apollo.default ?? '?'}`);
  console.log(`App URL (e1-np)  : ${apollo['e1-np'] ?? '?'}`);
  const region = (json.region as Record<string, unknown> | undefined) ?? {};
  const siea = (region.SIEA as Record<string, Record<string, string>> | undefined)?.autorenewPSPlus ?? {};
  if (Object.keys(siea).length) {
    console.log('PS Plus deep links (SIEA):');
    for (const [k, v] of Object.entries(siea)) console.log(`  ${k.padEnd(22)}: ${v}`);
  }
}

// ---------------------------------------------------------------------------
// catalog  — browse the live game catalog (guest session sufficient)
// ---------------------------------------------------------------------------
async function cmdCatalog(parsed: ParsedArgs) {
  const { npsso } = await getNpsso(parsed);
  if (!npsso) throw new Error(missingNpssoMessage(parsed));
  const dob     = typeof parsed.flags.dob     === 'string' ? parsed.flags.dob     : '1981-01-01';
  const country = typeof parsed.flags.country === 'string' ? parsed.flags.country : 'US';
  const lang    = typeof parsed.flags.lang    === 'string' ? parsed.flags.lang    : 'en';
  const cat     = typeof parsed.flags.cat     === 'string' ? parsed.flags.cat     : 'STORE-MSF192018-APOLLOROOT';
  const size    = typeof parsed.flags.size    === 'string' ? parseInt(parsed.flags.size, 10) : 20;

  const [tokenResult, session] = await Promise.all([
    exchangeNpssoForToken(npsso, 'entitlements'),
    establishKamajiSession(npsso, dob, country, lang),
  ]);
  const cookieStr = `JSESSIONID=${session.jsessionId}; WEBDUID=${session.webduid}`;
  const url = `https://psnow.playstation.com/store/api/pcnow/00_09_000/container/${country}/${lang}/19/${cat}?size=${size}&start=0`;
  const r = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${tokenResult.accessToken}`,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) gkApollo',
      'Cookie': cookieStr,
    }
  });
  const json = await r.json() as Record<string, unknown>;
  if (asJson(parsed)) { console.log(JSON.stringify(json, null, 2)); return; }
  const links = (json.links as Array<Record<string, unknown>> | undefined) ?? [];
  console.log(`Container  : ${json.id ?? cat}`);
  console.log(`Total items: ${links.length}`);
  for (const link of links.slice(0, size)) {
    console.log(`  ${String(link.id ?? '').padEnd(50)} ${link.name ?? ''}`);
  }
  if (json.attributes) {
    const facets = (json.attributes as Record<string, unknown>)?.facets as Record<string, Array<{name:string;count:number}>>|undefined;
    if (facets && Object.keys(facets).length) {
      console.log('\nFacets:');
      for (const [k, vals] of Object.entries(facets)) {
        const summary = vals.map(v=>`${v.name}(${v.count})`).join(', ');
        console.log(`  ${k}: ${summary}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// session-probe  — probe Kamaji session state with live credentials
// ---------------------------------------------------------------------------
async function cmdSessionProbe(parsed: ParsedArgs) {
  const { npsso } = await getNpsso(parsed);
  if (!npsso) {
    throw new Error(missingNpssoMessage(parsed));
  }

  const exchange = await exchangeNpssoForToken(npsso, 'entitlements');
  const session = await establishKamajiAccessTokenSession(npsso, exchange.accessToken);

  let profileOk = false;
  let entitlementsOk = false;
  let profileError: string | null = null;
  let entitlementsError: string | null = null;
  let entitlementCount: number | null = null;

  try {
    await queryKamajiUserProfile(exchange.accessToken, session.jsessionId, session.webduid);
    profileOk = true;
  } catch (e) {
    profileError = e instanceof Error ? e.message : String(e);
  }

  try {
    const ents = await queryKamajiUserEntitlements(exchange.accessToken, session.jsessionId, session.webduid);
    entitlementsOk = true;
    entitlementCount = ents.totalResults;
  } catch (e) {
    entitlementsError = e instanceof Error ? e.message : String(e);
  }

  const result = {
    generatedAt: new Date().toISOString(),
    sessionStatus: profileOk || entitlementsOk ? 'session-active' : 'session-partial',
    jsessionIdPresent: Boolean(session.jsessionId),
    webduidPresent: Boolean(session.webduid),
    recognizedSession: session.recognizedSession,
    accountIdPresent: Boolean(session.accountId),
    onlineIdPresent: Boolean(session.onlineId),
    profileOk,
    entitlementsOk,
    entitlementCount,
    profileError,
    entitlementsError,
    notes: sessionStatusNotes(profileOk || entitlementsOk ? 'session-active' : 'session-partial'),
  };

  if (asJson(parsed)) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Session status    : ${result.sessionStatus}`);
  console.log(`Has JSESSIONID    : ${result.jsessionIdPresent}`);
  console.log(`Has WEBDUID       : ${result.webduidPresent}`);
  console.log(`recognizedSession : ${result.recognizedSession}`);
  console.log(`Account ID        : ${result.accountIdPresent}`);
  console.log(`Online ID         : ${result.onlineIdPresent}`);
  console.log(`Profile endpoint  : ${result.profileOk}${result.profileError ? ` (${result.profileError})` : ''}`);
  console.log(`Entitlements      : ${result.entitlementsOk}${result.entitlementCount !== null ? ` (${result.entitlementCount})` : ''}${result.entitlementsError ? ` (${result.entitlementsError})` : ''}`);
  for (const note of result.notes) {
    console.log(`Note              : ${note}`);
  }
}

function sessionStatusNotes(status: string): string[] {
  switch (status) {
    case 'session-active':
      return [
        'Access-token session is live.',
        '/user/profile and /user/entitlements are accessible with the returned JSESSIONID + WEBDUID.',
        '`recognizedSession` may still be false even though account identity is populated.',
      ];
    case 'session-partial':
      return [
        'A session was created, but one or more authenticated endpoints still failed.',
        'Retry after a short delay or launch the native app to let GrandCentral complete additional background setup.',
      ];
    default:
      return ['Unexpected session state.'];
  }
}

// ---------------------------------------------------------------------------
// broker  — probe localhost:1235 broker WebSocket reachability
// broker send — send a raw or structured message and collect replies
// ---------------------------------------------------------------------------
type BrokerReceivedMessage = {
  receivedAt: string;
  kind: 'text' | 'binary';
  text: string | null;
  json: unknown | null;
  sizeBytes: number;
};

async function decodeBrokerMessage(data: unknown): Promise<BrokerReceivedMessage> {
  const receivedAt = new Date().toISOString();

  if (typeof data === 'string') {
    return {
      receivedAt,
      kind: 'text',
      text: data,
      json: safeJsonParse(data) ?? null,
      sizeBytes: Buffer.byteLength(data, 'utf8'),
    };
  }

  let buffer: Buffer | null = null;

  if (data instanceof ArrayBuffer) {
    buffer = Buffer.from(data);
  } else if (ArrayBuffer.isView(data)) {
    buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
    buffer = Buffer.from(await data.arrayBuffer());
  }

  if (!buffer) {
    const text = String(data);
    return {
      receivedAt,
      kind: 'text',
      text,
      json: safeJsonParse(text) ?? null,
      sizeBytes: Buffer.byteLength(text, 'utf8'),
    };
  }

  const text = buffer.toString('utf8');
  const json = safeJsonParse(text) ?? null;
  return {
    receivedAt,
    kind: json !== null || text.trim().length > 0 ? 'text' : 'binary',
    text,
    json,
    sizeBytes: buffer.byteLength,
  };
}

async function sendBrokerMessage(options: {
  url: string;
  messageText: string;
  waitMs: number;
}): Promise<{
  url: string;
  opened: boolean;
  sentAt: string | null;
  closedAt: string | null;
  closeCode: number | null;
  closeReason: string | null;
  closeWasClean: boolean | null;
  error: string | null;
  received: BrokerReceivedMessage[];
}> {
  const { url, messageText, waitMs } = options;

  return new Promise((resolve) => {
    const received: BrokerReceivedMessage[] = [];
    let opened = false;
    let sentAt: string | null = null;
    let closedAt: string | null = null;
    let closeCode: number | null = null;
    let closeReason: string | null = null;
    let closeWasClean: boolean | null = null;
    let error: string | null = null;
    let settled = false;

    const ws = new WebSocket(url);

    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(sendTimer);
      clearTimeout(forceTimer);
      resolve({
        url,
        opened,
        sentAt,
        closedAt,
        closeCode,
        closeReason,
        closeWasClean,
        error,
        received,
      });
    };

    const sendTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close();
        } catch {
          settle();
        }
      } else {
        settle();
      }
    }, waitMs);

    const forceTimer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      settle();
    }, waitMs + 2000);

    ws.addEventListener('open', () => {
      opened = true;
      sentAt = new Date().toISOString();
      ws.send(messageText);
    });

    ws.addEventListener('message', (event) => {
      void decodeBrokerMessage(event.data)
        .then((message) => {
          received.push(message);
        })
        .catch((decodeError) => {
          const detail = decodeError instanceof Error ? decodeError.message : String(decodeError);
          received.push({
            receivedAt: new Date().toISOString(),
            kind: 'text',
            text: `[decode-error] ${detail}`,
            json: null,
            sizeBytes: Buffer.byteLength(detail, 'utf8'),
          });
        });
    });

    ws.addEventListener('error', (event) => {
      const maybeError = event as Event & { error?: unknown; message?: string };
      if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
        error = maybeError.message;
        return;
      }
      if (maybeError.error instanceof Error) {
        error = maybeError.error.message;
        return;
      }
      if (maybeError.error) {
        error = String(maybeError.error);
        return;
      }
      error = error ?? 'WebSocket error';
    });

    ws.addEventListener('close', (event) => {
      closedAt = new Date().toISOString();
      closeCode = event.code;
      closeReason = event.reason || null;
      closeWasClean = event.wasClean;
      settle();
    });
  });
}

async function cmdBrokerSend(parsed: ParsedArgs) {
  const host = typeof parsed.flags.host === 'string' ? parsed.flags.host : 'localhost';
  const port = typeof parsed.flags.port === 'string' ? Number(parsed.flags.port) : 1235;
  const waitMs = typeof parsed.flags['wait-ms'] === 'string' ? Number(parsed.flags['wait-ms']) : 1500;
  if (!Number.isFinite(waitMs) || waitMs < 0) {
    throw new Error(`Invalid --wait-ms value: ${parsed.flags['wait-ms']}`);
  }

  const url = `ws://${host}:${port}/`;
  const target = typeof parsed.flags.target === 'string' ? parsed.flags.target : null;
  const rawText = typeof parsed.flags.raw === 'string' ? parsed.flags.raw : null;
  const messageFlag = typeof parsed.flags.message === 'string' ? parsed.flags.message : null;
  const payloadFlag = typeof parsed.flags.payload === 'string' ? parsed.flags.payload : null;

  let mode: 'raw' | 'message' | 'command' = 'command';
  let messageText = '';
  let sentJson: unknown = null;
  let commandName: string | null = null;
  let payload: unknown = null;

  if (rawText !== null) {
    mode = 'raw';
    messageText = rawText;
    sentJson = safeJsonParse(rawText) ?? null;
  } else if (messageFlag !== null) {
    mode = 'message';
    sentJson = parseJsonFlag(messageFlag, '--message');
    messageText = JSON.stringify(sentJson);
  } else {
    commandName = parsed.positional[1] ?? null;
    if (!commandName) {
      throw new Error('Usage: broker send <command> [payload-json] [--target QAS] [--wait-ms 1500] or broker send --raw <text>');
    }
    const positionalPayload = parsed.positional[2];
    const rawPayload = payloadFlag ?? positionalPayload;
    payload = rawPayload ? parseJsonFlag(rawPayload, '--payload') : {};
    const envelope: Record<string, unknown> = {
      command: commandName,
      params: payload,
    };
    if (target) envelope.target = target;
    sentJson = envelope;
    messageText = JSON.stringify(envelope);
  }

  const result = await sendBrokerMessage({ url, messageText, waitMs });
  const output = {
    generatedAt: new Date().toISOString(),
    mode,
    command: commandName,
    target,
    waitMs,
    sentText: messageText,
    sentJson,
    ...result,
    notes: [
      'This command only sends a WebSocket message and records replies.',
      'The broker protocol is only partially characterized; use --raw for exact replay when needed.',
      'Known preload commands from asar: startGame, stop, requestGame, requestClientId, testConnection, setAuthCodes, setSettings, sendXmbCommand, routeInputToPlayer, routeInputToClient, saveDataDeepLink, rawDataDeepLink, invitationDeepLink, gameAlertDeepLink, systemStatusDeepLink.',
    ],
  };

  if (asJson(parsed)) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`Broker URL   : ${output.url}`);
  console.log(`Opened       : ${output.opened}`);
  console.log(`Mode         : ${output.mode}`);
  if (output.command) console.log(`Command      : ${output.command}`);
  if (output.target) console.log(`Target       : ${output.target}`);
  console.log(`Waited       : ${output.waitMs}ms`);
  console.log(`Sent         : ${output.sentText}`);
  console.log(`Received     : ${output.received.length} message(s)`);
  for (const [index, message] of output.received.entries()) {
    const preview = message.text ? message.text.slice(0, 240) : '(binary)';
    console.log(`  [${index}] ${message.kind} ${message.sizeBytes}B ${preview}`);
  }
  if (output.error) console.log(`Error        : ${output.error}`);
  if (output.closeCode !== null) {
    console.log(`Close        : ${output.closeCode}${output.closeReason ? ` (${output.closeReason})` : ''}`);
  }
  for (const note of output.notes) {
    console.log(`Note         : ${note}`);
  }
}

async function cmdBroker(parsed: ParsedArgs) {
  const host = typeof parsed.flags.host === 'string' ? parsed.flags.host : 'localhost';
  const port = typeof parsed.flags.port === 'string' ? Number(parsed.flags.port) : 1235;

  const probe = await probeBrokerReachability(host, port);

  const result = {
    generatedAt: new Date().toISOString(),
    ...probe,
    notes: probe.reachable
      ? [
          'PlayStation Plus broker is reachable. The native client is running.',
          'Known preload commands from asar: startGame, stop, requestGame, requestClientId, testConnection, setAuthCodes, setSettings, sendXmbCommand, routeInputToPlayer, routeInputToClient, saveDataDeepLink, rawDataDeepLink, invitationDeepLink, gameAlertDeepLink, systemStatusDeepLink.',
          'Use `broker send <command>` to try live command replay.',
          'Observed window events: blur, focus.',
        ]
      : [
          'Broker is not reachable on ' + probe.url,
          'The PlayStation Plus app is likely not running, or the broker has not started yet.',
          'Launch the app and retry to observe broker activity.',
        ],
  };

  if (asJson(parsed)) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Broker URL   : ${result.url}`);
  console.log(`Reachable    : ${result.reachable}`);
  if (result.error) console.log(`Error        : ${result.error}`);
  for (const note of result.notes) {
    console.log(`Note         : ${note}`);
  }
}

// ---------------------------------------------------------------------------
// status  — combined auth + session + broker status summary
// ---------------------------------------------------------------------------
async function cmdStatus(parsed: ParsedArgs) {
  const cookies = await readLocalPsnCookies();
  const npssoResolution = await getNpsso(parsed);
  const hasNpsso = Boolean(npssoResolution.npsso);

  let tokenResult: { obtained: boolean; expiresIn?: number; scope?: string; error?: string } = {
    obtained: false,
  };
  let geoResult: { region?: string; timezone?: string; error?: string } = {};
  let sessionSummary: {
    status: string;
    jsessionIdPresent: boolean;
    webduidPresent: boolean;
    recognizedSession?: boolean;
    accountIdPresent?: boolean;
    onlineIdPresent?: boolean;
    profileOk?: boolean;
    entitlementsOk?: boolean;
    entitlementCount?: number | null;
    error?: string | null;
  } = {
    status: 'skipped',
    jsessionIdPresent: false,
    webduidPresent: false,
  };
  let brokerProbe: { reachable: boolean; error?: string } = { reachable: false };

  if (hasNpsso) {
    try {
      const exchange = await exchangeNpssoForToken(npssoResolution.npsso, 'entitlements');
      tokenResult = { obtained: true, expiresIn: exchange.expiresIn, scope: exchange.scope };

      const [geo, broker] = await Promise.allSettled([
        queryKamajiGeo(exchange.accessToken),
        probeBrokerReachability(),
      ]);

      if (geo.status === 'fulfilled') {
        geoResult = { region: geo.value.region, timezone: geo.value.timezone };
      } else {
        geoResult = { error: geo.reason instanceof Error ? geo.reason.message : String(geo.reason) };
      }

      if (broker.status === 'fulfilled') {
        brokerProbe = { reachable: broker.value.reachable, error: broker.value.error };
      }

      try {
        const session = await establishKamajiAccessTokenSession(npssoResolution.npsso, exchange.accessToken);
        let profileOk = false;
        let entitlementsOk = false;
        let entitlementCount: number | null = null;
        let sessionError: string | null = null;

        try {
          await queryKamajiUserProfile(exchange.accessToken, session.jsessionId, session.webduid);
          profileOk = true;
        } catch (error) {
          sessionError = error instanceof Error ? error.message : String(error);
        }

        try {
          const entitlements = await queryKamajiUserEntitlements(exchange.accessToken, session.jsessionId, session.webduid);
          entitlementsOk = true;
          entitlementCount = entitlements.totalResults;
        } catch (error) {
          sessionError = sessionError ?? (error instanceof Error ? error.message : String(error));
        }

        sessionSummary = {
          status: profileOk || entitlementsOk ? 'session-active' : 'session-partial',
          jsessionIdPresent: Boolean(session.jsessionId),
          webduidPresent: Boolean(session.webduid),
          recognizedSession: session.recognizedSession,
          accountIdPresent: Boolean(session.accountId),
          onlineIdPresent: Boolean(session.onlineId),
          profileOk,
          entitlementsOk,
          entitlementCount,
          error: sessionError,
        };
      } catch (error) {
        sessionSummary = {
          status: 'session-error',
          jsessionIdPresent: false,
          webduidPresent: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } catch (error) {
      tokenResult = {
        obtained: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    auth: {
      npssoPresent: hasNpsso,
      npssoSource: hasNpsso ? npssoResolution.source : null,
      freshTokenObtained: tokenResult.obtained,
      tokenScope: tokenResult.scope ?? null,
      tokenExpiresIn: tokenResult.expiresIn ?? null,
      tokenError: tokenResult.error ?? null,
    },
    geo: geoResult,
    session: sessionSummary,
    localAppCookies: {
      jsessionIdPresent: Boolean(cookies.qtWebEngine.jsessionId),
      webduidPresent: Boolean(cookies.qtWebEngine.webduid),
    },
    broker: {
      reachable: brokerProbe.reachable,
      url: 'ws://localhost:1235/',
      error: brokerProbe.error ?? null,
    },
  };

  if (asJson(parsed)) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`[psn-direct] Auth surface status`);
  console.log(`NPSSO present      : ${summary.auth.npssoPresent}`);
  console.log(`NPSSO source       : ${summary.auth.npssoSource ?? 'n/a'}`);
  console.log(`Fresh token ready  : ${summary.auth.freshTokenObtained}${summary.auth.tokenError ? ` (${summary.auth.tokenError})` : ''}`);
  console.log(`Token expires in   : ${summary.auth.tokenExpiresIn ? `${summary.auth.tokenExpiresIn}s` : 'n/a'}`);
  console.log(`Geo region         : ${summary.geo.region ?? summary.geo.error ?? 'n/a'}`);
  console.log(`Geo timezone       : ${summary.geo.timezone ?? 'n/a'}`);
  console.log(`Kamaji session     : ${summary.session.status}`);
  console.log(`  JSESSIONID       : ${summary.session.jsessionIdPresent ? 'present' : 'absent'}`);
  console.log(`  WEBDUID          : ${summary.session.webduidPresent ? 'present' : 'absent'}`);
  if (summary.session.accountIdPresent !== undefined) {
    console.log(`  Account linked   : ${summary.session.accountIdPresent}`);
    console.log(`  Online ID        : ${summary.session.onlineIdPresent}`);
    console.log(`  Profile ok       : ${summary.session.profileOk}`);
    console.log(`  Entitlements ok  : ${summary.session.entitlementsOk}${summary.session.entitlementCount != null ? ` (${summary.session.entitlementCount})` : ''}`);
    console.log(`  recognizedSession: ${summary.session.recognizedSession}`);
  }
  console.log(`Local app cookies  : JSESSIONID=${summary.localAppCookies.jsessionIdPresent} WEBDUID=${summary.localAppCookies.webduidPresent}`);
  console.log(`Broker reachable   : ${summary.broker.reachable}${summary.broker.error ? ` (${summary.broker.error})` : ''}`);
  console.log('');

  if (!summary.auth.freshTokenObtained) {
    console.log('→ NPSSO missing or expired. Acquire it via the official web login flow:');
    console.log('→   npm run auth:psn-headed');
    console.log('→   npm run auth:extract-npsso');
  } else if (summary.session.status === 'session-active') {
    console.log('→ Full Kamaji API access available. Run api:psn-direct -- token to export bearer.');
  } else if (summary.session.status === 'session-partial' || summary.session.status === 'session-error') {
    console.log(`→ Auth succeeded but session validation was incomplete${summary.session.error ? ` (${summary.session.error})` : ''}.`);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.command) usage();

  if (parsed.command === 'token') return cmdToken(parsed);
  if (parsed.command === 'geo') return cmdGeo(parsed);
  if (parsed.command === 'session') return cmdSession(parsed);
  if (parsed.command === 'stores') return cmdStores(parsed);
  if (parsed.command === 'profile') return cmdProfile(parsed);
  if (parsed.command === 'entitlements') return cmdEntitlements(parsed);
  if (parsed.command === 'manifest') return cmdManifest(parsed);
  if (parsed.command === 'catalog') return cmdCatalog(parsed);
  if (parsed.command === 'session-probe') return cmdSessionProbe(parsed);
  if (parsed.command === 'broker') {
    if (parsed.positional[0] === 'send') return cmdBrokerSend(parsed);
    return cmdBroker(parsed);
  }
  if (parsed.command === 'status') return cmdStatus(parsed);

  usage();
}

main().catch((error) => {
  console.error('[psn-direct] Error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
