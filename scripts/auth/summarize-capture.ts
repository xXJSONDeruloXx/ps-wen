import { resolveArtifactPath } from '../lib/env.js';
import { writeAuthSummary } from '../lib/auth-summary.js';

const storageStatePath = resolveArtifactPath(process.argv[2], 'artifacts/auth/playstation-storage-state.json');
const dumpPath = resolveArtifactPath(process.argv[3], 'artifacts/auth/manual-login-dump.json');
const outputPath = resolveArtifactPath(process.argv[4], 'artifacts/auth/playstation-auth-summary.json');

async function main() {
  const summary = await writeAuthSummary({ storageStatePath, dumpPath, outputPath });
  console.log(`Wrote ${outputPath}`);
  console.log(`Current URL: ${summary.currentUrl}`);
  console.log(`Likely signed in: ${summary.likelySignedIn}`);
  console.log(`On sign-in surface: ${summary.onSigninSurface}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
