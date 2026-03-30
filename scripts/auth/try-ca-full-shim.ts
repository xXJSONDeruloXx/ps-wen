/**
 * try-ca-full-shim.ts
 *
 * Full shim for the CA-domain GC path:
 *   - GET ca.account.sony.com/ELdff...  -> serve PSNow SDK body
 *   - POST ca.account.sony.com/ELdff... -> return 201 {success:true}
 *
 * If createAuthCodeSession() only needs the iframe relay machinery and sensor
 * POST acknowledgements (not real Akamai cookies), this should allow it to
 * finish in plain Chromium.
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
  const tmp = path.join(os.tmpdir(), `ps-fullshim-${Date.now()}.db`);
  fs.copyFileSync(dbPath, tmp);
  const db = new DatabaseSync(tmp);
  const rows = db.prepare('select host_key, name, value from cookies').all() as Array<Record<string, unknown>>;
  db.close(); fs.unlinkSync(tmp);
  return rows;
}

async function main() {
  const roamDb = path.join(os.homedir(), 'AppData', 'Roaming', 'playstation-now', 'Cookies');
  const roam = readCookies(roamDb);
  const npsso = String(roam.find((r) => r.name === 'npsso')?.value ?? '');
  const kpUidz = String(roam.find((r) => r.name === 'KP_uIDz' && String(r.host_key).includes('ca.account'))?.value ?? '');
  const dars = String(roam.find((r) => r.name === 'dars')?.value ?? '');
  if (!npsso) throw new Error('No NPSSO found');

  const sdkResp = await fetch(PSNOW_GC_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) gkApollo' }
  });
  const sdkBody = await sdkResp.text();
  const sdkType = sdkResp.headers.get('content-type') ?? 'application/javascript';
  console.log('[full-shim] psnow GC SDK:', sdkResp.status, sdkBody.length, 'bytes');

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

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url === CA_GC_URL && method === 'GET') {
      console.log('[full-shim] fulfill CA GC GET with PSNow SDK');
      await route.fulfill({ status: 200, contentType: sdkType, body: sdkBody });
      return;
    }
    if (url === CA_GC_URL && method === 'POST') {
      console.log('[full-shim] fulfill CA GC POST with synthetic 201');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (/playstation|sony\.com|gaikai/i.test(url)) {
      try {
        const resp = await route.fetch();
        if (/oauth\/authorize|user\/session|ELdff|\/user(\/|$)|entitle|recommendations/i.test(url)) {
          console.log(`[full-shim] ${method} ${url.replace(/^https?:\/\/[^/]+/, '')} -> ${resp.status()}`);
        }
        await route.fulfill({ response: resp });
      } catch {
        await route.continue();
      }
    } else {
      await route.continue();
    }
  });

  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => undefined);
  await page.waitForTimeout(5000);

  const gcAvailable = await page.evaluate(() => typeof (window as any).GrandCentral !== 'undefined').catch(() => false);
  console.log('[full-shim] GrandCentral available:', gcAvailable);

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
  console.log('[full-shim] createAuthCodeSession result:', createResult);

  await page.waitForTimeout(5000);

  const cookies = await ctx.cookies();
  const psnowCookies = cookies.filter((c) => c.domain.includes('psnow.playstation.com')).map((c) => ({
    domain: c.domain,
    name: c.name,
    value: c.value.slice(0, 50),
  }));
  console.log('[full-shim] psnow cookies:', psnowCookies);

  await browser.close();
}

main().catch((e) => {
  console.error('[full-shim] Fatal:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
