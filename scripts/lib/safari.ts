import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type SafariTab = {
  index: number;
  title: string;
  url: string;
};

export async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await execFileAsync('osascript', ['-e', script], { maxBuffer: 1024 * 1024 * 10 });
  return stdout.trim();
}

export async function listSafariTabs(): Promise<SafariTab[]> {
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

export async function runJavaScriptInSafariTab(index: number, js: string): Promise<string> {
  const script = `
    tell application "Safari"
      if (count of windows) is 0 then error "No Safari windows open"
      tell front window
        set t to tab ${index}
        return do JavaScript ${JSON.stringify(js)} in t
      end tell
    end tell
  `;

  return runAppleScript(script);
}

export async function findSafariTabIndex(preferredOrigins: string[]): Promise<number> {
  const tabs = await listSafariTabs();
  for (const preferredOrigin of preferredOrigins) {
    const match = tabs.find((tab) => tab.url.startsWith(preferredOrigin));
    if (match) return match.index;
  }

  throw new Error(`Could not find an open Safari tab for any of: ${preferredOrigins.join(', ')}`);
}
