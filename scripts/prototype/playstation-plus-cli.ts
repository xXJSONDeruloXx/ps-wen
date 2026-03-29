import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type SpawnOptions } from 'node:child_process';
import { once } from 'node:events';
import { loadEnv, resolveArtifactPath } from '../lib/env.js';
import {
  PlayStationPlusObservationProvider,
  type BrowserAuthSummaryArtifact,
  type NetworkSummaryArtifact,
  type PcApolloSummaryArtifact,
  type PcAuthSummaryArtifact,
  type PcSurfaceSummaryArtifact,
  type PlayStationPlusPrototypeStatus
} from '../../src/providers/playstation-plus-observation-provider.js';

const DEFAULT_BROWSER_AUTH_SUMMARY = 'artifacts/auth/playstation-auth-summary.json';
const DEFAULT_PC_AUTH_SUMMARY = 'artifacts/auth/playstation-plus-pc-auth-summary.json';
const DEFAULT_PC_SURFACE_SUMMARY = 'artifacts/static/playstation-plus-pc-surface.json';
const DEFAULT_PC_APOLLO_SUMMARY = 'artifacts/public/playstation-plus-pc-apollo-summary.json';
const DEFAULT_NETWORK_DIR = 'artifacts/network';
const DEFAULT_PSN_LOGIN_URL =
  'https://web.np.playstation.com/api/session/v1/signin?redirect_uri=https%3A%2F%2Fstore.playstation.com%2F';

type ParsedArgs = {
  command?: string;
  positional: string[];
  flags: Record<string, string | true>;
};

function usage(): never {
  throw new Error(
    [
      'Usage:',
      '  npm run prototype:psplus -- status [--json]',
      '  npm run prototype:psplus -- login [--dry-run]',
      '  npm run prototype:psplus -- login --capture-artifacts [--wait-seconds 300] [--dry-run]',
      '  npm run prototype:psplus -- bootstrap',
      '  npm run prototype:psplus -- entitlements',
      '  npm run prototype:psplus -- allocate [--title-id CUSA00001] [--region us] [--quality auto]'
    ].join('\n')
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      flags[rawKey] = inlineValue;
      continue;
    }

    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      flags[rawKey] = true;
      continue;
    }

    flags[rawKey] = next;
    index += 1;
  }

  return { command, positional, flags };
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function readLatestNetworkSummaries(networkDir: string): Promise<NetworkSummaryArtifact[]> {
  try {
    const entries = await fs.readdir(networkDir);
    const files = entries
      .filter((entry) => /^ps-cloud-metadata-\d{8}-\d{6}\.summary\.json$/i.test(entry))
      .sort((a, b) => a.localeCompare(b));
    const latest = files.slice(-3);
    const summaries = await Promise.all(
      latest.map((entry) => readJsonIfExists<NetworkSummaryArtifact>(path.join(networkDir, entry)))
    );
    return summaries.filter((summary): summary is NetworkSummaryArtifact => summary !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function loadProvider() {
  const browserAuthSummaryPath = resolveArtifactPath(undefined, DEFAULT_BROWSER_AUTH_SUMMARY);
  const pcAuthSummaryPath = resolveArtifactPath(undefined, DEFAULT_PC_AUTH_SUMMARY);
  const pcSurfaceSummaryPath = resolveArtifactPath(undefined, DEFAULT_PC_SURFACE_SUMMARY);
  const pcApolloSummaryPath = resolveArtifactPath(undefined, DEFAULT_PC_APOLLO_SUMMARY);
  const networkDir = resolveArtifactPath(undefined, DEFAULT_NETWORK_DIR);

  const [browserAuthSummary, pcAuthSummary, pcSurfaceSummary, pcApolloSummary, networkSummaries] = await Promise.all([
    readJsonIfExists<BrowserAuthSummaryArtifact>(browserAuthSummaryPath),
    readJsonIfExists<PcAuthSummaryArtifact>(pcAuthSummaryPath),
    readJsonIfExists<PcSurfaceSummaryArtifact>(pcSurfaceSummaryPath),
    readJsonIfExists<PcApolloSummaryArtifact>(pcApolloSummaryPath),
    readLatestNetworkSummaries(networkDir)
  ]);

  return new PlayStationPlusObservationProvider({
    browserAuthSummary,
    pcAuthSummary,
    pcSurfaceSummary,
    pcApolloSummary,
    networkSummaries
  });
}

function printStatus(status: PlayStationPlusPrototypeStatus) {
  console.log(`Signed in        : ${status.session.signedIn} (${status.session.surface})`);
  console.log(`App URL          : ${status.app.currentAppUrl ?? '(unknown)'}`);
  console.log(`Runtime          : ${status.app.runtimeVersion ?? '(unknown)'}`);
  console.log(`Local broker     : ${status.app.localhostBrokerUrl ?? '(not observed)'}`);
  console.log(`Preload commands : ${status.app.preloadCommandCount}`);
  console.log(`Captured hosts   : ${status.hosts.captured.length}`);
  console.log('');
  console.log('Capabilities');
  for (const [name, capability] of Object.entries(status.capabilities)) {
    console.log(`- ${name}: ${capability.state}`);
    if (capability.evidence.length > 0) {
      console.log(`    evidence: ${capability.evidence.slice(0, 5).join(', ')}`);
    }
    if (capability.notes.length > 0) {
      console.log(`    notes   : ${capability.notes[0]}`);
    }
  }
  console.log('');
  console.log('Next steps');
  for (const step of status.nextSteps) {
    console.log(`- ${step}`);
  }
}

async function cmdStatus(parsed: ParsedArgs) {
  const provider = await loadProvider();
  const status = await provider.getStatus();

  if (parsed.flags.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  printStatus(status);
}

async function cmdBootstrap() {
  const provider = await loadProvider();
  console.log(JSON.stringify(await provider.getProfileBootstrap(), null, 2));
}

async function cmdEntitlements() {
  const provider = await loadProvider();
  console.log(JSON.stringify(await provider.listEntitlements(), null, 2));
}

async function cmdAllocate(parsed: ParsedArgs) {
  const provider = await loadProvider();
  const titleId = typeof parsed.flags['title-id'] === 'string' ? parsed.flags['title-id'] : undefined;
  const regionPreference = typeof parsed.flags.region === 'string' ? parsed.flags.region : undefined;
  const qualityPreference =
    parsed.flags.quality === 'auto' ||
    parsed.flags.quality === '720p' ||
    parsed.flags.quality === '1080p' ||
    parsed.flags.quality === '4k'
      ? parsed.flags.quality
      : undefined;

  const allocation = await provider.allocate({ titleId, regionPreference, qualityPreference });
  console.log(JSON.stringify(allocation, null, 2));
}

function resolveLoginUrl() {
  const env = loadEnv();
  return env.PSN_LOGIN_URL || DEFAULT_PSN_LOGIN_URL;
}

function buildLoginCaptureSpawnSpec(parsed: ParsedArgs): {
  command: string;
  args: string[];
  options: SpawnOptions;
} {
  const childEnv = { ...process.env };
  if (typeof parsed.flags['wait-seconds'] === 'string') {
    childEnv.MANUAL_AUTH_WAIT_SECONDS = parsed.flags['wait-seconds'];
  }

  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm run auth:psn-headed'],
      options: {
        stdio: 'inherit',
        env: childEnv,
        shell: false
      }
    };
  }

  return {
    command: 'npm',
    args: ['run', 'auth:psn-headed'],
    options: {
      stdio: 'inherit',
      env: childEnv,
      shell: false
    }
  };
}

function buildSystemBrowserOpenSpec(loginUrl: string): {
  command: string;
  args: string[];
  options: SpawnOptions;
} {
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `start "" "${loginUrl.replace(/"/g, '""')}"`],
      options: {
        stdio: 'inherit',
        env: process.env,
        shell: false
      }
    };
  }

  if (process.platform === 'darwin') {
    return {
      command: 'open',
      args: [loginUrl],
      options: {
        stdio: 'inherit',
        env: process.env,
        shell: false
      }
    };
  }

  return {
    command: 'xdg-open',
    args: [loginUrl],
    options: {
      stdio: 'inherit',
      env: process.env,
      shell: false
    }
  };
}

async function runSpawnSpec(spec: { command: string; args: string[]; options: SpawnOptions }) {
  const child = spawn(spec.command, spec.args, spec.options);

  const result = await Promise.race([
    once(child, 'exit').then(([code, signal]) => ({ code, signal, error: null })),
    once(child, 'error').then(([error]) => ({ code: null, signal: null, error }))
  ]);

  if (result.error) {
    throw result.error;
  }

  if (result.code !== 0) {
    throw new Error(`Subprocess exited with code ${String(result.code)}${result.signal ? ` signal ${result.signal}` : ''}`);
  }
}

async function cmdLogin(parsed: ParsedArgs) {
  const captureArtifacts = Boolean(parsed.flags['capture-artifacts']);

  if (captureArtifacts) {
    const spec = buildLoginCaptureSpawnSpec(parsed);
    if (parsed.flags['dry-run']) {
      console.log(JSON.stringify({ mode: 'capture-artifacts', command: spec.command, args: spec.args }, null, 2));
      return;
    }

    console.log('[ps-wen] Launching official browser login helper with local artifact capture...');
    await runSpawnSpec(spec);
    return;
  }

  const loginUrl = resolveLoginUrl();
  const spec = buildSystemBrowserOpenSpec(loginUrl);
  if (parsed.flags['dry-run']) {
    console.log(JSON.stringify({ mode: 'system-browser', loginUrl, command: spec.command, args: spec.args }, null, 2));
    return;
  }

  console.log('[ps-wen] Opening official PlayStation sign-in URL in your default browser...');
  await runSpawnSpec(spec);
  console.log(`[ps-wen] Opened: ${loginUrl}`);
  console.log('[ps-wen] This system-browser mode does not capture cookies or storage artifacts.');
  console.log('[ps-wen] If you want local auth artifacts afterward, run: npm run prototype:psplus -- login --capture-artifacts');
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.command) usage();

  if (parsed.command === 'status') return cmdStatus(parsed);
  if (parsed.command === 'login') return cmdLogin(parsed);
  if (parsed.command === 'bootstrap') return cmdBootstrap();
  if (parsed.command === 'entitlements') return cmdEntitlements();
  if (parsed.command === 'allocate') return cmdAllocate(parsed);

  usage();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
