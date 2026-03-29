import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveArtifactPath } from '../lib/env.js';
import { extractPlaystationPlusPcApolloSummary } from '../lib/playstation-plus-pc-apollo.js';

async function main() {
  const inputPath = resolveArtifactPath(process.argv[2], 'artifacts/public/psnow-app/apollo.js');
  const outputPath = resolveArtifactPath(process.argv[3], 'artifacts/public/playstation-plus-pc-apollo-summary.json');

  const text = await fs.readFile(inputPath, 'utf8');
  const summary = extractPlaystationPlusPcApolloSummary(text);

  const output = {
    generatedAt: new Date().toISOString(),
    source: inputPath,
    ...summary
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
  console.log(`Kamaji paths: ${summary.pcSpecificKamajiPaths.length}`);
  console.log(`Account templates: ${summary.accountApiTemplates.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
