import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveArtifactPath } from '../lib/env.js';

type SafariSummaryArtifact = {
  summaries: Array<{
    title: string;
    url: string;
    summary: {
      sampleResourceUrls?: string[];
    };
  }>;
};

const TEXT_EXTENSIONS = ['.js', '.json', '.css'];
const SEARCH_TERMS = [
  'web.np.playstation.com',
  'web-toolbar.playstation.com',
  'io.playstation.com',
  'telemetry.api.playstation.com',
  'queryOracleUserProfileFullSubscription',
  'getProfileOracle',
  'getCartItemCount',
  'getPurchasedGameList',
  'storeRetrieveWishlist',
  'wcaPlatformVariantsRetrive',
  'webCheckoutCartRetrieve',
  'psDirectCartRetrieve',
  'oracleUserProfileRetrieve',
  'userProfilesRetrieve',
  'userPresenceRetrieve',
  'storeWishlistSecure',
  'variantsForPlatformRetrieve',
  'purchasedTitlesRetrieve',
  'gpdcUser',
  'chimera-',
  'pdcws2',
  'pdcsi',
  'userinfo',
  'session',
  'cloud',
  'stream',
  'premium',
  'subscription',
  '@sie-ppr-web-store/app@'
];

function isInterestingAsset(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)playstation\.com$|(^|\.)playstation\.net$|(^|\.)sony\.com$/i.test(parsed.hostname)) {
      return false;
    }
    return TEXT_EXTENSIONS.some((extension) => parsed.pathname.endsWith(extension));
  } catch {
    return false;
  }
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'ps-wen web-asset inventory/0.1'
    }
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
    text
  };
}

async function main() {
  const inputPath = resolveArtifactPath(process.argv[2], 'artifacts/auth/safari-session-summary.json');
  const outputPath = resolveArtifactPath(process.argv[3], 'artifacts/public/playstation-web-asset-inventory.json');

  const artifact = JSON.parse(await fs.readFile(inputPath, 'utf8')) as SafariSummaryArtifact;
  const urls = [...new Set(artifact.summaries.flatMap((entry) => entry.summary.sampleResourceUrls ?? []))].filter(isInterestingAsset);

  const assets = [] as Array<{
    url: string;
    ok: boolean;
    status: number;
    contentType: string | null;
    size: number;
    hitTerms: string[];
    appVersionMatches: string[];
    graphqlOperationMatches: string[];
    sampleHostnames: string[];
  }>;

  const globalHits = new Map<string, string[]>();
  for (const term of SEARCH_TERMS) globalHits.set(term, []);

  for (const url of urls) {
    try {
      const result = await fetchText(url);
      const hitTerms = SEARCH_TERMS.filter((term) => result.text.toLowerCase().includes(term.toLowerCase()));
      for (const term of hitTerms) {
        globalHits.get(term)!.push(url);
      }

      const appVersionMatches = [...new Set(result.text.match(/@sie-ppr-[a-z0-9-]+\/[a-z-]+@[0-9]+\.[0-9]+\.[0-9]+/gi) ?? [])].slice(0, 20);
      const graphqlOperationMatches = [...new Set(result.text.match(/\b(?:get|query|store|wca)[A-Z][A-Za-z0-9_]+\b/g) ?? [])]
        .filter((value) => /Oracle|Wishlist|Purchased|Cart|Variants|Profile|Subscription/i.test(value))
        .slice(0, 40);
      const sampleHostnames = [...new Set(Array.from(result.text.matchAll(/https?:\/\/([^/'"`\s]+)/g), (match) => match[1]))]
        .filter((hostname) => /playstation|sony/i.test(hostname))
        .slice(0, 30);

      assets.push({
        url,
        ok: result.ok,
        status: result.status,
        contentType: result.contentType,
        size: result.text.length,
        hitTerms,
        appVersionMatches,
        graphqlOperationMatches,
        sampleHostnames
      });
    } catch (error) {
      assets.push({
        url,
        ok: false,
        status: 0,
        contentType: null,
        size: 0,
        hitTerms: [],
        appVersionMatches: [],
        graphqlOperationMatches: [],
        sampleHostnames: []
      });
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    source: inputPath,
    assetCount: assets.length,
    assets,
    globalHits: Object.fromEntries(
      [...globalHits.entries()].map(([term, hitUrls]) => [term, [...new Set(hitUrls)].sort()]).filter(([, hitUrls]) => hitUrls.length > 0)
    )
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
  console.log(`Assets inspected: ${assets.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
