import fs from 'node:fs/promises';
import path from 'node:path';

export type CookieRecord = {
  name: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};

export type StorageStateFile = {
  cookies: CookieRecord[];
  origins?: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

export type ManualDump = {
  generatedAt: string;
  detectedSignInCompletion: boolean;
  currentUrl: string;
  pages: Array<{ url: string; title: string | null }>;
  sonyCookieCount: number;
  authLikeCookieNames?: string[];
  signInPromptVisible?: boolean;
  originStorage?: Record<
    string,
    {
      localStorage: Record<string, string>;
      sessionStorage: Record<string, string>;
    }
  >;
};

const AUTH_COOKIE_RE = /kp_|token|sess|auth|login|sid|npsso|refresh/i;
const SONY_DOMAIN_RE = /sony|playstation/i;

export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return rawUrl;
  }
}

export function summarizeAuthArtifacts(storageState: StorageStateFile, dump: ManualDump) {
  const cookieDomainMap = new Map<string, CookieRecord[]>();
  for (const cookie of storageState.cookies) {
    const list = cookieDomainMap.get(cookie.domain) ?? [];
    list.push(cookie);
    cookieDomainMap.set(cookie.domain, list);
  }

  const domainSummaries = [...cookieDomainMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([domain, cookies]) => ({
      domain,
      count: cookies.length,
      names: cookies.map((cookie) => cookie.name).sort(),
      authLikeNames: cookies
        .filter((cookie) => AUTH_COOKIE_RE.test(cookie.name) || /my\.account\.sony\.com/i.test(cookie.domain))
        .map((cookie) => cookie.name)
        .sort(),
      secureCount: cookies.filter((cookie) => cookie.secure).length,
      httpOnlyCount: cookies.filter((cookie) => cookie.httpOnly).length
    }));

  const originStorageSummary = Object.fromEntries(
    Object.entries(dump.originStorage ?? {}).map(([origin, storage]) => [
      origin,
      {
        localStorageKeys: Object.keys(storage.localStorage).sort(),
        sessionStorageKeys: Object.keys(storage.sessionStorage).sort()
      }
    ])
  );

  const currentUrl = redactUrl(dump.currentUrl);
  const currentUrlLower = currentUrl.toLowerCase();
  const onSigninSurface = /my\.account\.sony\.com\/sonyacct\/signin|\/signin\b|error=login_required/.test(
    dump.currentUrl.toLowerCase()
  );
  const likelySignedIn =
    !onSigninSurface &&
    !Boolean(dump.signInPromptVisible) &&
    storageState.cookies.some(
      (cookie) =>
        SONY_DOMAIN_RE.test(cookie.domain) &&
        (AUTH_COOKIE_RE.test(cookie.name) || /my\.account\.sony\.com/i.test(cookie.domain))
    );

  return {
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: dump.generatedAt,
    currentUrl,
    pageUrls: dump.pages.map((page) => ({ url: redactUrl(page.url), title: page.title })),
    sonyCookieCount: dump.sonyCookieCount,
    signInPromptVisible: Boolean(dump.signInPromptVisible),
    onSigninSurface,
    likelySignedIn,
    authLikeCookieNames: (dump.authLikeCookieNames ?? []).sort(),
    cookieDomains: domainSummaries,
    originStorage: originStorageSummary
  };
}

export async function writeAuthSummary({
  storageStatePath,
  dumpPath,
  outputPath
}: {
  storageStatePath: string;
  dumpPath: string;
  outputPath: string;
}) {
  const storageState = JSON.parse(await fs.readFile(storageStatePath, 'utf8')) as StorageStateFile;
  const dump = JSON.parse(await fs.readFile(dumpPath, 'utf8')) as ManualDump;
  const summary = summarizeAuthArtifacts(storageState, dump);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return summary;
}
