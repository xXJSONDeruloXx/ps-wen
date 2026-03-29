import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveArtifactPath } from '../lib/env.js';
import { extractPlaystationPlusPcAppAssetSignals } from '../lib/playstation-plus-pc-assets.js';
import { PLAYSTATION_PLUS_PC_CODE_CACHE_ASSET_URLS } from '../../src/observations/playstation-plus-pc.js';

type PcSurfaceArtifact = {
  shell?: {
    currentAppUrl?: string | null;
  };
  storage?: {
    roamingProfile?: {
      browserProfile?: {
        codeCacheAssetUrls?: string[];
      };
    };
  };
};

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'ps-wen psnow-app-asset inventory/0.1'
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
  const surfaceSummaryPath = resolveArtifactPath(process.argv[2], 'artifacts/static/playstation-plus-pc-surface.json');
  const outputPath = resolveArtifactPath(process.argv[3], 'artifacts/public/playstation-plus-pc-app-asset-inventory.json');

  const surface = JSON.parse(await fs.readFile(surfaceSummaryPath, 'utf8')) as PcSurfaceArtifact;
  const assetUrls = [
    ...(surface.storage?.roamingProfile?.browserProfile?.codeCacheAssetUrls ?? []),
    ...PLAYSTATION_PLUS_PC_CODE_CACHE_ASSET_URLS
  ];
  const urls = [...new Set(assetUrls)].sort((left, right) => left.localeCompare(right));

  const assets = [] as Array<{
    url: string;
    ok: boolean;
    status: number;
    contentType: string | null;
    size: number;
    hostnames: string[];
    hitTerms: string[];
    kamajiPaths: string[];
    pcnowPaths: string[];
    apiPaths: string[];
    telemetryNamespaces: string[];
  }>;

  for (const url of urls) {
    try {
      const result = await fetchText(url);
      const signals = extractPlaystationPlusPcAppAssetSignals(result.text);
      assets.push({
        url,
        ok: result.ok,
        status: result.status,
        contentType: result.contentType,
        size: result.text.length,
        ...signals
      });
    } catch {
      assets.push({
        url,
        ok: false,
        status: 0,
        contentType: null,
        size: 0,
        hostnames: [],
        hitTerms: [],
        kamajiPaths: [],
        pcnowPaths: [],
        apiPaths: [],
        telemetryNamespaces: []
      });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sourceSurfaceSummary: surfaceSummaryPath,
    currentAppUrl: surface.shell?.currentAppUrl ?? null,
    assetCount: assets.length,
    assets
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
  console.log(`Assets inspected: ${assets.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
