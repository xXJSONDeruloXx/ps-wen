import fs from 'node:fs/promises';
import { resolveArtifactPath } from '../lib/env.js';

type SafariSummaryArtifact = {
  summaries: Array<{
    title: string;
    url: string;
    summary: {
      resourceHostnames?: string[];
      sampleResourceUrls?: string[];
    };
  }>;
};

function normalizeUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const queryKeys = [...url.searchParams.keys()].sort();
    const operationName = url.searchParams.get('operationName') ?? undefined;
    return {
      origin: url.origin,
      path: url.pathname,
      queryKeys,
      operationName
    };
  } catch {
    return null;
  }
}

async function main() {
  const inputPath = resolveArtifactPath(process.argv[2], 'artifacts/auth/safari-session-summary.json');
  const outputPath = resolveArtifactPath(process.argv[3], 'artifacts/auth/safari-endpoint-report.json');
  const artifact = JSON.parse(await fs.readFile(inputPath, 'utf8')) as SafariSummaryArtifact;

  const byTab = artifact.summaries.map((entry) => {
    const normalized = (entry.summary.sampleResourceUrls ?? [])
      .map(normalizeUrl)
      .filter((value): value is NonNullable<typeof value> => value !== null);

    return {
      title: entry.title,
      pageUrl: entry.url,
      resourceHostnames: entry.summary.resourceHostnames ?? [],
      normalizedEndpoints: normalized,
      graphqlOperations: [...new Set(normalized.map((item) => item.operationName).filter(Boolean))].sort(),
      uniquePaths: [...new Set(normalized.map((item) => `${item.origin}${item.path}`))].sort()
    };
  });

  const allEndpoints = byTab.flatMap((entry) => entry.normalizedEndpoints);
  const result = {
    generatedAt: new Date().toISOString(),
    source: inputPath,
    tabs: byTab,
    uniqueHostnames: [...new Set(byTab.flatMap((entry) => entry.resourceHostnames))].sort(),
    graphqlOperations: [...new Set(allEndpoints.map((entry) => entry.operationName).filter(Boolean))].sort(),
    uniquePaths: [...new Set(allEndpoints.map((entry) => `${entry.origin}${entry.path}`))].sort()
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
