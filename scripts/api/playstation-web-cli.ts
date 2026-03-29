import fs from 'node:fs/promises';
import path from 'node:path';
import { findSafariTabIndex, runJavaScriptInSafariTab } from '../lib/safari.js';
import { resolveArtifactPath } from '../lib/env.js';
import { PLAYSTATION_WEB_API_PROBES, getWebApiProbe, type WebApiProbe } from '../../src/observations/playstation-web-api-catalog.js';
import {
  classifyProbeResult,
  summarizeProbeBody,
  type ProbeExecutionResult
} from '../lib/playstation-web-probe.js';

const DEFAULT_OUT = 'artifacts/api/playstation-web-probe-report.json';
const DEFAULT_DELAY_MS = 4_000;
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 20_000;

type ParsedArgs = {
  command?: string;
  positional: string[];
  flags: Record<string, string | true>;
};

function usage(): never {
  throw new Error(
    [
      'Usage:',
      '  npm run api:playstation-web -- list [--ids id1,id2]',
      '  npm run api:playstation-web -- call <probe-id> [--out <path>]',
      '  npm run api:playstation-web -- probe [--ids id1,id2] [--delay-ms 4000] [--out <path>]'
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

function parseIds(flags: ParsedArgs['flags']): string[] | null {
  const raw = flags.ids;
  if (!raw || raw === true) return null;
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseDelayMs(flags: ParsedArgs['flags']): number {
  const raw = flags['delay-ms'];
  if (!raw || raw === true) return DEFAULT_DELAY_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid --delay-ms value: ${String(raw)}`);
  }
  return parsed;
}

function selectProbes(ids: string[] | null): WebApiProbe[] {
  if (!ids || ids.length === 0) return PLAYSTATION_WEB_API_PROBES;

  const selected = ids.map((id) => {
    const probe = getWebApiProbe(id);
    if (!probe) throw new Error(`Unknown probe id: ${id}`);
    return probe;
  });

  return selected;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildProbeJavaScript(probeKey: string, probe: WebApiProbe): string {
  const stateVar = `__psWenProbe_${probeKey.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const requestInit = {
    method: probe.request.method,
    credentials: 'include',
    redirect: probe.request.redirect ?? 'follow',
    headers: probe.request.headers ?? {},
    body: probe.request.body ? JSON.stringify(probe.request.body) : undefined
  };

  return `
    window.${stateVar} = { status: 'running' };
    fetch(${JSON.stringify(probe.request.url)}, ${JSON.stringify(requestInit)})
      .then(async (res) => {
        const text = await res.text();
        window.${stateVar} = {
          status: 'done',
          ok: res.ok,
          code: res.status,
          url: res.url,
          type: res.type,
          contentType: res.headers.get('content-type'),
          body: text.slice(0, 200000)
        };
      })
      .catch((err) => {
        window.${stateVar} = { status: 'error', error: String(err) };
      });
    '${stateVar}';
  `;
}

async function pollProbe(tabIndex: number, stateVar: string): Promise<ProbeExecutionResult> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const raw = await runJavaScriptInSafariTab(tabIndex, `JSON.stringify(window.${stateVar} || null)`);
    if (raw) {
      const parsed = JSON.parse(raw) as { status?: string } & ProbeExecutionResult;
      if (parsed.status === 'done' || parsed.status === 'error') {
        return parsed as ProbeExecutionResult;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for Safari probe state ${stateVar}`);
}

async function executeProbe(probe: WebApiProbe) {
  const tabIndex = await findSafariTabIndex(probe.preferredOrigins);
  const probeKey = probe.id.replace(/[^a-zA-Z0-9_]/g, '_');
  const stateVar = `__psWenProbe_${probeKey}`;
  await runJavaScriptInSafariTab(tabIndex, buildProbeJavaScript(probeKey, probe));
  const result = await pollProbe(tabIndex, stateVar);

  const summary = summarizeProbeBody(result.body);
  const classification = classifyProbeResult({
    status: result.status,
    code: result.code ?? null,
    type: result.type ?? null,
    error: result.error ?? null,
    errorMessages: summary.errorMessages
  });

  return {
    id: probe.id,
    kind: probe.kind,
    notes: probe.notes,
    tabIndex,
    request: {
      url: probe.request.url,
      method: probe.request.method,
      headers: Object.keys(probe.request.headers ?? {}).sort(),
      hasBody: Boolean(probe.request.body),
      redirect: probe.request.redirect ?? 'follow',
      operationName:
        probe.request.body && typeof probe.request.body === 'object' && 'operationName' in (probe.request.body as Record<string, unknown>)
          ? String((probe.request.body as Record<string, unknown>).operationName)
          : null
    },
    response: {
      status: result.status,
      ok: result.ok ?? false,
      code: result.code ?? null,
      url: result.url ?? probe.request.url,
      type: result.type ?? null,
      contentType: result.contentType ?? null,
      error: result.error ?? null,
      classification,
      summary
    },
    rawBody: result.body ?? null
  };
}

async function writeReport(report: unknown, outputPath: string) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function cmdList(parsed: ParsedArgs) {
  for (const probe of selectProbes(parseIds(parsed.flags))) {
    console.log(`${probe.id} [${probe.kind}]`);
    console.log(`  ${probe.notes}`);
  }
}

async function cmdCall(id: string, parsed: ParsedArgs) {
  const probe = getWebApiProbe(id);
  if (!probe) throw new Error(`Unknown probe id: ${id}`);
  const result = await executeProbe(probe);
  const outputPath = await writeReport(
    { generatedAt: new Date().toISOString(), results: [result] },
    resolveArtifactPath(typeof parsed.flags.out === 'string' ? parsed.flags.out : undefined, DEFAULT_OUT)
  );
  console.log(`Wrote ${outputPath}`);
  console.log(JSON.stringify(result.response, null, 2));
}

async function cmdProbe(parsed: ParsedArgs) {
  const probes = selectProbes(parseIds(parsed.flags));
  const delayMs = parseDelayMs(parsed.flags);
  const outputPath = resolveArtifactPath(typeof parsed.flags.out === 'string' ? parsed.flags.out : undefined, DEFAULT_OUT);
  const results = [];

  console.log(`Probing ${probes.length} endpoint(s) with ${delayMs}ms spacing between requests.`);
  for (const [index, probe] of probes.entries()) {
    if (index > 0 && delayMs > 0) {
      console.log(`Waiting ${delayMs}ms before ${probe.id}...`);
      await sleep(delayMs);
    }

    try {
      results.push(await executeProbe(probe));
    } catch (error) {
      results.push({
        id: probe.id,
        kind: probe.kind,
        notes: probe.notes,
        request: {
          url: probe.request.url,
          method: probe.request.method,
          headers: Object.keys(probe.request.headers ?? {}).sort(),
          hasBody: Boolean(probe.request.body),
          redirect: probe.request.redirect ?? 'follow',
          operationName:
            probe.request.body && typeof probe.request.body === 'object' && 'operationName' in (probe.request.body as Record<string, unknown>)
              ? String((probe.request.body as Record<string, unknown>).operationName)
              : null
        },
        response: {
          status: 'error',
          ok: false,
          code: null,
          url: probe.request.url,
          type: null,
          contentType: null,
          error: error instanceof Error ? error.message : String(error),
          classification: 'request-error',
          summary: null
        },
        rawBody: null
      });
    }
  }

  await writeReport({ generatedAt: new Date().toISOString(), results }, outputPath);
  console.log(`Wrote ${outputPath}`);
  for (const result of results) {
    console.log(`- ${result.id}: ${result.response.status} ${result.response.code ?? ''}`.trim());
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.command) usage();

  if (parsed.command === 'list') return cmdList(parsed);
  if (parsed.command === 'call') {
    const id = parsed.positional[0];
    if (!id) usage();
    return cmdCall(id, parsed);
  }
  if (parsed.command === 'probe') return cmdProbe(parsed);

  usage();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
