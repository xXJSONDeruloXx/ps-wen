import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { loadEnv, resolveArtifactPath } from '../lib/env.js';

const env = loadEnv();
const loginUrl = env.PSN_LOGIN_URL || 'https://web.np.playstation.com/api/session/v1/signin?redirect_uri=https%3A%2F%2Fstore.playstation.com%2F';
const storageStatePath = resolveArtifactPath(env.PSN_STORAGE_STATE, 'artifacts/auth/playstation-storage-state.json');
const dumpPath = resolveArtifactPath(undefined, 'artifacts/auth/manual-login-dump.json');
const screenshotPath = resolveArtifactPath(undefined, 'artifacts/auth/manual-login-final.png');
const waitSeconds = Number(process.env.MANUAL_AUTH_WAIT_SECONDS || '300');
const timeoutMs = waitSeconds * 1000;

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
    const offSignin = !/signin|oauth|login/i.test(currentUrl);
    let bodyText = '';
    try {
      bodyText = await page.locator('body').innerText({ timeout: 1_000 });
    } catch {
      bodyText = '';
    }
    const hasSigninPrompt = /sign in to your psn account|create psn account/i.test(bodyText);
    const strongSignal = authLikeCookies.length > 0 && offSignin && !hasSigninPrompt;

    if (strongSignal || (sonyCookies.length > 0 && /my\.account\.sony\.com|store\.playstation\.com/i.test(currentUrl) && !hasSigninPrompt)) {
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

  const dump = {
    generatedAt: new Date().toISOString(),
    detectedSignInCompletion: detected,
    currentUrl: page.url(),
    pages,
    sonyCookieCount: cookies.filter((cookie) => /sony|playstation/i.test(cookie.domain)).length,
    authLikeCookieNames: cookies
      .filter((cookie) => /my\.account\.sony\.com/i.test(cookie.domain) || /kp_|token|sess|auth|login/i.test(cookie.name))
      .map((cookie) => `${cookie.domain}:${cookie.name}`),
    signInPromptVisible: /sign in to your psn account|create psn account/i.test(bodyText),
    originStorage,
    storageStatePath,
    screenshotPath
  };

  await fs.writeFile(dumpPath, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');
  console.log(`[ps-wen] Wrote ${storageStatePath}`);
  console.log(`[ps-wen] Wrote ${dumpPath}`);
  console.log(`[ps-wen] Wrote ${screenshotPath}`);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
