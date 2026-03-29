import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveArtifactPath } from '../lib/env.js';
import { correlateGraphqlDocuments, extractGraphqlDocumentsFromAssetText, type ProbeReportLike } from '../lib/playstation-graphql-documents.js';

type AssetInventoryArtifact = {
  assets: Array<{
    url: string;
    ok: boolean;
    status: number;
    contentType: string | null;
    graphqlOperationMatches?: string[];
  }>;
};

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'ps-wen graphql-doc extraction/0.1'
    }
  });

  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
    text: await response.text()
  };
}

async function main() {
  const assetInventoryPath = resolveArtifactPath(process.argv[2], 'artifacts/public/playstation-web-asset-inventory.json');
  const probeReportPath = resolveArtifactPath(process.argv[3], 'artifacts/api/playstation-web-probe-report.json');
  const outputPath = resolveArtifactPath(process.argv[4], 'artifacts/public/playstation-graphql-document-report.json');

  const assetInventory = JSON.parse(await fs.readFile(assetInventoryPath, 'utf8')) as AssetInventoryArtifact;
  const probeReport = JSON.parse(await fs.readFile(probeReportPath, 'utf8')) as ProbeReportLike;

  const candidateAssets = assetInventory.assets.filter(
    (asset) => asset.ok && asset.status === 200 && (asset.graphqlOperationMatches?.length ?? 0) > 0 && asset.url.endsWith('.js')
  );

  const documentsBySourceUrl: Record<string, ReturnType<typeof extractGraphqlDocumentsFromAssetText>> = {};
  const assetFetches = [] as Array<{
    url: string;
    ok: boolean;
    status: number;
    contentType: string | null;
    documentCount: number;
  }>;

  for (const asset of candidateAssets) {
    try {
      const result = await fetchText(asset.url);
      const documents = result.ok ? extractGraphqlDocumentsFromAssetText(result.text) : [];
      if (documents.length > 0) {
        documentsBySourceUrl[asset.url] = documents;
      }

      assetFetches.push({
        url: asset.url,
        ok: result.ok,
        status: result.status,
        contentType: result.contentType,
        documentCount: documents.length
      });
    } catch {
      assetFetches.push({
        url: asset.url,
        ok: false,
        status: 0,
        contentType: null,
        documentCount: 0
      });
    }
  }

  const correlation = correlateGraphqlDocuments({ documentsBySourceUrl, probeReport });
  const output = {
    generatedAt: new Date().toISOString(),
    sources: {
      assetInventory: assetInventoryPath,
      probeReport: probeReportPath
    },
    assetsInspected: assetFetches.length,
    assetFetches,
    documentsBySourceUrl,
    ...correlation
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
  console.log(JSON.stringify(output.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
