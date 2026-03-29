import { loadEnv, resolveArtifactPath } from '../lib/env.js';
import {
  defaultPlaystationPlusInstallRoot,
  defaultPlaystationPlusRoamingProfileDir,
  defaultPlaystationPlusSettingsDir,
  writePlaystationPlusPcAuthSummary
} from '../lib/playstation-plus-pc.js';

const env = loadEnv();
const installRoot = process.argv[2] ?? env.PLAYSTATION_PLUS_INSTALL_ROOT ?? defaultPlaystationPlusInstallRoot();
const settingsDir = process.argv[3] ?? env.PLAYSTATION_PLUS_SETTINGS_DIR ?? defaultPlaystationPlusSettingsDir();
const roamingProfileDir =
  process.argv[4] ?? env.PLAYSTATION_PLUS_PROFILE_DIR ?? defaultPlaystationPlusRoamingProfileDir();
const outputPath = resolveArtifactPath(process.argv[5], 'artifacts/auth/playstation-plus-pc-auth-summary.json');

async function main() {
  const { summary } = await writePlaystationPlusPcAuthSummary({
    installRoot,
    settingsDir,
    roamingProfileDir,
    outputPath
  });

  console.log(`Wrote ${outputPath}`);
  console.log(`Likely signed in: ${summary.likelySignedIn}`);
  console.log(`Current app URL: ${summary.currentAppUrl ?? 'not detected'}`);
  console.log(`IndexedDB origins: ${summary.indexedDbOrigins.join(', ') || 'none'}`);
  console.log(`Cached auth redirects: ${summary.cachedAuthRedirects.map((item) => item.kind).join(', ') || 'none'}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
