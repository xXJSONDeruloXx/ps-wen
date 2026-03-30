import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { loadEnv, resolveArtifactPath } from '../lib/env.js';
import { writeAuthSummary } from '../lib/auth-summary.js';

const env = loadEnv();
const loginUrl = env.PSN_LOGIN_URL || 'https://web.np.playstation.com/api/session/v1/signin?redirect_uri=https%3A%2F%2Fstore.playstation.com%2F';
const storageStatePath = resolveArtifactPath(env.PSN_STORAGE_STATE, 'artifacts/auth/playstation-storage-state.json');
const dumpPath = resolveArtifactPath(undefined, 'artifacts/auth/manual-login-dump.json');
const screenshotPath = resolveArtifactPath(undefined, 'artifacts/auth/manual-login-final.png');
const waitSeconds = Number(process.env.MANUAL_AUTH_WAIT_SECONDS || '300');
const timeoutMs = waitSeconds * 1000;
const autoClose = !['0', 'false', 'no', 'off'].includes((process.env.MANUAL_AUTH_AUTO_CLOSE || 'false').toLowerCase());

async function ensureParent(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function prefillEmail(page: Page, email: string | undefined) {
  if (!email) return;
  const selectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="loginID"]',
    'input[id*="signInId"]'
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 2_000 });
      await locator.click();
      await locator.fill(email);
      break;
    } catch {
      // ignore and try next selector
    }
  }
}

async function gatherOriginStorage(context: BrowserContext) {
  const origins = new Map<string, { localStorage: Record<string, string>; sessionStorage: Record<string, string> }>();

  for (const page of context.pages()) {
    if (page.isClosed()) continue;
    const url = page.url();
    if (!url.startsWith('http')) continue;

    try {
      const origin = new URL(url).origin;
      if (origins.has(origin)) continue;
      const storage = await page.evaluate(() => ({
        localStorage: Object.fromEntries(Array.from({ length: window.localStorage.length }, (_, i) => {
          const key = window.localStorage.key(i)!;
          return [key, window.localStorage.getItem(key) ?? ''];
        })),
        sessionStorage: Object.fromEntries(Array.from({ length: window.sessionStorage.length }, (_, i) => {
          const key = window.sessionStorage.key(i)!;
          return [key, window.sessionStorage.getItem(key) ?? ''];
        }))
      }));
      origins.set(origin, storage);
    } catch {
      // cross-origin or page not ready; skip
    }
  }

  return Object.fromEntries(origins.entries());
}

async function main() {
  await ensureParent(storageStatePath);
  await ensureParent(dumpPath);
  await ensureParent(screenshotPath);

  const browser = await chromium.launch({ headless: false, channel: 'chromium' });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('[ps-wen] Opening headed PlayStation login flow');
  console.log(`[ps-wen] Login URL: ${loginUrl}`);
  console.log('[ps-wen] Complete sign-in in the browser window.');
  console.log(`[ps-wen] Leave the browser on a post-login page. Capture will occur after up to ${waitSeconds} seconds, or sooner on a stronger auth signal.`);
  console.log(`[ps-wen] Browser auto-close is ${autoClose ? 'enabled' : 'disabled'} for this run.`);

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await prefillEmail(page, env.PSN_EMAIL);

  const startedAt = Date.now();
  let detected = false;

  while (Date.now() - startedAt < timeoutMs) {
    const cookies = await context.cookies();
    const sonyCookies = cookies.filter((cookie) => /sony|playstation/i.test(cookie.domain));
    const authLikeCookies = cookies.filter(
      (cookie) => /my\.account\.sony\.com/i.test(cookie.domain) || /kp_|token|sess|auth|login/i.test(cookie.name)
    );
    const currentUrl = page.url();
    const currentUrlLower = currentUrl.toLowerCase();
    const onSigninSurface = /my\.account\.sony\.com\/sonyacct\/signin|\/signin\b|error=login_required/.test(currentUrlLower);
    const offSignin = !onSigninSurface;
    let bodyText = '';
    try {
      bodyText = await page.locator('body').innerText({ timeout: 1_000 });
    } catch {
      bodyText = '';
    }
    const hasSigninPrompt = /sign in to your psn account|create psn account|sign in to playstation/i.test(bodyText);
    const onKnownPostLoginHost = /store\.playstation\.com|www\.playstation\.com|io\.playstation\.com|web\.np\.playstation\.com/.test(
      currentUrlLower
    );
    const strongSignal = authLikeCookies.length > 0 && offSignin && onKnownPostLoginHost && !hasSigninPrompt;

    if (strongSignal || (sonyCookies.length > 0 && offSignin && onKnownPostLoginHost && !hasSigninPrompt)) {
      detected = true;
      break;
    }

    await page.waitForTimeout(2_000);
  }

  const cookies = await context.cookies();
  const pages = context.pages().map((p) => ({ url: p.url(), title: null as string | null }));
  for (let i = 0; i < context.pages().length; i++) {
    try {
      pages[i].title = await context.pages()[i].title();
    } catch {
      pages[i].title = null;
    }
  }

  await context.storageState({ path: storageStatePath, indexedDB: true });
  const originStorage = await gatherOriginStorage(context);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

  let bodyText = '';
  try {
    bodyText = await page.locator('body').innerText({ timeout: 2_000 });
  } catch {
    bodyText = '';
  }

  const npssoCookie = cookies.find((cookie) => cookie.name === 'npsso');

  const dump = {
    generatedAt: new Date().toISOString(),
    detectedSignInCompletion: detected,
    currentUrl: page.url(),
    pages,
    sonyCookieCount: cookies.filter((cookie) => /sony|playstation/i.test(cookie.domain)).length,
    authLikeCookieNames: cookies
      .filter((cookie) => /my\.account\.sony\.com/i.test(cookie.domain) || /kp_|token|sess|auth|login|npsso/i.test(cookie.name))
      .map((cookie) => `${cookie.domain}:${cookie.name}`),
    signInPromptVisible: /sign in to your psn account|create psn account/i.test(bodyText),
    npssoPresent: Boolean(npssoCookie?.value),
    npssoLength: npssoCookie?.value?.length ?? 0,
    npssoDomain: npssoCookie?.domain ?? null,
    originStorage,
    storageStatePath,
    screenshotPath
  };

  await fs.writeFile(dumpPath, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');
  const summaryPath = resolveArtifactPath(undefined, 'artifacts/auth/playstation-auth-summary.json');
  await writeAuthSummary({ storageStatePath, dumpPath, outputPath: summaryPath });
  console.log(`[ps-wen] Wrote ${storageStatePath}`);
  console.log(`[ps-wen] Wrote ${dumpPath}`);
  console.log(`[ps-wen] Wrote ${summaryPath}`);
  console.log(`[ps-wen] Wrote ${screenshotPath}`);
  console.log(`[ps-wen] NPSSO captured: ${dump.npssoPresent ? `yes (${dump.npssoLength} chars on ${dump.npssoDomain})` : 'no'}`);
  if (dump.npssoPresent) {
    console.log('[ps-wen] Next: npm run auth:extract-npsso');
  }

  if (!autoClose) {
    console.log('[ps-wen] Leaving browser open. Close the browser window when you are done reviewing.');
    await new Promise<void>((resolve) => {
      browser.on('disconnected', () => resolve());
    });
    return;
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
