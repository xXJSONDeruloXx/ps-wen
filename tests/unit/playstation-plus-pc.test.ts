import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAllowlistPatterns,
  extractAuthRedirects,
  extractCodeCacheAssetUrls,
  extractLevelDbOriginKeyMap,
  extractMainCommandHandlers,
  extractPreloadCommands,
  extractProcessArg,
  extractSessionStorageOriginKeyMap,
  extractWebSocketDefaults,
  parseChromiumOriginName,
  summarizeRedirectUrl,
  summarizeStorageValue
} from '../../scripts/lib/playstation-plus-pc.js';

test('extracts allowlist regex sources from main.js', () => {
  const source = `
    var allowlistRe = [
      /^https:\/\/psnow\.playstation\.com\/app\/[0-9\.]+\/[a-z\/0-9]+/i,
      /^https:\/\/www\.playstation\.com\/ps-plus/i
    ];
  `;

  assert.deepEqual(extractAllowlistPatterns(source), [
    'https://psnow.playstation.com/app/[0-9.]+/[a-z/0-9]+',
    'https://www.playstation.com/ps-plus'
  ]);
});

test('extracts command handlers and preload commands', () => {
  const mainSource = `
    if (command === 'launchRemote') {}
    else if (command == 'showDevTools') {}
    else if (command === 'setUrl') {}
  `;
  const preloadSource = `
    this.send({ command: 'requestGame', params: {} }, 'QAS');
    this.send({'command': 'windowControl', 'params': {command: command}}, target || this.identity);
    this.sendQASCommand('saveDataDeepLink', { requestId: requestId });
  `;

  assert.deepEqual(extractMainCommandHandlers(mainSource), ['launchRemote', 'setUrl', 'showDevTools']);
  assert.deepEqual(extractPreloadCommands(preloadSource), ['requestGame', 'saveDataDeepLink', 'windowControl']);
});

test('parses process args and websocket defaults', () => {
  const commandLine =
    '"C:\\Program Files (x86)\\PlayStationPlus\\agl\\agl.exe" --url=https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/ --settings-dir="C:/Users/kurt/AppData/Local/Sony Interactive Entertainment Inc/PlayStationPlus"';
  const websocketSource = `
    if (typeof(host) === 'undefined') { host = 'localhost'; }
    if (typeof(port) === 'undefined') { port = 1235; }
    if (typeof(keepConnected) === 'undefined') { keepConnected = true; }
  `;

  assert.equal(extractProcessArg(commandLine, 'url'), 'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/');
  assert.equal(
    extractProcessArg(commandLine, 'settings-dir'),
    'C:/Users/kurt/AppData/Local/Sony Interactive Entertainment Inc/PlayStationPlus'
  );
  assert.deepEqual(extractWebSocketDefaults(websocketSource), { host: 'localhost', port: 1235, keepConnected: true });
});

test('normalizes chromium origin names from local storage and indexeddb paths', () => {
  assert.equal(parseChromiumOriginName('https_psnow.playstation.com_0.localstorage'), 'https://psnow.playstation.com');
  assert.equal(
    parseChromiumOriginName('https_my.account.sony.com_0.indexeddb.leveldb'),
    'https://my.account.sony.com'
  );
  assert.equal(parseChromiumOriginName('CURRENT'), null);
});

test('extracts origin/key maps from roaming local storage and session storage logs', () => {
  const localStorageSnippet =
    'META:https://psnow.playstation.com\u0000$_https://psnow.playstation.com\u0000\u0001DUID\u0000' +
    'm_https://psnow.playstation.com\u0000\u0001privacyLevel-abc123\u0000' +
    'B_https://my.account.sony.com\u0000\u0001!telemetry-web!identifier-session-id\u0000';
  const sessionStorageSnippet =
    'namespace-ca40edb3-https://psnow.playstation.com/' +
    '\u0000map-0-modernizr\u0000map-1-ak_bm_tab_id\u0000' +
    'namespace-ca40edb3-https://my.account.sony.com/' +
    '\u0000map-0-modernizr\u0000map-1-dummy\u0000';

  const localStorage = extractLevelDbOriginKeyMap(localStorageSnippet);
  assert.deepEqual(localStorage.origins, ['https://my.account.sony.com', 'https://psnow.playstation.com']);
  assert.deepEqual(localStorage.keysByOrigin['https://psnow.playstation.com'], ['DUID', 'privacyLevel-abc123']);
  assert.deepEqual(localStorage.keysByOrigin['https://my.account.sony.com'], ['!telemetry-web!identifier-session-id']);

  const sessionStorage = extractSessionStorageOriginKeyMap(sessionStorageSnippet);
  assert.deepEqual(sessionStorage.origins, ['https://my.account.sony.com', 'https://psnow.playstation.com']);
  assert.deepEqual(sessionStorage.keysByOrigin['https://psnow.playstation.com'], ['ak_bm_tab_id', 'modernizr']);
  assert.deepEqual(sessionStorage.keysByOrigin['https://my.account.sony.com'], ['dummy', 'modernizr']);
});

test('redacts cached redirect handoff URLs and code-cache asset urls', () => {
  const assetSnippet =
    '_keyhttps://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/apollo.js ' +
    'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/vendor.js';
  const redirectSnippet =
    'Location: https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/grc-response.html?code=abc&cid=def\n' +
    'X-NP-GRANT-CODE: D6mOfF\n' +
    'Location: https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/grc-response.html#access_token=secret&token_type=bearer&expires_in=1199&cid=ghi';

  assert.deepEqual(extractCodeCacheAssetUrls(assetSnippet), [
    'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/apollo.js',
    'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/vendor.js'
  ]);

  const codeRedirect = summarizeRedirectUrl(
    'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/grc-response.html?code=abc&cid=def'
  );
  assert.equal(codeRedirect.kind, 'authorization-code');
  assert.deepEqual(codeRedirect.queryKeys, ['cid', 'code']);
  assert.deepEqual(codeRedirect.fragmentKeys, []);

  const tokenRedirect = summarizeRedirectUrl(
    'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/grc-response.html#access_token=secret&token_type=bearer&expires_in=1199&cid=ghi'
  );
  assert.equal(tokenRedirect.kind, 'access-token');
  assert.deepEqual(tokenRedirect.fragmentKeys, ['access_token', 'cid', 'expires_in', 'token_type']);

  const redirects = extractAuthRedirects(redirectSnippet, 'data_3');
  assert.equal(redirects.length, 2);
  assert.ok(redirects.every((redirect) => redirect.sourceFiles.includes('data_3')));
  assert.ok(redirects.every((redirect) => redirect.path.endsWith('/grc-response.html')));
  assert.ok(redirects.every((redirect) => redirect.hasNpGrantCodeHeader));
});

test('classifies redacted local storage values without exposing contents', () => {
  const utf16Json = Buffer.from(JSON.stringify({ accountID: 'abc', profile: { onlineId: 'user', avatarUrl: 'x' } }), 'utf16le');
  const locale = Buffer.from('en-US', 'utf8');
  const opaque = Buffer.from('000000700041961326564653066362d3635e332d346130622d613332303231616161', 'utf8');

  const jsonSummary = summarizeStorageValue(utf16Json);
  assert.equal(jsonSummary.valueClass, 'json');
  assert.deepEqual(jsonSummary.jsonKeys, ['accountID', 'profile']);
  assert.deepEqual(jsonSummary.jsonNestedKeys?.profile, ['avatarUrl', 'onlineId']);

  const localeSummary = summarizeStorageValue(locale);
  assert.equal(localeSummary.valueClass, 'locale');

  const opaqueSummary = summarizeStorageValue(opaque);
  assert.equal(opaqueSummary.valueClass, 'opaque-id');
  assert.equal(typeof opaqueSummary.sha256Prefix, 'string');
  assert.equal(opaqueSummary.sha256Prefix.length, 16);
});
