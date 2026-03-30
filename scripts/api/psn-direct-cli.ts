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
 *   npm run api:psn-direct -- status [--json]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  readLocalPsnCookies,
  exchangeNpssoForToken,
  exchangeNpssoForCode,
  queryKamajiGeo,
  probeKamajiSessionState,
  probeBrokerReachability,
  establishKamajiSession,
  queryKamajiUserStores,
  PSN_OAUTH_CLIENTS,
  type PsnOAuthClientId,
} from '../lib/psn-auth.js';
import { resolveArtifactPath } from '../lib/env.js';

const DEFAULT_TOKEN_OUT = 'artifacts/auth/psn-token-exchange.json';

type ParsedArgs = {
  command?: string;
  positional: string[];
  flags: Record<string, string | true>;
};

function usage(): never {
  throw new Error(
    [
      'Usage:',
      '  npm run api:psn-direct -- token [--client entitlements|commerce|firstplay|commerce-basic|sso] [--out <path>] [--json]',
      '  npm run api:psn-direct -- geo [--json]',
      '  npm run api:psn-direct -- session [--dob YYYY-MM-DD] [--country US] [--lang en] [--json]',
      '  npm run api:psn-direct -- stores [--dob YYYY-MM-DD] [--json]',
      '  npm run api:psn-direct -- session-probe [--json]',
      '  npm run api:psn-direct -- broker [--host localhost] [--port 1235] [--json]',
      '  npm run api:psn-direct -- status [--json]',
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

async function writeArtifact(data: unknown, outputPath: string) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// token  — exchange NPSSO for a fresh bearer token
// ---------------------------------------------------------------------------
async function cmdToken(parsed: ParsedArgs) {
  const clientName = (parsed.flags.client as PsnOAuthClientId | undefined) ?? 'entitlements';
  if (!(clientName in PSN_OAUTH_CLIENTS)) {
    throw new Error(`Unknown client name: "${clientName}". Valid: ${Object.keys(PSN_OAUTH_CLIENTS).join(', ')}`);
  }

  const cookies = await readLocalPsnCookies();
  if (!cookies.roaming.npsso) {
    throw new Error('No NPSSO cookie found. Ensure the PlayStation Plus app has been logged in.');
  }

  const client = PSN_OAUTH_CLIENTS[clientName];

  if (client.responseType === 'token') {
    const exchange = await exchangeNpssoForToken(cookies.roaming.npsso, clientName);
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

  } else {
    const exchange = await exchangeNpssoForCode(cookies.roaming.npsso, clientName);
    const result = {
      generatedAt: exchange.obtainedAt,
      kind: 'authorization_code' as const,
      clientName,
      clientId: exchange.clientId,
      code: exchange.code,
      scope: exchange.scope,
      correlationId: exchange.correlationId,
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
    console.log('(Single-use auth code — use it immediately for session init)');
  }
}

// ---------------------------------------------------------------------------
// geo  — query Kamaji geo endpoint (works with bearer token only)
// ---------------------------------------------------------------------------
async function cmdGeo(parsed: ParsedArgs) {
  const cookies = await readLocalPsnCookies();
  let token: string | undefined;

  if (cookies.roaming.npsso) {
    try {
      const exchange = await exchangeNpssoForToken(cookies.roaming.npsso, 'entitlements');
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
  const cookies = await readLocalPsnCookies();
  if (!cookies.roaming.npsso) {
    throw new Error('No NPSSO found. Ensure the PlayStation Plus app has been logged in.');
  }

  const dob     = typeof parsed.flags.dob     === 'string' ? parsed.flags.dob     : '1981-01-01';
  const country = typeof parsed.flags.country === 'string' ? parsed.flags.country : 'US';
  const lang    = typeof parsed.flags.lang    === 'string' ? parsed.flags.lang    : 'en';

  const session = await establishKamajiSession(cookies.roaming.npsso, dob, country, lang);

  const result = {
    generatedAt: session.establishedAt,
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
    notes: session.recognizedSession
      ? ['Session is recognized. All Kamaji endpoints should be accessible.']
      : [
          'Session is a guest (recognizedSession=false). /user/stores and /geo are accessible.',
          '/user, /user/entitlements, /user/subscription require a recognized session.',
          'Recognition requires the GrandCentral SDK to link the OAuth code to the session.',
          'Launch the PS Plus app to get a fully recognized JSESSIONID, then re-run session-probe.',
        ],
  };

  const outputPath = resolveArtifactPath(
    typeof parsed.flags.out === 'string' ? parsed.flags.out : undefined,
    DEFAULT_SESSION_OUT
  );
  await writeArtifact(result, outputPath);

  if (asJson(parsed)) { console.log(JSON.stringify(result, null, 2)); return; }

  console.log(`[psn-direct] Wrote: ${outputPath}`);
  console.log(`JSESSIONID        : ${session.jsessionId.slice(0, 16)}...`);
  console.log(`WEBDUID           : ${session.webduid.slice(0, 20)}...`);
  console.log(`Session URL       : ${session.sessionUrl}`);
  console.log(`Country           : ${session.country}`);
  console.log(`Age               : ${session.age}`);
  console.log(`Recognized        : ${session.recognizedSession}`);
  console.log(`Account ID        : ${session.accountId ?? '(null — guest session)'}`);
  for (const note of result.notes) console.log(`Note              : ${note}`);
}

// ---------------------------------------------------------------------------
// stores  — fetch store/catalog URL map (works with guest session)
// ---------------------------------------------------------------------------
async function cmdStores(parsed: ParsedArgs) {
  const cookies = await readLocalPsnCookies();
  if (!cookies.roaming.npsso) {
    throw new Error('No NPSSO found.');
  }

  const dob     = typeof parsed.flags.dob     === 'string' ? parsed.flags.dob     : '1981-01-01';
  const country = typeof parsed.flags.country === 'string' ? parsed.flags.country : 'US';
  const lang    = typeof parsed.flags.lang    === 'string' ? parsed.flags.lang    : 'en';

  // Get token and session in parallel
  const [tokenResult, session] = await Promise.all([
    exchangeNpssoForToken(cookies.roaming.npsso, 'entitlements'),
    establishKamajiSession(cookies.roaming.npsso, dob, country, lang),
  ]);

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
// session-probe  — probe Kamaji session state with live credentials
// ---------------------------------------------------------------------------
async function cmdSessionProbe(parsed: ParsedArgs) {
  const cookies = await readLocalPsnCookies();
  if (!cookies.roaming.npsso) {
    throw new Error('No NPSSO found. Cannot probe session state.');
  }

  const exchange = await exchangeNpssoForToken(cookies.roaming.npsso, 'entitlements');
  const probe = await probeKamajiSessionState(
    exchange.accessToken,
    cookies.qtWebEngine.jsessionId,
    cookies.qtWebEngine.webduid
  );

  const result = {
    generatedAt: new Date().toISOString(),
    sessionStatus: probe.status,
    httpStatus: probe.httpStatus,
    rawStatusCode: probe.rawCode,
    hasJsessionId: Boolean(cookies.qtWebEngine.jsessionId),
    hasWebduid: Boolean(cookies.qtWebEngine.webduid),
    freshTokenObtained: true,
    notes: sessionStatusNotes(probe.status),
  };

  if (asJson(parsed)) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Session status    : ${result.sessionStatus}`);
  console.log(`HTTP status       : ${result.httpStatus}`);
  console.log(`Raw Kamaji code   : ${result.rawStatusCode}`);
  console.log(`Has JSESSIONID    : ${result.hasJsessionId}`);
  console.log(`Has WEBDUID       : ${result.hasWebduid}`);
  console.log(`Fresh token ready : ${result.freshTokenObtained}`);
  for (const note of result.notes) {
    console.log(`Note              : ${note}`);
  }
}

function sessionStatusNotes(status: string): string[] {
  switch (status) {
    case 'session-active':
      return ['Kamaji session is live. Bearer token + JSESSIONID accepted.'];
    case 'session-expired':
      return [
        'JSESSIONID is stale. A new Kamaji session must be established.',
        'The PlayStation Plus PC app does this automatically on launch via a POST to /kamaji/api/pcnow/00_09_000/user with the auth code.',
        'To re-establish: launch the PS Plus app; it will create a new JSESSIONID/WEBDUID pair.',
      ];
    case 'no-session':
      return [
        'No JSESSIONID present. Session has not been established for this machine.',
        'The Kamaji session is initiated by the native PlayStation Plus client on startup.',
      ];
    case 'auth-required':
      return ['Bearer token was rejected. NPSSO may be expired. Try re-logging in to the PS Plus app.'];
    default:
      return ['Unexpected session state. Check raw status code for details.'];
  }
}

// ---------------------------------------------------------------------------
// broker  — probe localhost:1235 broker WebSocket reachability
// ---------------------------------------------------------------------------
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
  const hasNpsso = Boolean(cookies.roaming.npsso);

  let tokenResult: { obtained: boolean; expiresIn?: number; scope?: string; error?: string } = {
    obtained: false,
  };
  let geoResult: { region?: string; timezone?: string; error?: string } = {};
  let sessionProbe: { status: string; httpStatus: number; error?: string } = {
    status: 'skipped',
    httpStatus: 0,
  };
  let brokerProbe: { reachable: boolean; error?: string } = { reachable: false };

  if (hasNpsso) {
    try {
      const exchange = await exchangeNpssoForToken(cookies.roaming.npsso, 'entitlements');
      tokenResult = { obtained: true, expiresIn: exchange.expiresIn, scope: exchange.scope };

      const [geo, session, broker] = await Promise.allSettled([
        queryKamajiGeo(exchange.accessToken),
        probeKamajiSessionState(
          exchange.accessToken,
          cookies.qtWebEngine.jsessionId,
          cookies.qtWebEngine.webduid
        ),
        probeBrokerReachability(),
      ]);

      if (geo.status === 'fulfilled') {
        geoResult = { region: geo.value.region, timezone: geo.value.timezone };
      } else {
        geoResult = { error: geo.reason instanceof Error ? geo.reason.message : String(geo.reason) };
      }

      if (session.status === 'fulfilled') {
        sessionProbe = { status: session.value.status, httpStatus: session.value.httpStatus };
      } else {
        sessionProbe = { status: 'error', httpStatus: 0, error: String(session.reason) };
      }

      if (broker.status === 'fulfilled') {
        brokerProbe = { reachable: broker.value.reachable, error: broker.value.error };
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
      freshTokenObtained: tokenResult.obtained,
      tokenScope: tokenResult.scope ?? null,
      tokenExpiresIn: tokenResult.expiresIn ?? null,
      tokenError: tokenResult.error ?? null,
    },
    geo: geoResult,
    session: {
      status: sessionProbe.status,
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
  console.log(`Fresh token ready  : ${summary.auth.freshTokenObtained}${summary.auth.tokenError ? ` (${summary.auth.tokenError})` : ''}`);
  console.log(`Token expires in   : ${summary.auth.tokenExpiresIn ? `${summary.auth.tokenExpiresIn}s` : 'n/a'}`);
  console.log(`Geo region         : ${summary.geo.region ?? summary.geo.error ?? 'n/a'}`);
  console.log(`Geo timezone       : ${summary.geo.timezone ?? 'n/a'}`);
  console.log(`Kamaji session     : ${summary.session.status}`);
  console.log(`  JSESSIONID       : ${summary.session.jsessionIdPresent ? 'present' : 'absent'}`);
  console.log(`  WEBDUID          : ${summary.session.webduidPresent ? 'present' : 'absent'}`);
  console.log(`Broker reachable   : ${summary.broker.reachable}${summary.broker.error ? ` (${summary.broker.error})` : ''}`);
  console.log('');

  if (!summary.auth.freshTokenObtained) {
    console.log('→ NPSSO missing or expired. Log in via the PS Plus app to refresh.');
  } else if (summary.session.status === 'session-expired') {
    console.log('→ Kamaji session expired. Launch the PS Plus app to re-establish.');
    console.log('→ Once running, re-run this command to confirm session-active.');
  } else if (summary.session.status === 'session-active') {
    console.log('→ Full Kamaji API access available. Run api:psn-direct -- token to export bearer.');
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
  if (parsed.command === 'session-probe') return cmdSessionProbe(parsed);
  if (parsed.command === 'broker') return cmdBroker(parsed);
  if (parsed.command === 'status') return cmdStatus(parsed);

  usage();
}

main().catch((error) => {
  console.error('[psn-direct] Error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
