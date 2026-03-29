import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAllowlistPatterns,
  extractMainCommandHandlers,
  extractPreloadCommands,
  extractProcessArg,
  extractWebSocketDefaults,
  parseChromiumOriginName,
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
