/**
 * intercept-kamaji-session.ts
 *
 * Uses Playwright to load the live PSNow app URL with the locally-stored NPSSO
 * cookie, intercepts ALL outgoing network requests, and captures the exact
 * URL + method + headers + body of the Kamaji session establishment call made
 * by the GrandCentral SDK (createAuthCodeSession).
 *
 * Usage:
 *   npm run auth:intercept-session
 */

import { chromium } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import fsP from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const APP_URL  = 'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/';
const OUT_PATH = 'artifacts/auth/kamaji-session-intercept.json';

function readCookies(dbPath: string) {
  const tmp = path.join(os.tmpdir(), `ps-intercept-${Date.now()}.db`);
  fs.copyFileSync(dbPath, tmp);
  const db = new DatabaseSync(tmp);
  const rows = db.prepare(
    'select host_key, name, value, path as cpath, CAST(expires_utc AS TEXT) as exp from cookies'
  ).all() as Array<Record<string, unknown>>;
  db.close();
  fs.unlinkSync(tmp);
  return rows;
}

async function main() {
  const roamDb = path.join(os.homedir(), 'AppData', 'Roaming', 'playstation-now', 'Cookies');
  const roamCookies = readCookies(roamDb);

  const npsso  = String(roamCookies.find(r => r.name === 'npsso')?.value ?? '');
  const kpUidz = String(roamCookies.find(r => r.name === 'KP_uIDz' && String(r.host_key).includes('ca.account'))?.value ?? '');
  const dars   = String(roamCookies.find(r => r.name === 'dars')?.value ?? '');

  if (!npsso) throw new Error('No NPSSO found.');
  console.log('[intercept] NPSSO len:', npsso.length, '  KP_uIDz len:', kpUidz.length);

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Electron/11.2.3 Safari/537.36 gkApollo',
  });

  const cookiesToInject = [
    { name:'npsso',    value:npsso,  domain:'ca.account.sony.com',  path:'/', secure:true,  httpOnly:false },
    ...(kpUidz ? [
      { name:'KP_uIDz', value:kpUidz, domain:'ca.account.sony.com',  path:'/', secure:false, httpOnly:false },
      { name:'KP_uIDz', value:kpUidz, domain:'my.account.sony.com',  path:'/', secure:false, httpOnly:false },
    ] : []),
    ...(dars ? [{ name:'dars', value:dars, domain:'ca.account.sony.com', path:'/', secure:true, httpOnly:false }] : []),
  ];
  await ctx.addCookies(cookiesToInject);
  console.log('[intercept] Injected', cookiesToInject.length, 'cookies');

  type CapturedReq = {
    url: string; method: string; headers: Record<string,string>;
    body: string | null; responseStatus: number;
    responseHeaders: Record<string,string>; responseBody: string | null;
    capturedAt: string;
  };
  const captured: CapturedReq[] = [];

  const page = await ctx.newPage();

  await page.route('**/*', async (route) => {
    const req  = route.request();
    const url  = req.url();
    const method = req.method();
    // Capture EVERYTHING from PSN/Sony/Gaikai - cast wide net to find the recognition step
    const skip = /\.png|favicon|i18n|assets\/|fonts\/|telemetry|theia|vulcan|download-psnow|\.css|akamaihd|akamaitechnologies|\.woff/i.test(url);
    const interesting = /playstation|sony\.com|gaikai|psnow/i.test(url);

    if (!interesting || skip) { await route.continue(); return; }

    const reqHeaders = await req.allHeaders().catch(() => ({}) as Record<string,string>);
    const reqBody    = req.postData() ?? null;
    const shortUrl   = url.replace(/https?:\/\/[^/]+/, '').slice(0,70);
    console.log(`[intercept] → ${method} ${shortUrl}`);
    if (reqBody) console.log(`             body: ${reqBody.slice(0,200)}`);

    try {
      const resp      = await route.fetch();
      const respBody  = await resp.text().catch(() => null);
      const respHdrs: Record<string,string> = {};
      for (const [k,v] of Object.entries(resp.headers())) respHdrs[k] = v;

      captured.push({ url, method, headers:reqHeaders, body:reqBody,
        responseStatus:resp.status(), responseHeaders:respHdrs,
        responseBody: respBody ? respBody.slice(0,4000) : null,
        capturedAt: new Date().toISOString() });

      const sc = respHdrs['set-cookie'] ?? '';
      if (resp.status() !== 401 || sc.includes('JSESSIONID')) {
        console.log(`             ← ${resp.status()}${sc ? '  set-cookie: '+sc.slice(0,80) : ''}`);
        if (respBody && respBody.length < 600) console.log('             ', respBody.slice(0,300));
      } else {
        console.log(`             ← ${resp.status()}`);
      }
      await route.fulfill({ response: resp });
    } catch (e) {
      console.log(`             ← ERR: ${e instanceof Error ? e.message.slice(0,80) : e}`);
      await route.continue();
    }
  });

  console.log('[intercept] Navigating...');
  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 25_000 });
  } catch {
    // SPA timeout is expected
  }
  await page.waitForTimeout(8_000);

  const gcAvail = await page.evaluate(() => typeof (window as any).GrandCentral !== 'undefined').catch(() => false);
  console.log('[intercept] GrandCentral in page:', gcAvail);
  console.log('[intercept] Page URL:', page.url());

  // If GC is available, try triggering session init directly
  if (gcAvail) {
    console.log('[intercept] Attempting to call GrandCentral.UserSessionService.createAuthCodeSession()...');
    const result = await page.evaluate(async () => {
      try {
        const svc = new (window as any).GrandCentral.UserSessionService();
        const r = await svc.createAuthCodeSession();
        return { ok: true, data: JSON.stringify(r) };
      } catch (e: any) {
        return { ok: false, error: String(e?.message ?? e) };
      }
    }).catch(e => ({ ok: false, error: String(e) }));
    console.log('[intercept] createAuthCodeSession result:', result);
    await page.waitForTimeout(3_000);
  }

  await browser.close();

  await fsP.mkdir(path.dirname(OUT_PATH), { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    appUrl: APP_URL,
    grandCentralAvailable: gcAvail,
    capturedRequestCount: captured.length,
    requests: captured,
  };
  await fsP.writeFile(OUT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`\n[intercept] ${captured.length} captured → ${OUT_PATH}`);

  const wins = captured.filter(r => r.responseStatus !== 401 || r.responseHeaders['set-cookie']?.includes('JSESSIONID'));
  if (wins.length) {
    console.log('\n[intercept] Notable responses:');
    for (const w of wins) {
      console.log(`  ${w.method} ${w.url} → ${w.responseStatus}`);
      if (w.responseHeaders['set-cookie']) console.log('    set-cookie:', w.responseHeaders['set-cookie'].slice(0,120));
      if (w.responseBody) console.log('    body:', w.responseBody.slice(0,300));
    }
  } else {
    console.log('[intercept] All interesting requests returned 401.');
    console.log('[intercept] The session establishment requires the native Electron broker context (GrandCentral native bindings).');
    console.log('[intercept] See', OUT_PATH, 'for full request log.');
  }
}

main().catch(e => { console.error('[intercept] Fatal:', e instanceof Error ? e.message : e); process.exitCode = 1; });
