import { chromium } from '@playwright/test';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { loadEnv, resolveArtifactPath, toBoolean } from '../lib/env.js';
import {
  exchangeNpssoForCode,
  exchangeNpssoForToken,
  probeBrokerReachability,
  readNpssoFromStorageState,
} from '../lib/psn-auth.js';

const APP_URL = 'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/';
const DEFAULT_STORAGE_STATE = 'artifacts/auth/playstation-storage-state.json';
const DEFAULT_REPORT_PATH = 'artifacts/broker/shell-harness-report.json';
const DEFAULT_SCREENSHOT_PATH = 'artifacts/broker/shell-harness.png';
const DEFAULT_BROKER_LOG_PATH = 'artifacts/broker/mock-broker-harness.jsonl';
const DEFAULT_BROKER_STATE_PATH = 'artifacts/broker/mock-broker-harness-state.json';
const GK_APOLLO_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Electron/11.2.3 Safari/537.36 gkApollo';

type ParsedArgs = {
  flags: Record<string, string | true>;
};

type HarnessReport = {
  generatedAt: string;
  appUrl: string;
  brokerUrl: string;
  brokerReachableInitially: boolean;
  brokerSpawned: boolean;
  storageStateUsed: string | null;
  screenshotPath: string;
  reportPath: string;
  brokerLogPath: string | null;
  brokerStatePath: string | null;
  settleMs: number;
  ageGateCompleted: boolean;
  screenClickCompleted: boolean;
  textClickCompleted: boolean;
  consoleMessages: Array<{ type: string; text: string }>;
  pageErrors: string[];
  requestFailures: Array<{ url: string; errorText: string }>;
  websockets: Array<{
    url: string;
    sent: string[];
    received: string[];
    errors: string[];
  }>;
  initState: {
    amdRequirePresent: boolean;
    windowGaikaiPresent: boolean;
    ipcPresent: boolean;
    appGlobals: string[];
    pageUrl: string;
    title: string;
  };
  finalState: {
    pageUrl: string;
    title: string;
    bodyTextSample: string;
    buttonTexts: string[];
    headings: string[];
    mediaElements: Array<{
      tag: string;
      id: string | null;
      className: string;
      width: number;
      height: number;
      visible: boolean;
      src: string | null;
    }>;
    links: Array<{
      text: string;
      href: string | null;
    }>;
  };
  authDebug: {
    storageStateSummary: {
      exists: boolean;
      cookieCount: number;
      originCount: number;
      playstationCookieNames: string[];
      originUrls: string[];
    };
    gcSessionService: {
      present: boolean;
      createAuthCodeSession: boolean;
      createAccessTokenSession: boolean;
      patched: boolean;
    };
    contextCookies: Array<{
      name: string;
      domain: string;
      path: string;
      secure: boolean;
      httpOnly: boolean;
      sameSite: string;
      valueLength: number;
      valuePreview: string | null;
    }>;
    currentOriginStorage: {
      origin: string;
      localStorage: Array<{ key: string; valueLength: number; valuePreview: string | null }>;
      sessionStorage: Array<{ key: string; valueLength: number; valuePreview: string | null }>;
    };
    storageStateOrigins: Array<{
      origin: string;
      localStorageKeys: string[];
      interestingLocalStorage: Array<{ key: string; valueLength: number; valuePreview: string | null }>;
    }>;
    requestTrace: Array<{
      stage: 'request' | 'response';
      method: string;
      url: string;
      resourceType: string;
      postDataPreview?: string | null;
      status?: number;
      location?: string | null;
      setCookieNames?: string[];
      contentType?: string | null;
      bodyPreview?: string | null;
    }>;
  };
  scenarios: unknown[];
  bridgeLog: unknown[];
};

const INIT_SCRIPT = String.raw`(function () {
  var root = window;
  var bridgeLog = [];
  var record = function (kind, payload) {
    bridgeLog.push({ ts: new Date().toISOString(), kind: kind, payload: payload });
  };
  root.__PSWEN_BRIDGE_LOG = bridgeLog;
  root.pluginHandler = root.pluginHandler || {};
  root.sce = root.sce || {
    readRegistry: function (key) {
      if (key === 'net_common_device') return 'wifi';
      return null;
    },
    exit: function () {
      record('sce.exit', Array.prototype.slice.call(arguments));
    }
  };

  var listeners = new Map();
  var callbackEvent = null;
  var callbackError = null;
  var brokerWs = null;
  var brokerReady = null;
  var brokerUrl = root.__PSWEN_BROKER_URL || 'ws://localhost:1235/';

  function translateBrokerName(name) {
    switch (name) {
      case 'GOT_CLIENT_ID': return 'GotClientId';
      case 'PROCESS_END': return 'ProcessEnd';
      case 'GOT_LAUNCH_SPEC': return 'GotLaunchSpec';
      case 'VIDEO_START': return 'VideoStart';
      case 'IS_STREAMING': return 'isStreaming';
      case 'IS_QUEUED': return 'isQueued';
      default: return name;
    }
  }

  function getListeners(name) {
    return listeners.get(name) || [];
  }

  function emitListener(name, payload) {
    getListeners(name).forEach(function (cb) {
      try { cb(payload); } catch (error) { record('ipc.listener.error', { name: name, error: String(error) }); }
    });
  }

  function emitPluginEvent(eventObj) {
    emitListener('event', eventObj);
    if (callbackEvent) {
      try { callbackEvent(eventObj); } catch (error) { record('ipc.callback.error', { error: String(error) }); }
    }
  }

  function dispatchBrokerEvent(parsed) {
    if (!parsed || typeof parsed !== 'object' || typeof parsed.name !== 'string') return;
    var translated = translateBrokerName(parsed.name);
    var payload = parsed.payload || {};
    var code = parsed.code;
    if (translated === 'isStreaming') {
      emitPluginEvent({ type: 'isStreaming', name: payload && payload.isStreaming ? payload.isStreaming : 'true' });
      return;
    }
    if (translated === 'isQueued') {
      emitPluginEvent({ type: 'isQueued', name: payload && payload.isQueued ? payload.isQueued : 'false' });
      return;
    }
    var eventObj = { name: translated, code: code, result: JSON.stringify(payload) };
    emitPluginEvent(eventObj);
  }

  function ensureBroker() {
    if (brokerWs && brokerWs.readyState === WebSocket.OPEN) return Promise.resolve(brokerWs);
    if (brokerReady) return brokerReady;
    brokerReady = new Promise(function (resolve, reject) {
      var ws = new WebSocket(brokerUrl);
      brokerWs = ws;
      ws.addEventListener('open', function () {
        record('ipc.ws.open', { url: brokerUrl });
        emitListener('connected', { type: 'connected' });
        resolve(ws);
      }, { once: true });
      ws.addEventListener('error', function () {
        record('ipc.ws.error', { url: brokerUrl });
        reject(new Error('WebSocket error'));
      }, { once: true });
      ws.addEventListener('message', function (event) {
        var text = typeof event.data === 'string' ? event.data : String(event.data);
        record('ipc.ws.in', text);
        var parsed = null;
        try { parsed = JSON.parse(text); } catch { parsed = null; }
        if (parsed && parsed.name) dispatchBrokerEvent(parsed);
      });
      ws.addEventListener('close', function () {
        record('ipc.ws.close', { url: brokerUrl });
        brokerWs = null;
      });
    }).finally(function () {
      brokerReady = null;
    });
    return brokerReady;
  }

  function sendBroker(command, params) {
    return ensureBroker().then(function (ws) {
      var text = JSON.stringify({ command: command, params: params || {} });
      record('ipc.ws.out', text);
      ws.send(text);
      return true;
    }).catch(function (error) {
      record('ipc.ws.send.error', { command: command, error: String(error) });
      return false;
    });
  }

  var ipc = {
    identity: 'AGL',
    addListener: function (name, cb) {
      record('ipc.addListener', { name: name });
      var arr = listeners.get(name) || [];
      arr.push(cb);
      listeners.set(name, arr);
      if (name === 'connected') {
        Promise.resolve().then(function () { cb({ type: 'connected' }); });
      }
    },
    on: function (name, cb, _key) {
      this.addListener(name, cb);
    },
    removeListener: function (name, cb) {
      record('ipc.removeListener', { name: name });
      if (!cb) {
        listeners.delete(name);
        return;
      }
      var arr = (listeners.get(name) || []).filter(function (item) { return item !== cb; });
      listeners.set(name, arr);
    },
    off: function (name, cb, _key) {
      this.removeListener(name, cb);
    },
    setCallbacks: function (eventCb, errorCb) {
      record('ipc.setCallbacks', {});
      callbackEvent = eventCb;
      callbackError = errorCb;
    },
    ready: function () { record('ipc.ready', {}); },
    sendMessage: function (message, target) {
      record('ipc.sendMessage', { message: message, target: target });
    },
    windowControl: function (command, target) {
      record('ipc.windowControl', { command: command, target: target });
      if (command === 'query') {
        emitListener('window-restore', { target: target || 'AGL', name: 'restore' });
        emitListener('window-focus', { target: target || 'AGL', name: 'focus' });
      }
    },
    setUrl: function (url, target) { record('ipc.setUrl', { url: url, target: target }); },
    setUrlDefaultBrowser: function (url) { record('ipc.setUrlDefaultBrowser', { url: url }); },
    qasTrayMenu: function (payload) { record('ipc.qasTrayMenu', payload); },
    qasTooltip: function (payload) { record('ipc.qasTooltip', payload); },
    showSplashScreen: function (value) { record('ipc.showSplashScreen', { value: value }); },
    notificationWindowSetVisible: function (value) { record('ipc.notificationWindowSetVisible', { value: value }); },
    notificationWindowSetUrl: function (url) { record('ipc.notificationWindowSetUrl', { url: url }); },
    updater: function (payload) { record('ipc.updater', payload); },
    applicationCommand: function (command) { record('ipc.applicationCommand', { command: command }); },
    getVersion: function () { record('ipc.getVersion', { identity: this.identity }); return 'mock-ipc/0.1.0'; },
    getDuid: function () {
      var duid = '0000000700400190' + 'mockduid' + Date.now();
      record('ipc.getDuid', { duid: duid });
      return duid;
    },
    getPrivacySetting: function () {
      record('ipc.getPrivacySetting', {});
      Promise.resolve().then(function () {
        emitPluginEvent({ type: 'privacySetting', name: 'ALL' });
      });
    },
    sendConnectedControllerEvent: function () { record('ipc.sendConnectedControllerEvent', {}); },
    gamepadSetRumbleEnabled: function (playerId, enabled) { record('ipc.gamepadSetRumbleEnabled', { playerId: playerId, enabled: enabled }); },
    requestClientId: function () { return sendBroker('requestClientId', {}); },
    setSettings: function (payload) { return sendBroker('setSettings', typeof payload === 'string' ? (function(){ try{return JSON.parse(payload);}catch{return { raw: payload }; } })() : payload); },
    requestGame: function (payload) { return sendBroker('requestGame', typeof payload === 'boolean' ? { forceLogout: payload } : payload); },
    startGame: function () { return sendBroker('startGame', {}); },
    stop: function () { return sendBroker('stop', {}); },
    testConnection: function () { return sendBroker('testConnection', {}); },
    routeInputToPlayer: function () { return sendBroker('routeInputToPlayer', {}); },
    routeInputToClient: function () { return sendBroker('routeInputToClient', {}); },
    rawDataDeepLink: function (a, b) { return sendBroker('rawDataDeepLink', { a: a, b: b }); },
    saveDataDeepLink: function (payload) { return sendBroker('saveDataDeepLink', payload); },
    invitationDeepLink: function (requestId, sessionId, invitationId) { return sendBroker('invitationDeepLink', { requestId: requestId, sessionId: sessionId, invitationId: invitationId }); },
    gameAlertDeepLink: function (requestId, itemId) { return sendBroker('gameAlertDeepLink', { requestId: requestId, itemId: itemId }); },
    sendXmbCommand: function (a, b) { return sendBroker('sendXmbCommand', { a: a, b: b }); },
    isStreaming: function () { return sendBroker('isStreaming', {}); },
    isQueued: function () { return sendBroker('isQueued', {}); }
  };
  root.gaikai = root.gaikai || {};
  root.gaikai.ipc = ipc;
  root.__pswenEmitIpcEvent = function (name, payload) {
    emitListener(name, payload);
  };
})();`;

const AUTH_SESSION_PATCH_SCRIPT = String.raw`(function () {
  var root = window;
  function record(kind, payload) {
    var log = root.__PSWEN_BRIDGE_LOG = root.__PSWEN_BRIDGE_LOG || [];
    log.push({ ts: new Date().toISOString(), kind: kind, payload: payload });
  }
  function tryPatch() {
    try {
      var GC = root.GrandCentral;
      var proto = GC && GC.UserSessionService && GC.UserSessionService.prototype;
      if (!proto || proto.__pswenAuthPatched) return Boolean(proto && proto.__pswenAuthPatched);
      if (typeof proto.createAccessTokenSession !== 'function') return false;
      var original = typeof proto.createAuthCodeSession === 'function' ? proto.createAuthCodeSession : null;
      proto.createAuthCodeSession = function () {
        record('auth.patch.createAuthCodeSession', { mode: 'createAccessTokenSession' });
        try {
          return proto.createAccessTokenSession.call(this).catch(function (error) {
            record('auth.patch.createAccessTokenSession.error', { error: String(error) });
            if (original) return original.call(this);
            throw error;
          }.bind(this));
        } catch (error) {
          record('auth.patch.createAccessTokenSession.throw', { error: String(error) });
          if (original) return original.call(this);
          throw error;
        }
      };
      proto.__pswenAuthPatched = true;
      record('auth.patch.applied', {
        createAuthCodeSession: typeof proto.createAuthCodeSession === 'function',
        createAccessTokenSession: typeof proto.createAccessTokenSession === 'function'
      });
      return true;
    } catch (error) {
      record('auth.patch.error', { error: String(error) });
      return false;
    }
  }
  if (tryPatch()) return;
  var startedAt = Date.now();
  var timer = setInterval(function () {
    if (tryPatch() || Date.now() - startedAt > 30000) clearInterval(timer);
  }, 50);
})();`;

const PAGE_SCENARIO_SCRIPT = String.raw`(async function () {
  const seed = window.__PSWEN_SEED;
  const win = window;
  const log = win.__PSWEN_BRIDGE_LOG = win.__PSWEN_BRIDGE_LOG || [];
  const record = function (kind, payload) {
    log.push({ ts: new Date().toISOString(), kind, payload });
  };
  const amdRequire = window.require;
  if (typeof amdRequire !== 'function') {
    return [{ name: 'bootstrap', ok: false, error: 'AMD require() not available in page' }];
  }

  const CloudPlayer = amdRequire('apollo/bridge/cloud-player/cloudPlayer').default;
  const pluginEventMap = amdRequire('apollo/bridge/cloud-player/events/pluginEventMap').default;

  function BrokerBridgePlugin() {
    this.ws = null;
    this.wsReady = null;
    this.eventHandler = null;
    this.errorHandler = null;
    this.queuedEvents = [];
  }

  BrokerBridgePlugin.prototype.ensureWs = function () {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.wsReady) return this.wsReady;
    var self = this;
    this.wsReady = new Promise(function (resolve, reject) {
      var ws = new WebSocket(seed.brokerUrl);
      self.ws = ws;
      ws.addEventListener('open', function () {
        record('bridge.ws.open', { url: seed.brokerUrl });
        resolve();
      }, { once: true });
      ws.addEventListener('error', function () {
        record('bridge.ws.error', { url: seed.brokerUrl });
        reject(new Error('WebSocket error'));
      }, { once: true });
      ws.addEventListener('message', function (event) {
        var text = typeof event.data === 'string' ? event.data : String(event.data);
        record('bridge.ws.in', text);
        var parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        if (!parsed || typeof parsed !== 'object') return;
        if (typeof parsed.name === 'string') {
          var name = String(parsed.name);
          if (name === 'GOT_CLIENT_ID') name = pluginEventMap.GOT_CLIENT_ID;
          if (name === 'PROCESS_END') name = pluginEventMap.PROCESS_END;
          if (name === 'GOT_LAUNCH_SPEC') name = pluginEventMap.GOT_LAUNCH_SPEC;
          if (name === 'VIDEO_START') name = pluginEventMap.VIDEO_START;
          if (name === 'IS_STREAMING') name = pluginEventMap.IS_STREAMING;
          var payload = parsed.payload;
          var code = parsed.code;
          if (name === 'GOT_CLIENT_ID' && payload && typeof payload === 'object') {
            if (payload.gkClientId && !payload.clientId) payload.clientId = payload.gkClientId;
            if (payload.ps3GKClientID && !payload.ps3GkClientId) payload.ps3GkClientId = payload.ps3GKClientID;
          }
          if (self.eventHandler) self.eventHandler(name, code, payload);
          else self.queuedEvents.push({ name: name, code: code, payload: payload });
        }
      });
    }).finally(function () {
      self.wsReady = null;
    });
    return this.wsReady;
  };

  BrokerBridgePlugin.prototype.flushQueuedEvents = function () {
    if (!this.eventHandler) return;
    while (this.queuedEvents.length) {
      var evt = this.queuedEvents.shift();
      this.eventHandler(evt.name, evt.code, evt.payload);
    }
  };

  BrokerBridgePlugin.prototype.send = function (command, params) {
    var self = this;
    return this.ensureWs().then(function () {
      var text = JSON.stringify({ command: command, params: params });
      record('bridge.ws.out', text);
      self.ws && self.ws.send(text);
    });
  };

  BrokerBridgePlugin.prototype.setEventHandler = function (cb) {
    record('plugin.setEventHandler', {});
    this.eventHandler = cb;
    this.flushQueuedEvents();
  };
  BrokerBridgePlugin.prototype.setErrorHandler = function (cb) {
    record('plugin.setErrorHandler', {});
    this.errorHandler = cb;
  };
  BrokerBridgePlugin.prototype.getStatus = function (cb) {
    var status = { userId: 'pswen-user', entitlementId: seed.entitlementId, status: 'Idle' };
    record('plugin.getStatus', status);
    cb(status);
  };
  BrokerBridgePlugin.prototype.reset = function (cb) {
    record('plugin.reset', {});
    cb({ result: true });
  };
  BrokerBridgePlugin.prototype.setSettings = function (payload, cb) {
    var normalized = payload;
    if (typeof payload === 'string') {
      try { normalized = JSON.parse(payload); } catch { normalized = { raw: payload }; }
    }
    record('plugin.setSettings', normalized);
    void this.send('setSettings', normalized);
    cb({ result: true });
  };
  BrokerBridgePlugin.prototype.requestClientId = function () {
    record('plugin.requestClientId', {});
    void this.send('requestClientId', {});
  };
  BrokerBridgePlugin.prototype.setTitleInfo = function (payload, cb) {
    record('plugin.setTitleInfo', payload);
    void this.send('setTitleInfo', payload);
    cb({ result: true });
  };
  BrokerBridgePlugin.prototype.setAuthCodes = function (a, b, c, d) {
    var callback = typeof c === 'function' ? c : typeof d === 'function' ? d : null;
    var payload = { gkCloudAuthCode: a, gkPs3AuthCode: b };
    if (typeof c !== 'function' && c !== undefined) payload.streamServerAuthCode = c;
    record('plugin.setAuthCodes', payload);
    void this.send('setAuthCodes', payload);
    if (callback) callback({ result: true });
  };
  BrokerBridgePlugin.prototype.requestGame = function (forceLogout, cb) {
    var payload = typeof forceLogout === 'boolean' ? { forceLogout: forceLogout } : forceLogout;
    record('plugin.requestGame', payload);
    void this.send('requestGame', payload);
    if (cb) cb({ result: true });
  };
  BrokerBridgePlugin.prototype.cancelRequestGame = function (cb) {
    record('plugin.cancelRequestGame', {});
    if (cb) cb({ result: true });
  };
  BrokerBridgePlugin.prototype.leaveLine = function (cb) {
    record('plugin.leaveLine', {});
    if (cb) cb({ result: true });
  };
  BrokerBridgePlugin.prototype.testConnection = function () {
    record('plugin.testConnection', {});
    void this.send('testConnection', {});
  };

  var bridgeCore = {
    redirectUri: seed.appUrl + 'grc-response.html',
    killApp: function (appId, cb) {
      record('core.killApp', { appId: appId });
      if (cb) cb({ result: true });
    },
    readRegistry: function (key) {
      record('core.readRegistry', { key: key });
      if (key === 'summer_time') return false;
      if (key === 'np_env') return 'e1-np';
      return null;
    },
    getAuthCode: function () {
      var args = Array.prototype.slice.call(arguments);
      var clientId = args[0];
      var maybeMode = args[1];
      var maybeRedirect = args[2];
      var maybeCb = args[3];
      var authCode;
      if (maybeMode === 'streamServer') authCode = seed.streamServerAuthCode || ('mock-stream-' + String(clientId).slice(0, 6));
      else if (maybeMode === 'ps3') authCode = seed.ps3AuthCode;
      else if (typeof maybeRedirect === 'string' && maybeRedirect.indexOf('versa:user_update_entitlements_first_play') !== -1) authCode = seed.cloudAuthCode;
      else if (maybeMode === 'gkCloud') authCode = seed.cloudAuthCode;
      else authCode = seed.ps3AuthCode || seed.cloudAuthCode || ('mock-' + String(clientId).slice(0, 6));
      var result = { auth_code: authCode || ('mock-' + String(clientId).slice(0, 6)) };
      record('core.getAuthCode', { args: args, result: result });
      if (typeof maybeCb === 'function') maybeCb(result);
      return Promise.resolve(result);
    },
    launchApp: function (name) {
      record('core.launchApp', { name: name });
    },
    getUserInfoList: function (cb) {
      var result = { info: { login: 'MetalCrabDip', user_id: '7380464838673082724' } };
      record('core.getUserInfoList', result);
      cb(result);
    }
  };

  function createBridgePlugin(label, options) {
    options = options || {};
    function BridgePlugin() {
      this.ws = null;
      this.wsReady = null;
      this.eventHandler = null;
      this.errorHandler = null;
      this.queuedEvents = [];
      this.callbackEvent = null;
      this.callbackError = null;
    }
    BridgePlugin.prototype.ensureWs = function () {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
      if (this.wsReady) return this.wsReady;
      var self = this;
      this.wsReady = new Promise(function (resolve, reject) {
        var ws = new WebSocket(seed.brokerUrl);
        self.ws = ws;
        ws.addEventListener('open', function () {
          record(label + '.ws.open', { url: seed.brokerUrl });
          resolve();
        }, { once: true });
        ws.addEventListener('error', function () {
          record(label + '.ws.error', { url: seed.brokerUrl });
          reject(new Error('WebSocket error'));
        }, { once: true });
        ws.addEventListener('message', function (event) {
          var text = typeof event.data === 'string' ? event.data : String(event.data);
          record(label + '.ws.in', text);
          var parsed = null;
          try { parsed = JSON.parse(text); } catch { parsed = null; }
          if (!parsed || typeof parsed !== 'object') return;
          if (typeof parsed.name === 'string') {
            self.dispatchEventFromBroker(parsed.name, parsed.code, parsed.payload);
          }
        });
      }).finally(function () {
        self.wsReady = null;
      });
      return this.wsReady;
    };
    BridgePlugin.prototype.flushQueuedEvents = BrokerBridgePlugin.prototype.flushQueuedEvents;
    BridgePlugin.prototype.send = function (command, params) {
      var self = this;
      return BrokerBridgePlugin.prototype.send.call(this, command, params).then(function () { return self; });
    };
    BridgePlugin.prototype.setEventHandler = function (cb) {
      record(label + '.setEventHandler', {});
      this.eventHandler = cb;
      this.flushQueuedEvents();
    };
    BridgePlugin.prototype.setErrorHandler = function (cb) {
      record(label + '.setErrorHandler', {});
      this.errorHandler = cb;
    };
    BridgePlugin.prototype.setCallbacks = function (eventCb, errorCb) {
      record(label + '.setCallbacks', {});
      this.callbackEvent = eventCb;
      this.callbackError = errorCb;
    };
    BridgePlugin.prototype.ready = function () {
      record(label + '.ready', {});
    };
    BridgePlugin.prototype.dispatchEventFromBroker = function (name, code, payload) {
      var translatedName = name;
      if (translatedName === 'GOT_CLIENT_ID') translatedName = pluginEventMap.GOT_CLIENT_ID;
      if (translatedName === 'PROCESS_END') translatedName = pluginEventMap.PROCESS_END;
      if (translatedName === 'GOT_LAUNCH_SPEC') translatedName = pluginEventMap.GOT_LAUNCH_SPEC;
      if (translatedName === 'VIDEO_START') translatedName = pluginEventMap.VIDEO_START;
      if (translatedName === 'IS_STREAMING') translatedName = pluginEventMap.IS_STREAMING;
      var resultText = JSON.stringify(payload || {});
      if (this.eventHandler) this.eventHandler({ name: translatedName, code: code, result: resultText });
      if (this.callbackEvent) this.callbackEvent({ name: translatedName, code: code, result: resultText });
    };
    BridgePlugin.prototype.getStatus = function (cb) {
      var status = { userId: 'pswen-user', entitlementId: seed.entitlementId, status: 'Idle' };
      record(label + '.getStatus', status);
      cb(status);
    };
    BridgePlugin.prototype.reset = function (cb) {
      record(label + '.reset', {});
      if (cb) cb({ result: true });
      return Promise.resolve({ result: true });
    };
    BridgePlugin.prototype.setSettings = function (payload, cb) {
      var normalized = payload;
      if (typeof payload === 'string') {
        try { normalized = JSON.parse(payload); } catch { normalized = { raw: payload }; }
      }
      record(label + '.setSettings', normalized);
      var p = this.send('setSettings', normalized).then(function () { return { result: true }; });
      if (cb) cb({ result: true });
      return p;
    };
    BridgePlugin.prototype.requestClientId = function () {
      var self = this;
      record(label + '.requestClientId', {});
      return this.send('requestClientId', {}).then(function () { return self; });
    };
    BridgePlugin.prototype.setTitleInfo = function (payload, cb) {
      record(label + '.setTitleInfo', payload);
      var p = this.send('setTitleInfo', payload).then(function () { return { result: true }; });
      if (cb) cb({ result: true });
      return p;
    };
    BridgePlugin.prototype.setAuthCodes = function (a, b, c, d) {
      var callback = typeof c === 'function' ? c : typeof d === 'function' ? d : null;
      var payload = { gkCloudAuthCode: a, gkPs3AuthCode: b };
      if (typeof c !== 'function' && c !== undefined) payload.streamServerAuthCode = c;
      record(label + '.setAuthCodes', payload);
      var p = this.send('setAuthCodes', payload).then(function () { return { result: true }; });
      if (callback) callback({ result: true });
      return p;
    };
    BridgePlugin.prototype.requestGame = function (forceLogout, cb) {
      var payload = typeof forceLogout === 'boolean' ? { forceLogout: forceLogout } : forceLogout;
      record(label + '.requestGame', payload);
      var p = this.send('requestGame', payload).then(function () { return { result: true }; });
      if (cb) cb({ result: true });
      return p;
    };
    BridgePlugin.prototype.cancelRequestGame = function (cb) {
      record(label + '.cancelRequestGame', {});
      if (cb) cb({ result: true });
      return Promise.resolve({ result: true });
    };
    BridgePlugin.prototype.leaveLine = function (cb) {
      record(label + '.leaveLine', {});
      if (cb) cb({ result: true });
      return Promise.resolve({ result: true });
    };
    BridgePlugin.prototype.testConnection = function () {
      record(label + '.testConnection', {});
      return this.send('testConnection', {}).then(function () { return { result: true }; });
    };
    BridgePlugin.prototype.startGame = function () {
      record(label + '.startGame', {});
      return this.send('startGame', {}).then(function () { return { result: true }; });
    };
    BridgePlugin.prototype.stopGame = function () {
      record(label + '.stopGame', {});
      return Promise.resolve({ result: true });
    };
    BridgePlugin.prototype.isStreaming = function () {
      record(label + '.isStreaming', {});
      return false;
    };
    BridgePlugin.prototype.isQueued = function () {
      record(label + '.isQueued', {});
      return false;
    };
    BridgePlugin.prototype.routeInputToPlayer = function () {
      record(label + '.routeInputToPlayer', {});
      return this.send('routeInputToPlayer', {});
    };
    BridgePlugin.prototype.routeInputToClient = function () {
      record(label + '.routeInputToClient', {});
      return this.send('routeInputToClient', {});
    };
    BridgePlugin.prototype.sendXmbCommand = function (a, b) { record(label + '.sendXmbCommand', { a: a, b: b }); };
    BridgePlugin.prototype.saveDataDeepLink = function (payload) { record(label + '.saveDataDeepLink', payload); };
    BridgePlugin.prototype.rawDataDeepLink = function (a, b) { record(label + '.rawDataDeepLink', { a: a, b: b }); };
    BridgePlugin.prototype.invitationDeepLink = function (payload) { record(label + '.invitationDeepLink', payload); };
    BridgePlugin.prototype.gameAlertDeepLink = function (payload) { record(label + '.gameAlertDeepLink', payload); };
    return new BridgePlugin();
  }

  var browserPlugin = new BrokerBridgePlugin();
  var cloudPlayer = new CloudPlayer({
    platform: 'browser',
    plugin: browserPlugin,
    core: bridgeCore,
    cloudEndpoint: 'prod'
  });
  if (cloudPlayer.platformAPI) {
    cloudPlayer.platformAPI.getUserInfo = function () {
      var result = { info: { login: 'MetalCrabDip', user_id: '7380464838673082724' } };
      record('platformAPI.getUserInfo', result);
      return Promise.resolve(result);
    };
    cloudPlayer.platformAPI.getPluginStatus = function () {
      var status = { userId: 'pswen-user', entitlementId: seed.entitlementId, status: 'Idle' };
      this.pluginUserId = status.userId;
      this.pluginEntitlement = status.entitlementId;
      record('platformAPI.getPluginStatus', status);
      return Promise.resolve(status);
    };
  }

  var pcPlugin = createBridgePlugin('pcPlugin');
  var pcCloudPlayer = new CloudPlayer({
    platform: 'pc',
    plugin: pcPlugin,
    core: bridgeCore,
    cloudEndpoint: 'prod'
  });
  if (pcCloudPlayer.platformAPI) {
    pcCloudPlayer.platformAPI.getUserInfo = function () {
      var result = { info: { login: 'MetalCrabDip', user_id: '7380464838673082724' } };
      record('pc.platformAPI.getUserInfo', result);
      return Promise.resolve(result);
    };
    pcCloudPlayer.platformAPI.getPluginStatus = function () {
      var status = { userId: 'pswen-user', entitlementId: seed.entitlementId, status: 'Idle' };
      this.pluginUserId = status.userId;
      this.pluginEntitlement = status.entitlementId;
      record('pc.platformAPI.getPluginStatus', status);
      return Promise.resolve(status);
    };
    pcCloudPlayer.platformAPI.setPluginEventHandler = function () {};
  }

  var requestedGame = {
    apolloSessionId: seed.apolloSessionId,
    cloudSku: { entitlementId: seed.entitlementId },
    name: seed.titleName,
    id: seed.productId,
    game_meta: { name: seed.titleName, icon_url: seed.iconUri },
    tile_image_url: seed.iconUri,
    language: 'en',
    acceptButton: 'X',
    controllerList: ['ds4'],
    isKratos: true,
    forceLogout: false
  };

  var withTimeout = function (name, promiseFactory, timeoutMs) {
    if (timeoutMs === undefined) timeoutMs = 8000;
    var startedAt = Date.now();
    return Promise.race([
      Promise.resolve().then(promiseFactory),
      new Promise(function (_, reject) { setTimeout(function () { reject(new Error('Timed out after ' + timeoutMs + 'ms')); }, timeoutMs); })
    ]).then(function (result) {
      return { name: name, ok: true, durationMs: Date.now() - startedAt, result: result == null ? null : result };
    }).catch(function (error) {
      return { name: name, ok: false, durationMs: Date.now() - startedAt, error: error && error.message ? error.message : String(error) };
    });
  };

  var scenarios = [];
  scenarios.push(await withTimeout('browser.platformAPI.testConnection', function () {
    var maybePromise = cloudPlayer.platformAPI && cloudPlayer.platformAPI.testConnection ? cloudPlayer.platformAPI.testConnection() : null;
    return new Promise(function (resolve) { setTimeout(function () { resolve(maybePromise == null ? null : maybePromise); }, 1000); });
  }));
  scenarios.push(await withTimeout('browser.cloudPlayer.launchGame', function () {
    return cloudPlayer.launchGame(requestedGame);
  }));
  await new Promise(function (resolve) { setTimeout(resolve, 1200); });
  scenarios.push(await withTimeout('pc.platformAPI.testConnection', function () {
    var maybePromise = pcCloudPlayer.platformAPI && pcCloudPlayer.platformAPI.testConnection ? pcCloudPlayer.platformAPI.testConnection() : null;
    return new Promise(function (resolve) { setTimeout(function () { resolve(maybePromise == null ? null : maybePromise); }, 1000); });
  }));
  scenarios.push(await withTimeout('pc.cloudPlayer.launchGame', function () {
    return pcCloudPlayer.launchGame(requestedGame);
  }, 12000));
  await new Promise(function (resolve) { setTimeout(resolve, 1200); });
  scenarios.push(await withTimeout('pc.platformAPI.captureGamepad', function () {
    return pcCloudPlayer.platformAPI && pcCloudPlayer.platformAPI.captureGamepad ? pcCloudPlayer.platformAPI.captureGamepad() : null;
  }, 2000));
  scenarios.push(await withTimeout('pc.platformAPI.releaseGamepad', function () {
    return pcCloudPlayer.platformAPI && pcCloudPlayer.platformAPI.releaseGamepad ? pcCloudPlayer.platformAPI.releaseGamepad() : null;
  }, 2000));
  record('pluginEventMap.sample', {
    GOT_CLIENT_ID: pluginEventMap.GOT_CLIENT_ID,
    PROCESS_END: pluginEventMap.PROCESS_END
  });
  await new Promise(function (resolve) { setTimeout(resolve, 1500); });
  return scenarios;
})()`;

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [key, inline] = token.slice(2).split('=', 2);
    if (inline !== undefined) {
      flags[key] = inline;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i++;
  }
  return { flags };
}

function asString(flag: string | true | undefined, fallback: string): string {
  return typeof flag === 'string' && flag.trim() ? flag : fallback;
}

function asNumber(flag: string | true | undefined, fallback: number): number {
  if (typeof flag !== 'string') return fallback;
  const parsed = Number(flag);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeSensitiveText(value: string | null | undefined) {
  if (value == null) return null;
  return value
    .replace(/([#?&]access_token=)[^&#\s]+/gi, '$1<redacted>')
    .replace(/([?&]token=)[^&]+/gi, '$1<redacted>')
    .replace(/(^|&)token=[^&]+/gi, '$1token=<redacted>')
    .replace(/([#?&]code=)[^&#\s]+/gi, '$1<redacted>')
    .replace(/(^|&)code=[^&]+/gi, '$1code=<redacted>')
    .replace(/("token"\s*:\s*")([^"]+)(")/gi, '$1<redacted>$3')
    .replace(/("access_token"\s*:\s*")([^"]+)(")/gi, '$1<redacted>$3')
    .replace(/("auth_code"\s*:\s*")([^"]+)(")/gi, '$1<redacted>$3');
}

function previewValue(value: string | null | undefined, max = 160) {
  if (value == null) return null;
  const sanitized = sanitizeSensitiveText(value) ?? '';
  return sanitized.length > max ? `${sanitized.slice(0, max)}…` : sanitized;
}

function sanitizePostData(value: string | null | undefined) {
  return sanitizeSensitiveText(value);
}

function isAuthTraceUrl(url: string) {
  return /ca\.account\.sony\.com|my\.account\.sony\.com|web\.np\.playstation\.com\/api\/session|psnow\.playstation\.com\/kamaji\/api\/(?:pcnow|psnow)\/00_09_000\/user(?:\/session|\b)|oauth\/authorize|\/signin\b|login_required|ELdff/i.test(
    url
  );
}

function extractSetCookieNames(setCookieHeader: string | null | undefined) {
  if (!setCookieHeader) return [];
  const matches = [...setCookieHeader.matchAll(/(?:^|[\n,])\s*([^=;,\s]+)=/g)];
  return [...new Set(matches.map((match) => match[1]).filter(Boolean))];
}

async function summarizeStorageStateFile(storageStatePath: string) {
  if (!fs.existsSync(storageStatePath)) {
    return {
      exists: false,
      cookieCount: 0,
      originCount: 0,
      playstationCookieNames: [] as string[],
      originUrls: [] as string[],
    };
  }

  const raw = await fsp.readFile(storageStatePath, 'utf8');
  const parsed = JSON.parse(raw) as {
    cookies?: Array<{ name?: string; domain?: string }>;
    origins?: Array<{ origin?: string }>;
  };
  const cookies = parsed.cookies ?? [];
  const origins = parsed.origins ?? [];
  const playstationCookieNames = cookies
    .filter((cookie) => /sony|playstation/i.test(String(cookie.domain ?? '')))
    .map((cookie) => String(cookie.name ?? ''))
    .filter(Boolean)
    .sort();
  const originUrls = origins.map((origin) => String(origin.origin ?? '')).filter(Boolean).sort();

  return {
    exists: true,
    cookieCount: cookies.length,
    originCount: origins.length,
    playstationCookieNames,
    originUrls,
  };
}

async function maybeCompleteAgeGate(page: import('@playwright/test').Page, parsed: ParsedArgs) {
  if (parsed.flags['auto-age-gate'] !== 'true') return false;
  const dob = typeof parsed.flags['age-gate-dob'] === 'string' ? parsed.flags['age-gate-dob'] : '1990-06-15';
  const [yyyy, mm, dd] = dob.split('-');
  if (!yyyy || !mm || !dd) throw new Error(`Invalid --age-gate-dob: ${dob}`);

  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (!/date of birth|region\/language/i.test(bodyText)) return false;

  const month = page.locator('input:visible').nth(0);
  const day = page.locator('input:visible').nth(1);
  const year = page.locator('input:visible').nth(2);
  await month.click();
  await month.clear();
  await month.pressSequentially(mm, { delay: 35 });
  await month.press('Tab');
  await day.click();
  await day.clear();
  await day.pressSequentially(dd, { delay: 35 });
  await day.press('Tab');
  await year.click();
  await year.clear();
  await year.pressSequentially(yyyy, { delay: 35 });
  await year.press('Tab');

  const regionButton = page.getByRole('button', { name: /united states - english|region\/language/i }).first();
  await regionButton.click().catch(() => undefined);
  const usEnglish = page.getByRole('button', { name: /united states - english/i }).last();
  await usEnglish.click().catch(() => undefined);

  const submit = page.getByRole('button', { name: /submit/i }).first();
  await submit.click().catch(async () => {
    await year.press('Enter');
  });

  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(5_000);
  return true;
}

async function maybeClickScreenPoint(page: import('@playwright/test').Page, parsed: ParsedArgs) {
  const pointsFlag = parsed.flags['click-points'];
  if (typeof pointsFlag === 'string' && pointsFlag.trim()) {
    const pairs = pointsFlag
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [x, y] = part.split(',').map((value) => Number(value.trim()));
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Invalid click point: ${part}`);
        return { x, y };
      });
    for (const point of pairs) {
      await page.mouse.click(point.x, point.y);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(3_000);
    }
    return pairs.length > 0;
  }

  const x = parsed.flags['click-x'];
  const y = parsed.flags['click-y'];
  if (typeof x !== 'string' || typeof y !== 'string') return false;
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) throw new Error(`Invalid click point: ${x},${y}`);
  await page.mouse.click(px, py);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(3_000);
  return true;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function maybeClickText(page: import('@playwright/test').Page, parsed: ParsedArgs) {
  const text = parsed.flags['click-text'];
  if (typeof text !== 'string' || !text.trim()) return false;

  const steps = text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  let clickedAny = false;
  for (const step of steps) {
    const matcher = new RegExp(escapeRegExp(step), 'i');
    const candidates = [
      page.getByRole('button', { name: matcher }).first(),
      page.getByRole('link', { name: matcher }).first(),
      page.getByText(step, { exact: true }).first(),
      page.getByText(matcher).first(),
    ];

    let clickedThisStep = false;
    for (const target of candidates) {
      try {
        await target.click({ timeout: 5_000 });
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        await page.waitForTimeout(3_000);
        clickedThisStep = true;
        clickedAny = true;
        break;
      } catch {
        // try the next candidate
      }
    }

    if (!clickedThisStep) return clickedAny;
  }

  return clickedAny;
}

async function readGaikaiPreflight() {
  const preflightPath = resolveArtifactPath(undefined, 'artifacts/auth/gaikai-preflight.json');
  if (!fs.existsSync(preflightPath)) return null;
  const raw = await fsp.readFile(preflightPath, 'utf8');
  return JSON.parse(raw) as {
    gaikai?: { clientSessionId?: string; apolloId?: string };
    authCodes?: { cloud?: { code?: string }; ps3?: { code?: string } };
  };
}

async function waitForBroker(host: string, port: number, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const probe = await probeBrokerReachability(host, port);
    if (probe.reachable) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function prepareInjectedOauth(storageStatePath: string, parsed: ParsedArgs) {
  if (parsed.flags['inject-oauth'] !== 'true') return null;
  if (!fs.existsSync(storageStatePath)) {
    throw new Error(`Cannot --inject-oauth without storage state: ${storageStatePath}`);
  }
  const npsso = await readNpssoFromStorageState(storageStatePath);
  if (!npsso) {
    throw new Error(`No NPSSO found in storage state: ${storageStatePath}`);
  }
  return { npsso };
}

async function maybeSpawnBroker(host: string, port: number, parsed: ParsedArgs) {
  const initialProbe = await probeBrokerReachability(host, port);
  if (initialProbe.reachable) {
    return {
      initialProbe,
      brokerProcess: null as ChildProcess | null,
      brokerSpawned: false,
      brokerLogPath: null as string | null,
      brokerStatePath: null as string | null,
    };
  }

  if (parsed.flags['spawn-broker'] === 'false') {
    return {
      initialProbe,
      brokerProcess: null as ChildProcess | null,
      brokerSpawned: false,
      brokerLogPath: null as string | null,
      brokerStatePath: null as string | null,
    };
  }

  const brokerLogPath = resolveArtifactPath(
    typeof parsed.flags['broker-log'] === 'string' ? parsed.flags['broker-log'] : undefined,
    DEFAULT_BROKER_LOG_PATH
  );
  const brokerStatePath = resolveArtifactPath(
    typeof parsed.flags['broker-state'] === 'string' ? parsed.flags['broker-state'] : undefined,
    DEFAULT_BROKER_STATE_PATH
  );
  await fsp.mkdir(path.dirname(brokerLogPath), { recursive: true });
  await fsp.mkdir(path.dirname(brokerStatePath), { recursive: true });

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const brokerProcess = spawn(
    npmCmd,
    ['run', 'broker:emulator', '--', '--host', host, '--port', String(port), '--out', brokerLogPath, '--state-out', brokerStatePath],
    {
      cwd: process.cwd(),
      stdio: 'ignore',
      detached: false,
    }
  );

  const ready = await waitForBroker(host, port);
  if (!ready) {
    brokerProcess.kill('SIGTERM');
    throw new Error(`Timed out waiting for spawned broker on ws://${host}:${port}/`);
  }

  return {
    initialProbe,
    brokerProcess,
    brokerSpawned: true,
    brokerLogPath,
    brokerStatePath,
  };
}

async function main() {
  const env = loadEnv();
  const parsed = parseArgs(process.argv.slice(2));
  const host = asString(parsed.flags.host, 'localhost');
  const port = asNumber(parsed.flags.port, 1235);
  const brokerUrl = `ws://${host}:${port}/`;
  const reportPath = resolveArtifactPath(typeof parsed.flags.out === 'string' ? parsed.flags.out : undefined, DEFAULT_REPORT_PATH);
  const screenshotPath = resolveArtifactPath(
    typeof parsed.flags.screenshot === 'string' ? parsed.flags.screenshot : undefined,
    DEFAULT_SCREENSHOT_PATH
  );
  const storageStatePath = resolveArtifactPath(env.PSN_STORAGE_STATE, DEFAULT_STORAGE_STATE);
  const headless = toBoolean(typeof parsed.flags.headless === 'string' ? parsed.flags.headless : env.HEADLESS, true);
  const settleMs = asNumber(parsed.flags['settle-ms'], 0);
  await fsp.mkdir(path.dirname(reportPath), { recursive: true });
  await fsp.mkdir(path.dirname(screenshotPath), { recursive: true });

  const injectedOauth = await prepareInjectedOauth(storageStatePath, parsed);
  const broker = await maybeSpawnBroker(host, port, parsed);
  const consoleMessages: Array<{ type: string; text: string }> = [];
  const pageErrors: string[] = [];
  const requestFailures: Array<{ url: string; errorText: string }> = [];
  const websockets = new Map<string, { url: string; sent: string[]; received: string[]; errors: string[] }>();
  const authRequestTrace: HarnessReport['authDebug']['requestTrace'] = [];
  const authTraceTasks: Promise<void>[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    const contextOptions: Parameters<typeof chromium.launch>[0] = { headless };
    browser = await chromium.launch(contextOptions);
    const ctx = await browser.newContext({
      userAgent: GK_APOLLO_UA,
      storageState: fs.existsSync(storageStatePath) ? storageStatePath : undefined,
      viewport: { width: 1440, height: 900 },
    });

    await ctx.addInitScript({ content: INIT_SCRIPT });
    if (parsed.flags['patch-auth-session'] === 'true') {
      await ctx.addInitScript({ content: AUTH_SESSION_PATCH_SCRIPT });
    }

    const page = await ctx.newPage();
    if (injectedOauth) {
      // Intercept silent OAuth redirects — fresh code/token per request (codes are single-use)
      await page.route('https://ca.account.sony.com/api/v1/oauth/authorize**', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const responseType = url.searchParams.get('response_type');
        const redirectUri = url.searchParams.get('redirect_uri') ?? `${APP_URL}grc-response.html`;

        if (responseType === 'token') {
          try {
            const token = await exchangeNpssoForToken(injectedOauth.npsso, 'entitlements');
            const location = `${redirectUri}#access_token=${encodeURIComponent(token.accessToken)}&cid=${encodeURIComponent(token.correlationId)}&token_type=${encodeURIComponent(token.tokenType)}&expires_in=${encodeURIComponent(String(token.expiresIn))}`;
            await route.fulfill({ status: 302, headers: { location, 'content-type': 'text/plain' }, body: '' });
          } catch (err) {
            console.warn('[inject-oauth] token exchange failed, falling through:', String(err));
            await route.continue();
          }
          return;
        }

        if (responseType === 'code') {
          try {
            const code = await exchangeNpssoForCode(injectedOauth.npsso, 'commerce');
            const location = `${redirectUri}?code=${encodeURIComponent(code.code)}&cid=${encodeURIComponent(code.correlationId)}`;
            await route.fulfill({ status: 302, headers: { location, 'content-type': 'text/plain' }, body: '' });
          } catch (err) {
            console.warn('[inject-oauth] code exchange failed, falling through:', String(err));
            await route.continue();
          }
          return;
        }

        await route.continue();
      });

      // Patch DOB in guest-session fallback POSTs so the app uses the real account DOB
      const realDob =
        typeof parsed.flags['age-gate-dob'] === 'string' && parsed.flags['age-gate-dob'].trim()
          ? parsed.flags['age-gate-dob'].trim()
          : null;
      if (realDob) {
        await page.route(
          'https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/user/session',
          async (route) => {
            const req = route.request();
            const body = req.postData() ?? '';
            if (body.includes('date_of_birth=') && !body.includes(`date_of_birth=${realDob}`)) {
              const patched = body.replace(/date_of_birth=[^&]+/, `date_of_birth=${realDob}`);
              await route.continue({ postData: patched });
            } else {
              await route.continue();
            }
          }
        );
      }
    }
    page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (req) => {
      if (!isAuthTraceUrl(req.url()) || authRequestTrace.length >= 120) return;
      authRequestTrace.push({
        stage: 'request',
        method: req.method(),
        url: req.url(),
        resourceType: req.resourceType(),
        postDataPreview: previewValue(sanitizePostData(req.postData()), 300),
      });
    });
    page.on('response', (resp) => {
      const req = resp.request();
      if (!isAuthTraceUrl(req.url()) || authRequestTrace.length >= 120) return;
      const task = (async () => {
        const headers = await resp.allHeaders().catch(() => ({} as Record<string, string>));
        const contentType = headers['content-type'] ?? null;
        let bodyPreview: string | null = null;
        if (contentType && /json|text|javascript/.test(contentType)) {
          bodyPreview = previewValue(await resp.text().catch(() => ''), 400);
        }
        authRequestTrace.push({
          stage: 'response',
          method: req.method(),
          url: req.url(),
          resourceType: req.resourceType(),
          status: resp.status(),
          location: sanitizeSensitiveText(headers.location ?? null),
          setCookieNames: extractSetCookieNames(headers['set-cookie']),
          contentType,
          bodyPreview,
        });
      })();
      authTraceTasks.push(task);
    });
    page.on('requestfailed', (req) => {
      requestFailures.push({ url: req.url(), errorText: req.failure()?.errorText ?? 'unknown' });
    });
    page.on('websocket', (ws) => {
      const entry = { url: ws.url(), sent: [] as string[], received: [] as string[], errors: [] as string[] };
      websockets.set(ws.url(), entry);
      ws.on('framesent', (event) => entry.sent.push(String(event.payload).slice(0, 400)));
      ws.on('framereceived', (event) => entry.received.push(String(event.payload).slice(0, 400)));
      ws.on('socketerror', (error) => entry.errors.push(error));
    });

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(3_000);

    const preflight = await readGaikaiPreflight();
    const launchSeed = {
      apolloSessionId: preflight?.gaikai?.clientSessionId ?? preflight?.gaikai?.apolloId ?? 'mock-apollo-session',
      cloudAuthCode: preflight?.authCodes?.cloud?.code ?? 'mock-cloud-code',
      ps3AuthCode: preflight?.authCodes?.ps3?.code ?? 'mock-ps3-code',
      entitlementId: 'UP9000-CUSA08966_00-DAYSGONECOMPLETE',
      productId: 'UP9000-CUSA08966_00-DAYSGONECOMPLETE',
      titleName: 'Days Gone',
      iconUri: 'https://example.invalid/days-gone.png',
      titleId: 'CUSA08966',
      brokerUrl,
      appUrl: APP_URL,
    };

    const initState = await page.evaluate(() => {
      const win = window as unknown as Record<string, unknown> & { gaikai?: Record<string, unknown> };
      return {
        amdRequirePresent: typeof (window as unknown as { require?: unknown }).require === 'function',
        windowGaikaiPresent: Boolean(win.gaikai),
        ipcPresent: Boolean(win.gaikai?.ipc),
        appGlobals: Object.keys(win).filter((key) => /gaikai|GrandCentral|Ember|require|define|sce/i.test(key)).sort(),
        pageUrl: location.href,
        title: document.title,
      };
    });

    const scenarios = parsed.flags['skip-scenarios'] === 'true'
      ? []
      : ((await page.evaluate(
          ({ seed, script }) => {
            (window as unknown as { __PSWEN_SEED?: unknown }).__PSWEN_SEED = seed;
            return (0, eval)(script) as unknown;
          },
          { seed: launchSeed, script: PAGE_SCENARIO_SCRIPT }
        )) as unknown[]);

    const ageGateCompleted = await maybeCompleteAgeGate(page, parsed);
    if (ageGateCompleted) {
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(3_000);
    }

    const screenClicked = await maybeClickScreenPoint(page, parsed);
    if (screenClicked) {
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(3_000);
    }

    const textClicked = await maybeClickText(page, parsed);
    if (textClicked) {
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(3_000);
    }

    if (settleMs > 0) {
      await page.waitForTimeout(settleMs);
    }

    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    await Promise.allSettled(authTraceTasks);

    const bridgeLog = await page.evaluate(() => {
      const win = window as unknown as { __PSWEN_BRIDGE_LOG?: unknown[] };
      return win.__PSWEN_BRIDGE_LOG ?? [];
    });

    const finalState = await page.evaluate(() => {
      const bodyText = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
      const buttonTexts = Array.from(document.querySelectorAll('button'))
        .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 20);
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
        .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 20);
      const mediaElements = Array.from(document.querySelectorAll('video,canvas,object,embed,iframe'))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const srcCandidate = (el as HTMLIFrameElement).src || (el as HTMLVideoElement).currentSrc || el.getAttribute('src');
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            className: (el.className || '').toString(),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') !== 0 && rect.width > 0 && rect.height > 0,
            src: srcCandidate || null,
          };
        })
        .slice(0, 50);
      const links = Array.from(document.querySelectorAll('a'))
        .map((el) => ({
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          href: el.getAttribute('href'),
        }))
        .filter((item) => item.text || item.href)
        .slice(0, 80);
      return {
        pageUrl: location.href,
        title: document.title,
        bodyTextSample: bodyText.slice(0, 2000),
        buttonTexts,
        headings,
        mediaElements,
        links,
      };
    });

    const currentOriginStorage = await page.evaluate(() => {
      const localStorageItems = [] as Array<{ key: string; valueLength: number; valuePreview: string | null }>;
      for (let index = 0; index < window.localStorage.length; index++) {
        const key = window.localStorage.key(index) ?? '';
        const value = window.localStorage.getItem(key) ?? '';
        localStorageItems.push({
          key,
          valueLength: value.length,
          valuePreview: value.length > 160 ? `${value.slice(0, 160)}…` : value,
        });
      }

      const sessionStorageItems = [] as Array<{ key: string; valueLength: number; valuePreview: string | null }>;
      for (let index = 0; index < window.sessionStorage.length; index++) {
        const key = window.sessionStorage.key(index) ?? '';
        const value = window.sessionStorage.getItem(key) ?? '';
        sessionStorageItems.push({
          key,
          valueLength: value.length,
          valuePreview: value.length > 160 ? `${value.slice(0, 160)}…` : value,
        });
      }

      return {
        origin: location.origin,
        localStorage: localStorageItems,
        sessionStorage: sessionStorageItems,
      };
    });

    const gcSessionService = await page.evaluate(() => {
      const GC = (window as unknown as { GrandCentral?: { UserSessionService?: { prototype?: Record<string, unknown> } } }).GrandCentral;
      const proto = GC?.UserSessionService?.prototype;
      return {
        present: Boolean(proto),
        createAuthCodeSession: typeof proto?.createAuthCodeSession === 'function',
        createAccessTokenSession: typeof proto?.createAccessTokenSession === 'function',
        patched: Boolean(proto && '__pswenAuthPatched' in proto),
      };
    }).catch(() => ({
      present: false,
      createAuthCodeSession: false,
      createAccessTokenSession: false,
      patched: false,
    }));

    const contextCookies = (await ctx.cookies())
      .filter((cookie) => /sony|playstation/i.test(cookie.domain) || /npsso|pdc|sess|auth|token|user/i.test(cookie.name))
      .map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        valueLength: cookie.value.length,
        valuePreview: previewValue(cookie.value),
      }))
      .sort((a, b) => `${a.domain}:${a.name}`.localeCompare(`${b.domain}:${b.name}`));

    const storageStateSnapshot = (await ctx.storageState({ indexedDB: true })) as {
      origins?: Array<{ origin?: string; localStorage?: Array<{ name?: string; value?: string }> }>;
    };
    const storageStateOrigins = (storageStateSnapshot.origins ?? [])
      .map((origin) => ({
        origin: String(origin.origin ?? ''),
        localStorageKeys: (origin.localStorage ?? []).map((item) => String(item.name ?? '')).filter(Boolean).sort(),
        interestingLocalStorage: (origin.localStorage ?? [])
          .filter((item) => /user|sign|session|chimera|gpdc|token|auth/i.test(String(item.name ?? '')))
          .map((item) => ({
            key: String(item.name ?? ''),
            valueLength: String(item.value ?? '').length,
            valuePreview: previewValue(String(item.value ?? '')),
          })),
      }))
      .filter((origin) => origin.origin || origin.localStorageKeys.length > 0)
      .sort((a, b) => a.origin.localeCompare(b.origin));

    const storageStateSummary = await summarizeStorageStateFile(storageStatePath);

    const report: HarnessReport = {
      generatedAt: new Date().toISOString(),
      appUrl: APP_URL,
      brokerUrl,
      brokerReachableInitially: broker.initialProbe.reachable,
      brokerSpawned: broker.brokerSpawned,
      storageStateUsed: fs.existsSync(storageStatePath) ? storageStatePath : null,
      screenshotPath,
      reportPath,
      brokerLogPath: broker.brokerLogPath,
      brokerStatePath: broker.brokerStatePath,
      settleMs,
      ageGateCompleted,
      screenClickCompleted: screenClicked,
      textClickCompleted: textClicked,
      consoleMessages,
      pageErrors,
      requestFailures,
      websockets: [...websockets.values()],
      initState,
      finalState,
      authDebug: {
        storageStateSummary,
        gcSessionService,
        contextCookies,
        currentOriginStorage,
        storageStateOrigins,
        requestTrace: authRequestTrace,
      },
      scenarios,
      bridgeLog,
    };

    await fsp.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`[shell-harness] wrote ${reportPath}`);
    console.log(`[shell-harness] screenshot ${screenshotPath}`);
    console.log(`[shell-harness] scenarios:`);
    for (const scenario of scenarios as Array<{ name?: string; ok?: boolean; error?: string }>) {
      console.log(`  - ${scenario.name}: ${scenario.ok ? 'ok' : 'error'}${scenario.error ? ` (${scenario.error})` : ''}`);
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (broker.brokerProcess) {
      broker.brokerProcess.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  console.error('[shell-harness] fatal:', error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
