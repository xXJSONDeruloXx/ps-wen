import fs from 'node:fs';
import path from 'node:path';
import { test, expect, Locator, Page } from '@playwright/test';
import { loadEnv, resolveArtifactPath } from '../scripts/lib/env.js';

const env = loadEnv();

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

async function clickFirst(page: Page, selectors: string[]): Promise<boolean> {
  const locator = await firstVisible(page, selectors);
  if (!locator) return false;
  await locator.click();
  return true;
}

test('official PSN login smoke harness', async ({ page }) => {
  test.skip(!env.PSN_LOGIN_URL || !env.PSN_EMAIL || !env.PSN_PASSWORD, 'Set PSN_LOGIN_URL, PSN_EMAIL, and PSN_PASSWORD in .env.');

  const storageStatePath = resolveArtifactPath(env.PSN_STORAGE_STATE, 'artifacts/auth/playstation-storage-state.json');
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });

  await page.goto(env.PSN_LOGIN_URL!, { waitUntil: 'domcontentloaded' });

  const email = await firstVisible(page, [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="loginID"]',
    'input[id*="signInId"]'
  ]);
  expect(email, 'Could not find an email field on the configured login page.').not.toBeNull();
  await email!.fill(env.PSN_EMAIL!);

  await clickFirst(page, [
    'button:has-text("Next")',
    'button:has-text("Continue")',
    'button:has-text("Sign in")',
    'input[type="submit"]'
  ]);

  const password = await firstVisible(page, [
    'input[type="password"]',
    'input[name="password"]'
  ]);
  expect(password, 'Could not find a password field after submitting email.').not.toBeNull();
  await password!.fill(env.PSN_PASSWORD!);

  await clickFirst(page, [
    'button:has-text("Sign In")',
    'button:has-text("Sign in")',
    'button:has-text("Continue")',
    'input[type="submit"]'
  ]);

  await page.waitForTimeout(10_000);

  if (env.PSN_POST_LOGIN_URL) {
    await page.goto(env.PSN_POST_LOGIN_URL, { waitUntil: 'networkidle' });
  }

  await page.context().storageState({ path: storageStatePath });
  expect(fs.existsSync(storageStatePath)).toBeTruthy();

  const state = JSON.parse(fs.readFileSync(storageStatePath, 'utf8')) as { cookies: Array<{ domain: string }> };
  const sonyCookies = state.cookies.filter((cookie) => /sony|playstation/i.test(cookie.domain));
  expect(sonyCookies.length).toBeGreaterThan(0);
});
