import fs from 'node:fs/promises';
import { resolveArtifactPath } from '../lib/env.js';
import { summarizeProbeReport, type ProbeReportResult } from '../lib/playstation-web-probe.js';

async function main() {
  const inputPath = resolveArtifactPath(process.argv[2], 'artifacts/api/playstation-web-probe-report.json');
  const outputPath = resolveArtifactPath(process.argv[3], 'artifacts/api/playstation-web-probe-summary.json');
  const artifact = JSON.parse(await fs.readFile(inputPath, 'utf8')) as { generatedAt: string; results: ProbeReportResult[] };

  const result = {
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: artifact.generatedAt,
    source: inputPath,
    ...summarizeProbeReport(artifact.results)
  };

  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
  console.log(JSON.stringify(result.counts, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
