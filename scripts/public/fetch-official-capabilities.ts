import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { loadEnv, toBoolean } from '../lib/env.js';
import { PUBLIC_SOURCES } from '../lib/sources.js';

type SourceResult = {
  id: string;
  url: string;
  finalUrl?: string;
  purpose: string;
  tags: string[];
  fetchedAt: string;
  ok: boolean;
  status?: number;
  title?: string;
  capabilitySignals: string[];
  textSample?: string;
  error?: string;
};

const env = loadEnv();
const saveHtml = toBoolean(env.SAVE_HTML, true);
const rootArtifacts = path.resolve(process.cwd(), 'artifacts');
const rawDir = path.join(rootArtifacts, 'raw');
const outputPath = path.join(rootArtifacts, 'official-capabilities.json');

function extractSignals(text: string): string[] {
  const checks: Array<[RegExp, string]> = [
    [/(?:minimum|at least|speed of)\D{0,20}5\s*(?:mbps|mb\/s)/i, 'mentions 5 Mbps minimum'],
    [/15\s*(?:mbps|mb\/s)/i, 'mentions 15 Mbps guidance'],
    [/cloud streaming/i, 'mentions cloud streaming'],
    [/playstation plus premium/i, 'mentions PS Plus Premium'],
    [/1080p/i, 'mentions 1080p'],
    [/4k/i, 'mentions 4K'],
    [/hdr/i, 'mentions HDR'],
    [/playstation portal/i, 'mentions PlayStation Portal'],
    [/pc/i, 'mentions PC'],
    [/remote play/i, 'mentions Remote Play']
  ];

  return checks.filter(([regex]) => regex.test(text)).map(([, label]) => label);
}

function sanitizeSample(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function main() {
  await fs.mkdir(rawDir, { recursive: true });

  const results: SourceResult[] = [];

  for (const source of PUBLIC_SOURCES) {
    const fetchedAt = new Date().toISOString();

    try {
      const response = await fetch(source.url, {
        redirect: 'follow',
        headers: {
          'user-agent': 'ps-wen research bot/0.1 (+local capability collection)'
        }
      });

      const html = await response.text();
      const filePath = path.join(rawDir, `${source.id}.html`);
      if (saveHtml) {
        await fs.writeFile(filePath, html, 'utf8');
      }

      const $ = cheerio.load(html);
      const text = $('body').text();
      const title = $('title').first().text().trim() || undefined;
      const capabilitySignals = extractSignals(text);

      results.push({
        id: source.id,
        url: source.url,
        finalUrl: response.url,
        purpose: source.purpose,
        tags: source.tags,
        fetchedAt,
        ok: response.ok,
        status: response.status,
        title,
        capabilitySignals,
        textSample: sanitizeSample(text)
      });
    } catch (error) {
      results.push({
        id: source.id,
        url: source.url,
        purpose: source.purpose,
        tags: source.tags,
        fetchedAt,
        ok: false,
        capabilitySignals: [],
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await fs.writeFile(
    outputPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
    'utf8'
  );

  console.log(`Wrote ${outputPath}`);
  for (const result of results) {
    const summary = result.error
      ? `ERROR :: ${result.error}`
      : `${result.status ?? 'n/a'} ${result.title ?? '(no title)'} :: ${result.capabilitySignals.join(', ') || 'no signals found'}`;
    console.log(`- ${result.id}: ${summary}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
