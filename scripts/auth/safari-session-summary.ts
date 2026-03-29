import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveArtifactPath } from '../lib/env.js';

const execFileAsync = promisify(execFile);

type SafariTab = {
  index: number;
  title: string;
  url: string;
};

async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await execFileAsync('osascript', ['-e', script], { maxBuffer: 1024 * 1024 * 5 });
  return stdout.trim();
}

async function getTabs(): Promise<SafariTab[]> {
  const script = `
    tell application "Safari"
      if (count of windows) is 0 then return ""
      set oldTID to AppleScript's text item delimiters
      set AppleScript's text item delimiters to linefeed
      set rows to {}
      tell front window
        set sep to ASCII character 30
        repeat with i from 1 to (count of tabs)
          set t to tab i
          set end of rows to ((i as string) & sep & (name of t as string) & sep & ((URL of t) as string))
        end repeat
      end tell
      set out to rows as text
      set AppleScript's text item delimiters to oldTID
      return out
    end tell
  `;

  const output = await runAppleScript(script);
  if (!output) return [];
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\x1E(.*?)\x1E(.*)$/);
      if (!match) return null;
      const [, index, title, url] = match;
      return { index: Number(index), title, url };
    })
    .filter((tab): tab is SafariTab => tab !== null && Number.isFinite(tab.index));
}

async function runJsInTab(index: number, js: string): Promise<unknown> {
  const script = `
    tell application "Safari"
      if (count of windows) is 0 then error "No Safari windows open"
      tell front window
        set t to tab ${index}
        return do JavaScript ${JSON.stringify(js)} in t
      end tell
    end tell
  `;

  const output = await runAppleScript(script);
  return output ? JSON.parse(output) : null;
}

const safeSummaryJs = `(() => {
  const getCookie = (name) => {
    const prefix = name + '=';
    for (const part of document.cookie.split(/;\\s*/)) {
      if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
    }
    return null;
  };
  const gpdcUserRaw = sessionStorage.getItem('gpdcUser');
  let gpdcUserKeys = [];
  try { gpdcUserKeys = gpdcUserRaw ? Object.keys(JSON.parse(gpdcUserRaw)) : []; } catch (e) {}
  const chimeraKeys = Object.keys(localStorage).filter((key) => key.startsWith('chimera-'));
  return JSON.stringify({
    url: location.href,
    title: document.title,
    signInPrompt: /Sign in to your PSN account|Create PSN account|Sign in to PlayStation/i.test(document.body.innerText),
    isSignedInCookie: getCookie('isSignedIn'),
    hasSessionCookie: getCookie('session') !== null,
    hasUserInfoCookie: getCookie('userinfo') !== null,
    sessionCookieLength: (getCookie('session') || '').length,
    userInfoCookieLength: (getCookie('userinfo') || '').length,
    pdcws2CookiePresent: getCookie('pdcws2') !== null,
    pdcws2Length: (getCookie('pdcws2') || '').length,
    pdcsiCookiePresent: getCookie('pdcsi') !== null,
    pdcsiLength: (getCookie('pdcsi') || '').length,
    cookieNames: document.cookie.split(/;\\s*/).filter(Boolean).map((value) => value.split('=')[0]).sort(),
    localStorageKeys: Object.keys(localStorage).sort(),
    sessionStorageKeys: Object.keys(sessionStorage).sort(),
    userIdLength: (localStorage.getItem('userId') || '').length,
    gpdcUserPresent: gpdcUserRaw !== null,
    gpdcUserLength: (gpdcUserRaw || '').length,
    gpdcUserKeys,
    chimeraKeys
  });
})()`;

async function main() {
  const tabs = await getTabs();
  const interestingTabs = tabs.filter((tab) => {
    try {
      const hostname = new URL(tab.url).hostname;
      return /(^|\.)playstation\.com$|(^|\.)sony\.com$/i.test(hostname);
    } catch {
      return false;
    }
  });
  const summaries = [] as Array<{ index: number; title: string; url: string; summary: unknown }>;

  for (const tab of interestingTabs) {
    try {
      const summary = await runJsInTab(tab.index, safeSummaryJs);
      summaries.push({ index: tab.index, title: tab.title, url: tab.url, summary });
    } catch (error) {
      summaries.push({
        index: tab.index,
        title: tab.title,
        url: tab.url,
        summary: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    tabCount: tabs.length,
    interestingTabCount: interestingTabs.length,
    tabs: interestingTabs,
    summaries
  };

  const outputPath = resolveArtifactPath(process.argv[2], 'artifacts/auth/safari-session-summary.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
