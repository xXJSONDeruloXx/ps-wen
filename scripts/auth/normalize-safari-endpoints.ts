import fs from 'node:fs/promises';
import { resolveArtifactPath } from '../lib/env.js';
import { summarizeSafariEndpoints, type SafariSummaryArtifact } from '../lib/safari-endpoints.js';

async function main() {
  const inputPath = resolveArtifactPath(process.argv[2], 'artifacts/auth/safari-session-summary.json');
  const outputPath = resolveArtifactPath(process.argv[3], 'artifacts/auth/safari-endpoint-report.json');
  const artifact = JSON.parse(await fs.readFile(inputPath, 'utf8')) as SafariSummaryArtifact;

  const result = {
    generatedAt: new Date().toISOString(),
    source: inputPath,
    ...summarizeSafariEndpoints(artifact)
  };

  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
  console.log(`Unique hostnames: ${result.uniqueHostnames.length}`);
  console.log(`GraphQL operations: ${result.graphqlOperations.join(', ') || '(none)'}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
