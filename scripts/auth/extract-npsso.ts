import { loadEnv, resolveArtifactPath } from '../lib/env.js';
import { readNpssoFromStorageState } from '../lib/psn-auth.js';

const env = loadEnv();

function parseArgs(argv: string[]) {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineVal] = token.slice(2).split('=', 2);
    if (inlineVal !== undefined) {
      flags[rawKey] = inlineVal;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags[rawKey] = true;
      continue;
    }
    flags[rawKey] = next;
    i++;
  }
  return flags;
}

function mask(value: string) {
  if (!value) return '(missing)';
  if (value.length <= 12) return `${value.slice(0, 4)}...${value.slice(-2)}`;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const storageStatePath = resolveArtifactPath(
    typeof flags['storage-state'] === 'string'
      ? flags['storage-state']
      : env.PSN_STORAGE_STATE,
    'artifacts/auth/playstation-storage-state.json'
  );
  const show = Boolean(flags.show);
  const asJson = Boolean(flags.json);

  let npsso = '';
  try {
    npsso = await readNpssoFromStorageState(storageStatePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read storage-state at ${storageStatePath}: ${message}`);
  }
  const result = {
    storageStatePath,
    found: Boolean(npsso),
    length: npsso.length,
    preview: mask(npsso),
    value: show ? npsso : undefined,
    note: npsso
      ? 'NPSSO was found in Playwright storage-state. You can feed it to PSN_NPSSO or --npsso.'
      : 'No NPSSO cookie found in storage-state. Complete a browser login first.',
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`[extract-npsso] storage-state : ${result.storageStatePath}`);
  console.log(`[extract-npsso] found         : ${result.found}`);
  console.log(`[extract-npsso] length        : ${result.length}`);
  console.log(`[extract-npsso] preview       : ${result.preview}`);
  if (show && npsso) {
    console.log(`[extract-npsso] value         : ${npsso}`);
  }
  console.log(`[extract-npsso] note          : ${result.note}`);
}

main().catch((error) => {
  console.error('[extract-npsso] Error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
