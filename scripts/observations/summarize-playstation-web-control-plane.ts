import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveArtifactPath } from '../lib/env.js';
import {
  summarizePlaystationWebControlPlane,
  type AssetInventoryArtifact,
  type GraphqlDocumentReportArtifact,
  type ProbeReportArtifact,
  type ProbeSummaryArtifact,
  type SafariSessionSummaryArtifact
} from '../../src/observations/playstation-web-control-plane.js';

const DEFAULT_SAFARI_SESSION_SUMMARY = 'artifacts/auth/safari-session-summary.json';
const DEFAULT_PROBE_REPORT = 'artifacts/api/playstation-web-probe-report.json';
const DEFAULT_PROBE_SUMMARY = 'artifacts/api/playstation-web-probe-summary.json';
const DEFAULT_ASSET_INVENTORY = 'artifacts/public/playstation-web-asset-inventory.json';
const DEFAULT_GRAPHQL_DOCUMENT_REPORT = 'artifacts/public/playstation-graphql-document-report.json';
const DEFAULT_OUT = 'artifacts/observations/playstation-web-control-plane.json';

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

async function main() {
  const safariSessionSummaryPath = resolveArtifactPath(process.argv[2], DEFAULT_SAFARI_SESSION_SUMMARY);
  const probeReportPath = resolveArtifactPath(process.argv[3], DEFAULT_PROBE_REPORT);
  const probeSummaryPath = resolveArtifactPath(process.argv[4], DEFAULT_PROBE_SUMMARY);
  const assetInventoryPath = resolveArtifactPath(process.argv[5], DEFAULT_ASSET_INVENTORY);
  const graphqlDocumentReportPath = resolveArtifactPath(process.argv[6], DEFAULT_GRAPHQL_DOCUMENT_REPORT);
  const outputPath = resolveArtifactPath(process.argv[7], DEFAULT_OUT);

  const [safariSessionSummary, probeReport, probeSummary, assetInventory, graphqlDocumentReport] = await Promise.all([
    readJson<SafariSessionSummaryArtifact>(safariSessionSummaryPath),
    readJson<ProbeReportArtifact>(probeReportPath),
    readJson<ProbeSummaryArtifact>(probeSummaryPath),
    readJson<AssetInventoryArtifact>(assetInventoryPath),
    readJson<GraphqlDocumentReportArtifact>(graphqlDocumentReportPath)
  ]);

  const snapshot = summarizePlaystationWebControlPlane({
    safariSessionSummary,
    probeReport,
    probeSummary,
    assetInventory,
    graphqlDocumentReport
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${outputPath}`);
  console.log(
    JSON.stringify(
      Object.fromEntries(Object.entries(snapshot.capabilities).map(([key, value]) => [key, value.status])),
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
