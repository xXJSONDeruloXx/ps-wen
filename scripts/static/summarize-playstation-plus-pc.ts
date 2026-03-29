import { loadEnv, resolveArtifactPath } from '../lib/env.js';
import {
  defaultPlaystationPlusInstallRoot,
  defaultPlaystationPlusRoamingProfileDir,
  defaultPlaystationPlusSettingsDir,
  writePlaystationPlusPcSurfaceSummary
} from '../lib/playstation-plus-pc.js';

const env = loadEnv();
const installRoot = process.argv[2] ?? env.PLAYSTATION_PLUS_INSTALL_ROOT ?? defaultPlaystationPlusInstallRoot();
const settingsDir = process.argv[3] ?? env.PLAYSTATION_PLUS_SETTINGS_DIR ?? defaultPlaystationPlusSettingsDir();
const roamingProfileDir =
  process.argv[4] ?? env.PLAYSTATION_PLUS_PROFILE_DIR ?? defaultPlaystationPlusRoamingProfileDir();
const outputPath = resolveArtifactPath(process.argv[5], 'artifacts/static/playstation-plus-pc-surface.json');

async function main() {
  const { summary } = await writePlaystationPlusPcSurfaceSummary({
    installRoot,
    settingsDir,
    roamingProfileDir,
    outputPath
  });

  console.log(`Wrote ${outputPath}`);
  console.log(`Shell package: ${summary.shell.packageName ?? 'unknown'} ${summary.shell.packageVersion ?? ''}`.trim());
  console.log(`Runtime version: ${summary.shell.runtimeVersion ?? 'unknown'}`);
  console.log(`Current app URL: ${summary.shell.currentAppUrl ?? 'not detected'}`);
  console.log(`Local IPC: ws://${summary.ipc.localWebSocket.host}:${summary.ipc.localWebSocket.port}/`);
  console.log(`Roaming IndexedDB origins: ${summary.storage.roamingProfile.browserProfile.indexedDbOrigins.join(', ') || 'none'}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
