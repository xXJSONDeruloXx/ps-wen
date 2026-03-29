import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as asar from '@electron/asar';
import { loadEnv } from '../lib/env.js';

const env = loadEnv();
const inputPath = process.argv[2] ?? env.OFFICIAL_PC_APP_BUNDLE;

const TEXT_EXTENSIONS = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.json',
  '.html',
  '.txt',
  '.ts',
  '.tsx',
  '.jsx',
  '.css',
  '.xml',
  '.yml',
  '.yaml'
]);

const KEYWORDS = ['kamaji', 'oauth', 'token', 'cloud', 'stream', 'webrtc', 'stun', 'turn', 'srtp', 'quic', 'portal', 'dualsense'];

async function ensureInput(): Promise<string> {
  if (!inputPath) {
    throw new Error('Provide a path to an official client bundle or directory: npm run inspect:bundle -- /path/to/app.asar');
  }

  return path.resolve(process.cwd(), inputPath);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(target: string): Promise<string | undefined> {
  try {
    const data = await fs.readFile(target);
    return crypto.createHash('sha256').update(data).digest('hex');
  } catch {
    return undefined;
  }
}

async function walk(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

function extractUrls(text: string): string[] {
  return Array.from(new Set(text.match(/https?:\/\/[^\s'"`<>]+/g) ?? []));
}

async function maybeReadText(filePath: string): Promise<string | undefined> {
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) return undefined;

  const stats = await fs.stat(filePath);
  if (stats.size > 256 * 1024) return undefined;

  return fs.readFile(filePath, 'utf8').catch(() => undefined);
}

async function materializeInput(resolvedInput: string): Promise<{ rootDir: string; cleanup?: () => Promise<void>; mode: string }> {
  const stats = await fs.stat(resolvedInput);
  if (stats.isDirectory()) {
    return { rootDir: resolvedInput, mode: 'directory' };
  }

  if (resolvedInput.endsWith('.asar')) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-wen-asar-'));
    asar.extractAll(resolvedInput, tempDir);
    return {
      rootDir: tempDir,
      mode: 'asar',
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  throw new Error(`Unsupported input: ${resolvedInput}. Provide a directory or .asar file.`);
}

async function main() {
  const resolvedInput = await ensureInput();
  if (!(await pathExists(resolvedInput))) {
    throw new Error(`Input does not exist: ${resolvedInput}`);
  }

  const { rootDir, cleanup, mode } = await materializeInput(resolvedInput);

  try {
    const files = await walk(rootDir);
    const extensionCounts = new Map<string, number>();
    const keywordHits = new Map<string, string[]>();
    const urls = new Set<string>();
    const hostnames = new Set<string>();

    for (const keyword of KEYWORDS) {
      keywordHits.set(keyword, []);
    }

    for (const file of files) {
      const ext = path.extname(file).toLowerCase() || '(no extension)';
      extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);

      const text = await maybeReadText(file);
      if (!text) continue;

      for (const url of extractUrls(text)) {
        urls.add(url);
        try {
          hostnames.add(new URL(url).hostname);
        } catch {
          // ignore malformed urls
        }
      }

      const relativePath = path.relative(rootDir, file);
      const lower = text.toLowerCase();
      for (const keyword of KEYWORDS) {
        if (lower.includes(keyword)) {
          const entries = keywordHits.get(keyword)!;
          if (entries.length < 25) {
            entries.push(relativePath);
          }
        }
      }
    }

    const outputDir = path.resolve(process.cwd(), 'artifacts/static');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${path.basename(resolvedInput).replace(/[^a-zA-Z0-9._-]+/g, '_')}-inventory.json`);

    const result = {
      generatedAt: new Date().toISOString(),
      input: resolvedInput,
      inputSha256: (await sha256File(resolvedInput)) ?? null,
      mode,
      fileCount: files.length,
      extensionCounts: Object.fromEntries([...extensionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      urls: [...urls].sort(),
      hostnames: [...hostnames].sort(),
      keywordHits: Object.fromEntries(keywordHits.entries())
    };

    await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${outputPath}`);
    console.log(`Files scanned: ${result.fileCount}`);
    console.log(`Hostnames found: ${result.hostnames.length}`);
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
