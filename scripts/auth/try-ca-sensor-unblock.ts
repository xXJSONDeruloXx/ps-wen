/**
 * try-ca-sensor-unblock.ts
 *
 * Hypothesis:
 *   The recognized-session/auth-completion step fails in plain Chromium because
 *   the GrandCentral SDK iframe loads from `ca.account.sony.com/ELdff...` and
 *   gets Akamai 403.  The psnow domain succeeds because Akamai BM sensor POSTs
 *   are sent there first.  If we replay one valid sensor POST to the same path
 *   on `ca.account.sony.com`, the subsequent GET may stop 403ing and the hidden
 *   iframe-based auth handoff may complete.
 *
 * This script:
 *   1. launches Chromium with NPSSO cookies injected
 *   2. lets the app run until we capture one successful psnow sensor POST body
 *   3. manually POSTs that same sensor payload to ca.account.sony.com/ELdff...
 *   4. manually GETs the same URL to see if 403 is gone
 *   5. then calls GrandCentral.UserSessionService.createAuthCodeSession()
 *   6. logs every Sony/PlayStation request to see if recognition progresses
 */

import { chromium } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_URL = 'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/';
const GC_PATH = '/ELdff8h5I1y7/PcdO1O/lpRglg/OOEmtSVNV7Jzrz/exMUAS0/C00Gcx/stYyoB';

function readCookies(dbPath: string) {
  const tmp = path.join(os.tmpdir(), `ps-ca-${Date.now()}.db`);
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

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Electron/11.2.3 Safari/537.36 gkApollo',
  });
  await ctx.addCookies([
    { name: 'npsso', value: npsso, domain: 'ca.account.sony.com', path: '/', secure: true, httpOnly: false },
    ...(kpUidz ? [{ name: 'KP_uIDz', value: kpUidz, domain: 'ca.account.sony.com', path: '/', secure: false, httpOnly: false }] : []),
    ...(dars ? [{ name: 'dars', value: dars, domain: 'ca.account.sony.com', path: '/', secure: true, httpOnly: false }] : []),
  ]);

  let firstSensorBody: string | null = null;
  const logs: Array<{ method: string; url: string; status?: number; note?: string }> = [];

  const page = await ctx.newPage();

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const interesting = /playstation|sony\.com|gaikai/i.test(url);
    if (!interesting) { await route.continue(); return; }

    if (!firstSensorBody && method === 'POST' && url === `https://psnow.playstation.com${GC_PATH}`) {
      const body = req.postData();
      if (body?.includes('sensor_data')) {
        firstSensorBody = body;
        console.log('[ca-unblock] captured psnow sensor body');
      }
    }

    try {
      const resp = await route.fetch();
      logs.push({ method, url, status: resp.status() });
      if (/ca\.account\.sony\.com.*ELdff/i.test(url) || /user\/session/.test(url) || /oauth\/authorize/.test(url)) {
        console.log(`[ca-unblock] ${method} ${url.replace(/^https?:\/\/[^/]+/, '')} -> ${resp.status()}`);
      }
      await route.fulfill({ response: resp });
    } catch (e) {
      logs.push({ method, url, note: String(e) });
      await route.continue();
    }
  });

  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => undefined);
  await page.waitForTimeout(6000);

  console.log('[ca-unblock] first sensor captured:', Boolean(firstSensorBody));
  if (!firstSensorBody) {
    await browser.close();
    throw new Error('No psnow sensor body captured');
  }

  // Replay the sensor body to the CA domain from inside the browser context
  const replayResult = await page.evaluate(async ({ gcPath, sensorBody }) => {
    const parsed = JSON.parse(sensorBody as string);
    const post = await fetch(`https://ca.account.sony.com${gcPath}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'accept': '*/*',
      },
      body: JSON.stringify(parsed),
    });
    const postText = await post.text().catch(() => '');

    const get = await fetch(`https://ca.account.sony.com${gcPath}`, {
      method: 'GET',
      credentials: 'include',
    });
    const getText = await get.text().catch(() => '');

    return {
      postStatus: post.status,
      postText: postText.slice(0, 200),
      getStatus: get.status,
      getText: getText.slice(0, 200),
    };
  }, { gcPath: GC_PATH, sensorBody: firstSensorBody });

  console.log('[ca-unblock] replay result:', replayResult);

  // Now retry the GC SDK createAuthCodeSession call
  const gcAvailable = await page.evaluate(() => typeof (window as any).GrandCentral !== 'undefined').catch(() => false);
  console.log('[ca-unblock] GrandCentral available:', gcAvailable);

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
  console.log('[ca-unblock] createAuthCodeSession result:', createResult);

  await page.waitForTimeout(5000);

  const allCookies = await ctx.cookies();
  const psnowCookies = allCookies.filter((c) => c.domain.includes('psnow.playstation.com')).map((c) => ({
    domain: c.domain,
    name: c.name,
    value: c.value.slice(0, 32),
  }));
  console.log('[ca-unblock] psnow cookies:', psnowCookies);

  await browser.close();
}

main().catch((e) => {
  console.error('[ca-unblock] Fatal:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
