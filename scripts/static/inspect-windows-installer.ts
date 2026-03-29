import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const input = process.argv[2];

function usage(): never {
  throw new Error('Usage: npm run inspect:installer -- /path/to/PlayStationPlus-12.5.0.exe');
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

function extractUtf16LeStrings(buffer: Buffer, minLength = 6): string[] {
  const results: string[] = [];
  let current = '';
  for (let i = 0; i < buffer.length - 1; i += 2) {
    const a = buffer[i];
    const b = buffer[i + 1];
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

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

async function runCommand(command: string, args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, stdout, stderr };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message: string };
    return { ok: false, stdout: err.stdout ?? '', stderr: err.stderr ?? '', error: err.message };
  }
}

async function main() {
  if (!input) usage();
  const resolved = path.resolve(process.cwd(), input);
  const stat = await fs.stat(resolved);
  const buffer = await fs.readFile(resolved);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const asciiStrings = extractAsciiStrings(buffer);
  const utf16Strings = extractUtf16LeStrings(buffer);
  const combinedStrings = unique([...asciiStrings, ...utf16Strings]);

  const urls = unique(
    combinedStrings.filter((value) => /^https?:\/\//i.test(value)).map((value) => value.replace(/\0+$/g, ''))
  ).slice(0, 300);

  const keywords = [
    'nsiS',
    'NSIS',
    'Nullsoft',
    'Chromium',
    'Media Internals',
    'Electron',
    'app.asar',
    'chrome_elf',
    'kamaji',
    'oauth',
    'psnow',
    'playstation.com',
    'auth.api.sonyentertainmentnetwork.com',
    'web.np.playstation.com',
    'webrtc',
    'stun',
    'turn',
    'quic',
    'widevine',
    'playready',
    'dualsense'
  ];

  const keywordHits = Object.fromEntries(
    keywords.map((keyword) => [
      keyword,
      combinedStrings.filter((value) => value.toLowerCase().includes(keyword.toLowerCase())).slice(0, 20)
    ])
  );

  const fileInfo = await runCommand('file', [resolved]);
  const sevenZip = await runCommand('7z', ['l', resolved]);
  const objdump = await runCommand('objdump', ['-x', resolved]);

  const sevenZipText = `${sevenZip.stdout}\n${sevenZip.stderr}`;
  const versionMetadata: Record<string, string> = {};
  for (const key of ['CompanyName', 'FileDescription', 'FileVersion', 'ProductVersion', 'ProductName', 'OriginalFileName']) {
    const match = sevenZipText.match(new RegExp(`${key}:\\s*(.+)`));
    if (match) versionMetadata[key] = match[1].trim();
  }

  const dllNames = Array.from(objdump.stdout.matchAll(/DLL Name:\s+([^\r\n]+)/g)).map((match) => match[1]);

  const nsisMagicPresent = buffer.includes(Buffer.from('nsiS'));

  const result = {
    generatedAt: new Date().toISOString(),
    input: resolved,
    size: stat.size,
    sha256,
    fileInfo: fileInfo.stdout.trim(),
    versionMetadata,
    overlayHints: {
      sevenZipSawNsisMagic: nsisMagicPresent || Boolean(keywordHits['nsiS']?.length || keywordHits['NSIS']?.length || keywordHits['Nullsoft']?.length),
      sevenZipWarnings: sevenZipText.split('\n').filter((line) => /warning|error|data after the end of archive|crc/i.test(line)).slice(0, 20)
    },
    urls,
    keywordHits: {
      ...keywordHits,
      nsiS: nsisMagicPresent ? ['raw-byte-signature-present'] : keywordHits['nsiS']
    },
    importedDlls: dllNames,
    notes: [
      'Installer metadata alone does not prove the runtime client stack.',
      'Prefer installed-app inspection next if the goal is Electron/Chromium/client archaeology.'
    ]
  };

  const outDir = path.resolve(process.cwd(), 'artifacts/static');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${path.basename(resolved).replace(/[^a-zA-Z0-9._-]+/g, '_')}-installer.json`);
  await fs.writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
