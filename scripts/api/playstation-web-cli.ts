import fs from 'node:fs/promises';
import path from 'node:path';
import { findSafariTabIndex, runJavaScriptInSafariTab } from '../lib/safari.js';
import { resolveArtifactPath } from '../lib/env.js';
import { PLAYSTATION_WEB_API_PROBES, getWebApiProbe, type WebApiProbe } from '../../src/observations/playstation-web-api-catalog.js';

const DEFAULT_OUT = resolveArtifactPath(undefined, 'artifacts/api/playstation-web-probe-report.json');
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 20_000;

type ProbeExecutionResult = {
  status: 'done' | 'error';
  ok?: boolean;
  code?: number;
  url?: string;
  contentType?: string | null;
  body?: string;
  error?: string;
};

function usage(): never {
  throw new Error(
    [
      'Usage:',
      '  npm run api:playstation-web -- list',
      '  npm run api:playstation-web -- call <probe-id>',
      '  npm run api:playstation-web -- probe'
    ].join('\n')
  );
}

function buildProbeJavaScript(probeKey: string, probe: WebApiProbe): string {
  const stateVar = `__psWenProbe_${probeKey.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const requestInit = {
    method: probe.request.method,
    credentials: 'include',
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
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for Safari probe state ${stateVar}`);
}

function summarizeJsonShape(value: unknown, depth = 0): unknown {
  if (depth > 2) {
    if (Array.isArray(value)) return { type: 'array', length: value.length };
    if (value && typeof value === 'object') return { type: 'object', keysCount: Object.keys(value as Record<string, unknown>).length };
    if (typeof value === 'string') return `<string:${value.length}>`;
    if (typeof value === 'number') return 'number';
    return typeof value;
  }

  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      itemShape: value.length > 0 ? summarizeJsonShape(value[0], depth + 1) : null
    };
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const looksLikeDynamicMap = keys.length >= 8 && keys.every((key) => /^[A-F0-9]{6,}$/i.test(key));
    if (looksLikeDynamicMap) {
      return {
        type: 'object',
        keysCount: keys.length,
        valueShape: keys.length > 0 ? summarizeJsonShape(obj[keys[0]], depth + 1) : null
      };
    }

    return Object.fromEntries(
      keys.map((key) => {
        const nested = obj[key];
        if (['handle', 'avatar_url_medium', 'encrypted_id', 'userId'].includes(key)) {
          return [key, '<redacted>'];
        }
        return [key, summarizeJsonShape(nested, depth + 1)];
      })
    );
  }

  if (typeof value === 'string') {
    return `<string:${value.length}>`;
  }

  if (typeof value === 'number') {
    return 'number';
  }

  return value;
}

function summarizeBody(body: string | undefined) {
  if (!body) return { kind: 'empty' };
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ message?: string }> };
    return {
      kind: 'json',
      errorMessages: parsed.errors?.map((error) => error.message ?? '(no message)') ?? [],
      shape: summarizeJsonShape(parsed)
    };
  } catch {
    return {
      kind: 'text',
      sample: body.slice(0, 500)
    };
  }
}

async function executeProbe(probe: WebApiProbe) {
  const tabIndex = await findSafariTabIndex(probe.preferredOrigins);
  const probeKey = probe.id.replace(/[^a-zA-Z0-9_]/g, '_');
  const stateVar = `__psWenProbe_${probeKey}`;
  await runJavaScriptInSafariTab(tabIndex, buildProbeJavaScript(probeKey, probe));
  const result = await pollProbe(tabIndex, stateVar);

  return {
    id: probe.id,
    kind: probe.kind,
    notes: probe.notes,
    tabIndex,
    request: {
      url: probe.request.url,
      method: probe.request.method,
      headers: Object.keys(probe.request.headers ?? {}).sort(),
      hasBody: Boolean(probe.request.body)
    },
    response: {
      status: result.status,
      ok: result.ok ?? false,
      code: result.code ?? null,
      url: result.url ?? probe.request.url,
      contentType: result.contentType ?? null,
      error: result.error ?? null,
      summary: summarizeBody(result.body)
    },
    rawBody: result.body ?? null
  };
}

async function writeReport(report: unknown, outputPath = DEFAULT_OUT) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function cmdList() {
  for (const probe of PLAYSTATION_WEB_API_PROBES) {
    console.log(`${probe.id} [${probe.kind}]`);
    console.log(`  ${probe.notes}`);
  }
}

async function cmdCall(id: string) {
  const probe = getWebApiProbe(id);
  if (!probe) throw new Error(`Unknown probe id: ${id}`);
  const result = await executeProbe(probe);
  const outputPath = await writeReport({ generatedAt: new Date().toISOString(), results: [result] });
  console.log(`Wrote ${outputPath}`);
  console.log(JSON.stringify(result.response, null, 2));
}

async function cmdProbe() {
  const results = [];
  for (const probe of PLAYSTATION_WEB_API_PROBES) {
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
          hasBody: Boolean(probe.request.body)
        },
        response: {
          status: 'error',
          ok: false,
          code: null,
          url: probe.request.url,
          contentType: null,
          error: error instanceof Error ? error.message : String(error),
          summary: null
        },
        rawBody: null
      });
    }
  }

  const outputPath = await writeReport({ generatedAt: new Date().toISOString(), results });
  console.log(`Wrote ${outputPath}`);
  for (const result of results) {
    console.log(`- ${result.id}: ${result.response.status} ${result.response.code ?? ''}`.trim());
  }
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (!command) usage();

  if (command === 'list') return cmdList();
  if (command === 'call') {
    if (!arg) usage();
    return cmdCall(arg);
  }
  if (command === 'probe') return cmdProbe();

  usage();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
