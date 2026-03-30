import fs from 'node:fs';
import path from 'node:path';
import { test, expect, Locator, Page } from '@playwright/test';
import { loadEnv, resolveArtifactPath } from '../scripts/lib/env.js';

const env = loadEnv();
const DEFAULT_PSN_LOGIN_URL = 'https://web.np.playstation.com/api/session/v1/signin?redirect_uri=https%3A%2F%2Fstore.playstation.com%2F';
const AUTH_COOKIE_RE = /kp_|token|sess|auth|login|sid|npsso|refresh/i;

async function firstVisible(page: Page, selectors: string[]): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 3_000 });
      return locator;
    } catch {
      // try next selector
    }
  }

  return null;
}

async function firstVisibleLocator(locators: Locator[]): Promise<Locator | null> {
  for (const locator of locators) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 3_000 });
      return locator;
    } catch {
      // try next locator
    }
  }

  return null;
}

async function clickFirst(page: Page, selectors: string[]): Promise<boolean> {
  const locator = await firstVisible(page, selectors);
  if (!locator) return false;
  await locator.click();
  return true;
}

async function typeLikeHuman(locator: Locator, value: string): Promise<void> {
  await locator.click();
  await locator.clear();
  await locator.pressSequentially(value, { delay: 35 });
}

test('official PSN login smoke harness', async ({ page }) => {
  test.skip(!env.PSN_EMAIL || !env.PSN_PASSWORD, 'Set PSN_EMAIL and PSN_PASSWORD in .env.');

  const loginUrl = env.PSN_LOGIN_URL || DEFAULT_PSN_LOGIN_URL;
  const storageStatePath = resolveArtifactPath(env.PSN_STORAGE_STATE, 'artifacts/auth/playstation-storage-state.json');
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

  const email =
    (await firstVisible(page, [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="loginID"]',
      'input[id*="signInId"]'
    ])) ??
    (await firstVisibleLocator([
      page.getByRole('textbox', { name: /sign-?in id|email address/i }).first(),
      page.getByLabel(/sign-?in id|email address/i).first()
    ]));
  expect(email, 'Could not find an email field on the configured login page.').not.toBeNull();
  await typeLikeHuman(email!, env.PSN_EMAIL!);
  await email!.press('Tab');

  await clickFirst(page, [
    'button:has-text("Next")',
    'button:has-text("Continue")',
    'button:has-text("Sign in")',
    'input[type="submit"]'
  ]);

  const password =
    (await firstVisible(page, [
      'input[type="password"]',
      'input[name="password"]',
      'input[autocomplete="current-password"]'
    ])) ??
    (await firstVisibleLocator([
      page.getByLabel(/password/i).first()
    ]));
  expect(password, 'Could not find a password field after submitting email.').not.toBeNull();
  await typeLikeHuman(password!, env.PSN_PASSWORD!);
  await password!.press('Tab');

  const submitButton = await firstVisible(page, [
    'button:has-text("Sign In")',
    'button:has-text("Sign in")',
    'button:has-text("Continue")',
    'input[type="submit"]'
  ]);
  expect(submitButton, 'Could not find a submit button after entering password.').not.toBeNull();

  try {
    await expect(submitButton!).toBeEnabled({ timeout: 10_000 });
    await submitButton!.click();
  } catch {
    await password!.press('Enter');
  }

  await page.waitForTimeout(10_000);

  if (env.PSN_POST_LOGIN_URL) {
    await page.goto(env.PSN_POST_LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5_000);
  }

  await page.context().storageState({ path: storageStatePath });
  expect(fs.existsSync(storageStatePath)).toBeTruthy();

  const state = JSON.parse(fs.readFileSync(storageStatePath, 'utf8')) as { cookies: Array<{ domain: string; name: string }> };
  const sonyCookies = state.cookies.filter((cookie) => /sony|playstation/i.test(cookie.domain));
  expect(sonyCookies.length).toBeGreaterThan(0);

  const authLikeSonyCookies = state.cookies.filter(
    (cookie) => /sony|playstation/i.test(cookie.domain) && (AUTH_COOKIE_RE.test(cookie.name) || /my\.account\.sony\.com/i.test(cookie.domain))
  );
  expect(authLikeSonyCookies.length).toBeGreaterThan(0);

  const onSigninSurface = /my\.account\.sony\.com\/sonyacct\/signin|\/signin\b|error=login_required/.test(page.url().toLowerCase());
  expect(onSigninSurface).toBeFalsy();
});
