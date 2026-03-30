/**
 * try-ca-sdk-shim.ts
 *
 * Hypothesis:
 *   createAuthCodeSession() times out because the hidden auth iframe tries to
 *   load `https://ca.account.sony.com/ELdff...` and gets a 403. If we intercept
 *   that request and fulfill it with the exact GrandCentral SDK body fetched
 *   from `https://psnow.playstation.com/ELdff...`, the relay may complete.
 */

import { chromium } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_URL = 'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/';
const GC_PATH = '/ELdff8h5I1y7/PcdO1O/lpRglg/OOEmtSVNV7Jzrz/exMUAS0/C00Gcx/stYyoB';
const PSNOW_GC_URL = `https://psnow.playstation.com${GC_PATH}`;
const CA_GC_URL = `https://ca.account.sony.com${GC_PATH}`;

function readCookies(dbPath: string) {
  const tmp = path.join(os.tmpdir(), `ps-shim-${Date.now()}.db`);
  fs.copyFileSync(dbPath, tmp);
  const db = new DatabaseSync(tmp);
  const rows = db.prepare('select host_key, name, value from cookies').all() as Array<Record<string, unknown>>;
  db.close();
  fs.unlinkSync(tmp);
  return rows;
}

async function main() {
  const roamDb = path.join(os.homedir(), 'AppData', 'Roaming', 'playstation-now', 'Cookies');
  const roam = readCookies(roamDb);
  const npsso = String(roam.find((r) => r.name === 'npsso')?.value ?? '');
  const kpUidz = String(roam.find((r) => r.name === 'KP_uIDz' && String(r.host_key).includes('ca.account'))?.value ?? '');
  const dars = String(roam.find((r) => r.name === 'dars')?.value ?? '');
  if (!npsso) throw new Error('No NPSSO found');

  // Fetch the working GC SDK body from the PSNow domain up front.
  const sdkResp = await fetch(PSNOW_GC_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) gkApollo' },
  });
  const sdkBody = await sdkResp.text();
  const sdkType = sdkResp.headers.get('content-type') ?? 'application/javascript';
  console.log('[shim] fetched psnow GC SDK:', sdkResp.status, sdkBody.length, 'bytes');

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Electron/11.2.3 Safari/537.36 gkApollo',
  });
  await ctx.addCookies([
    { name: 'npsso', value: npsso, domain: 'ca.account.sony.com', path: '/', secure: true, httpOnly: false },
    ...(kpUidz ? [{ name: 'KP_uIDz', value: kpUidz, domain: 'ca.account.sony.com', path: '/', secure: false, httpOnly: false }] : []),
    ...(dars ? [{ name: 'dars', value: dars, domain: 'ca.account.sony.com', path: '/', secure: true, httpOnly: false }] : []),
  ]);

  const page = await ctx.newPage();
  const logs: Array<{ method: string; url: string; status?: number; note?: string }> = [];

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url === CA_GC_URL && method === 'GET') {
      console.log('[shim] fulfilling CA GC SDK GET with PSNow SDK body');
      logs.push({ method, url, note: 'fulfilled-with-psnow-sdk' });
      await route.fulfill({
        status: 200,
        contentType: sdkType,
        body: sdkBody,
      });
      return;
    }

    if (/playstation|sony\.com|gaikai/i.test(url)) {
      try {
        const resp = await route.fetch();
        logs.push({ method, url, status: resp.status() });
        if (/oauth\/authorize|user\/session|ELdff|\/user(\/|$)|entitle|recommendations/i.test(url)) {
          console.log(`[shim] ${method} ${url.replace(/^https?:\/\/[^/]+/, '')} -> ${resp.status()}`);
        }
        await route.fulfill({ response: resp });
      } catch (e) {
        logs.push({ method, url, note: String(e) });
        await route.continue();
      }
    } else {
      await route.continue();
    }
  });

  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => undefined);
  await page.waitForTimeout(5000);

  const gcAvailable = await page.evaluate(() => typeof (window as any).GrandCentral !== 'undefined').catch(() => false);
  console.log('[shim] GrandCentral available:', gcAvailable);

  let createResult: unknown = null;
  if (gcAvailable) {
    createResult = await page.evaluate(async () => {
      try {
        const svc = new (window as any).GrandCentral.UserSessionService();
        const res = await svc.createAuthCodeSession();
        return { ok: true, data: JSON.stringify(res) };
      } catch (e: any) {
        return { ok: false, error: String(e?.message ?? e) };
      }
    }).catch((e) => ({ ok: false, error: String(e) }));
  }

  console.log('[shim] createAuthCodeSession result:', createResult);
  await page.waitForTimeout(5000);

  const cookies = await ctx.cookies();
  const relevant = cookies.filter((c) => /psnow\.playstation\.com/.test(c.domain)).map((c) => ({
    domain: c.domain,
    name: c.name,
    value: c.value.slice(0, 40),
  }));
  console.log('[shim] psnow cookies:', relevant);

  await browser.close();
}

main().catch((e) => {
  console.error('[shim] Fatal:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
