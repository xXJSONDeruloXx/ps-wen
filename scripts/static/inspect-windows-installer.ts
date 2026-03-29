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

function findOffsets(buffer: Buffer, needle: Buffer): number[] {
  const offsets: number[] = [];
  let start = 0;
  while (start < buffer.length) {
    const index = buffer.indexOf(needle, start);
    if (index === -1) break;
    offsets.push(index);
    start = index + 1;
  }
  return offsets;
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
    'WixBundleOriginalSource',
    'WixBundleName',
    'BootstrapperApplicationCreate',
    'WiX Toolset Bootstrapper',
    'burn',
    'Advanced Installer',
    'Caphyon',
    'AI_BOOTSTRAPPERLANGS',
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
  const wixBurnPresent = combinedStrings.some((value) => /wixbundleoriginalsource|bootstrapperapplicationcreate|wix toolset bootstrapper|\.wixburn/i.test(value));
  const advancedInstallerPresent = combinedStrings.some((value) => /advanced installer|caphyon|ai_bootstrapperlangs|advinst_/i.test(value));
  const sevenZipOffsets = findOffsets(buffer, Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]));
  const embeddedPayloadNames = unique(
    combinedStrings.flatMap((value) =>
      Array.from(
        value.matchAll(/(?:[A-Za-z0-9_.-]+\\)?[A-Za-z0-9_.-]+\.(?:7z|ini|exe|dll)/gi),
        (match) => match[0]
      )
    )
  )
    .filter((value) => /(PlayStationPlus|FILES\.7z|vcredist_x86\.exe|decoder\.dll|\b\d{4}\.dll\b)/i.test(value))
    .slice(0, 40);
  const bundleVariableNames = combinedStrings
    .filter((value) => /^(WixBundle|BundleVersion|BundleTag|DisplayName|burn\.)/i.test(value))
    .slice(0, 60);

  const result = {
    generatedAt: new Date().toISOString(),
    input: resolved,
    size: stat.size,
    sha256,
    fileInfo: fileInfo.stdout.trim(),
    versionMetadata,
    packagingHints: {
      wixBurnPresent,
      advancedInstallerPresent,
      nsisMagicPresent,
      hybridInterpretation:
        wixBurnPresent && advancedInstallerPresent
          ? 'Likely WiX Burn bootstrapper with Advanced Installer-branded/custom UX components.'
          : wixBurnPresent
            ? 'Likely WiX Burn bootstrapper.'
            : advancedInstallerPresent
              ? 'Likely Advanced Installer bootstrapper.'
              : 'Packaging technology not confidently identified.'
    },
    overlayHints: {
      sevenZipSawNsisMagic: nsisMagicPresent || Boolean(keywordHits['nsiS']?.length || keywordHits['NSIS']?.length || keywordHits['Nullsoft']?.length),
      sevenZipWarnings: sevenZipText.split('\n').filter((line) => /warning|error|data after the end of archive|crc/i.test(line)).slice(0, 20),
      sevenZipSignatureOffsets: sevenZipOffsets
    },
    urls,
    keywordHits: {
      ...keywordHits,
      nsiS: nsisMagicPresent ? ['raw-byte-signature-present'] : keywordHits['nsiS']
    },
    importedDlls: dllNames,
    embeddedPayloadNames,
    bundleVariableNames,
    notes: [
      'Installer metadata alone does not prove the runtime client stack.',
      'This installer appears to include WiX Burn-style bundle machinery plus Advanced Installer-branded UX/resources.',
      'Embedded payload-name strings indicate additional archives/executables exist inside the installer even if they are not trivially extracted on macOS.',
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
