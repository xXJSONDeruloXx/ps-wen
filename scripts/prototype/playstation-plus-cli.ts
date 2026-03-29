import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolveArtifactPath } from '../lib/env.js';
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
      '  npm run prototype:psplus -- login [--wait-seconds 300]',
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

async function cmdLogin(parsed: ParsedArgs) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const childEnv = { ...process.env };
  if (typeof parsed.flags['wait-seconds'] === 'string') {
    childEnv.MANUAL_AUTH_WAIT_SECONDS = parsed.flags['wait-seconds'];
  }

  console.log('[ps-wen] Launching official browser login helper...');
  const child = spawn(command, ['run', 'auth:psn-headed'], {
    stdio: 'inherit',
    env: childEnv,
    shell: false
  });

  const [code] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null];
  if (code !== 0) {
    throw new Error(`auth:psn-headed exited with code ${String(code)}`);
  }
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
