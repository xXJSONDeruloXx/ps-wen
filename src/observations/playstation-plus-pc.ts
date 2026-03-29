export const PLAYSTATION_PLUS_PC_RUNTIME_VERSION = '9.0.4' as const;

export const PLAYSTATION_PLUS_PC_PACKAGE_NAME = 'playstation-now' as const;

export const PLAYSTATION_PLUS_PC_APP_URL_PATTERN = 'https://psnow.playstation.com/app/<major.minor.patch>/<build>/<hash>/' as const;

export const PLAYSTATION_PLUS_PC_UPDATER_META_URL = 'https://download-psnow.playstation.com/downloads/psnow/pc/meta' as const;

export const PLAYSTATION_PLUS_PC_LOCAL_IPC = {
  protocol: 'ws',
  host: 'localhost',
  port: 1235,
  identities: ['AGL', 'QAS', 'NOTIFIER']
} as const;

export const PLAYSTATION_PLUS_PC_ALLOWLIST_PATTERNS = [
  'https://psnow.playstation.com/app/[0-9.]+/[a-z/0-9]+',
  'https://id.sonyentertainmentnetwork.com/id/management(_ca){0,1}/[a-z/0-9/?#]+',
  'https://www.playstation.com/[locale-path]/network/legal/privacy-policy+',
  'https://www.playstation.com/ps-now',
  'https://id.sonyentertainmentnetwork.com/id/upgrade_account_ca',
  'https://playstation.com/ps-plus-controllers',
  'https://www.playstation.com/ps-plus',
  'https://www.playstation.com/playstation-plus/getting-started'
] as const;

export const PLAYSTATION_PLUS_PC_PRELOAD_COMMANDS = [
  'applicationCommand',
  'audioVolumeControl',
  'gameAlertDeepLink',
  'gamepadDisconnect',
  'gamepadSetRumbleEnabled',
  'gamepadSwap',
  'getPrivacySetting',
  'getVersion',
  'getWindowPosition',
  'invitationDeepLink',
  'isMicConnected',
  'isQueued',
  'isShuttingDown',
  'isStreaming',
  'launchRemote',
  'localRumbleEvent',
  'micControl',
  'notificationWindow',
  'qasSplashScreen',
  'qasTooltip',
  'qasTrayIcon',
  'qasTrayMenu',
  'rawDataDeepLink',
  'requestClientId',
  'requestGame',
  'requestSwitchGame',
  'routeInputToClient',
  'routeInputToPlayer',
  'saveDataDeepLink',
  'sendConnectedControllerEvent',
  'sendMessage',
  'sendMicConnectedEvent',
  'sendXmbCommand',
  'setAnalogStickRateLimit',
  'setAvailable',
  'setSettings',
  'setTopmostWindow',
  'setUrl',
  'setUrlDefaultBrowser',
  'setWindowPosition',
  'showDevTools',
  'startGame',
  'stop',
  'systemStatusDeepLink',
  'testConnection',
  'trayNotification',
  'updater',
  'windowControl',
  'windowFocusIn',
  'windowFocusOut'
] as const;

export const PLAYSTATION_PLUS_PC_NOTIFIER_COMMANDS = [
  'applicationCommand',
  'gamepadDisconnect',
  'gamepadSetRumbleEnabled',
  'gamepadSwap',
  'getPrivacySetting',
  'getVersion',
  'getWindowPosition',
  'isQueued',
  'isShuttingDown',
  'isStreaming',
  'launchRemote',
  'localRumbleEvent',
  'notificationWindow',
  'qasSplashScreen',
  'qasTooltip',
  'qasTrayIcon',
  'qasTrayMenu',
  'requestClientId',
  'requestGame',
  'routeInputToClient',
  'routeInputToPlayer',
  'sendConnectedControllerEvent',
  'sendMessage',
  'sendXmbCommand',
  'setAnalogStickRateLimit',
  'setAvailable',
  'setSettings',
  'setTopmostWindow',
  'setUrl',
  'setUrlDefaultBrowser',
  'setWindowPosition',
  'showDevTools',
  'startGame',
  'stop',
  'testConnection',
  'trayNotification',
  'updater',
  'windowControl'
] as const;

export const PLAYSTATION_PLUS_PC_AUTH_COOKIE_DOMAINS = [
  'psnow.playstation.com',
  'my.account.sony.com',
  'ca.account.sony.com',
  'h.online-metrix.net',
  'skw.eve.account.sony.com'
] as const;

export const PLAYSTATION_PLUS_PC_LOCAL_STORAGE_KEYS = ['DUID', 'currentUser', 'locale'] as const;

export const PLAYSTATION_PLUS_PC_INDEXEDDB_ORIGINS = ['https://my.account.sony.com', 'https://h.online-metrix.net'] as const;

export const PLAYSTATION_PLUS_PC_NETWORK_HINT_HOSTS = [
  'https://redirector.gvt1.com',
  'https://smetrics.aem.playstation.com',
  'https://static.playstation.com',
  'https://web.np.playstation.com'
] as const;

export const PLAYSTATION_PLUS_PC_CODE_CACHE_ASSET_URLS = [
  'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/apollo.js',
  'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/js_ex.min.js',
  'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/vendor.js'
] as const;

export const PLAYSTATION_PLUS_PC_ROAMING_LOCAL_STORAGE_ORIGINS = [
  'https://my.account.sony.com',
  'https://psnow.playstation.com',
  'https://skw.eve.account.sony.com'
] as const;

export const PLAYSTATION_PLUS_PC_ROAMING_SESSION_STORAGE_ORIGINS = [
  'https://my.account.sony.com',
  'https://psnow.playstation.com'
] as const;

export const PLAYSTATION_PLUS_PC_REDACTED_AUTH_REDIRECTS = [
  {
    kind: 'authorization-code',
    path: '/app/2.2.0/133/5cdcc037d/grc-response.html',
    queryKeys: ['cid', 'code']
  },
  {
    kind: 'access-token',
    path: '/app/2.2.0/133/5cdcc037d/grc-response.html',
    fragmentKeys: ['access_token', 'cid', 'expires_in', 'token_type']
  },
  {
    kind: 'other',
    path: '/app/2.2.0/133/5cdcc037d/grc-response.html',
    queryKeys: ['error', 'error_code', 'error_description', 'no_captcha']
  }
] as const;

export type PlaystationPlusPcPreloadCommand = (typeof PLAYSTATION_PLUS_PC_PRELOAD_COMMANDS)[number];
export type PlaystationPlusPcNotifierCommand = (typeof PLAYSTATION_PLUS_PC_NOTIFIER_COMMANDS)[number];
export type PlaystationPlusPcAuthCookieDomain = (typeof PLAYSTATION_PLUS_PC_AUTH_COOKIE_DOMAINS)[number];
export type PlaystationPlusPcLocalStorageKey = (typeof PLAYSTATION_PLUS_PC_LOCAL_STORAGE_KEYS)[number];
export type PlaystationPlusPcIndexedDbOrigin = (typeof PLAYSTATION_PLUS_PC_INDEXEDDB_ORIGINS)[number];
export type PlaystationPlusPcNetworkHintHost = (typeof PLAYSTATION_PLUS_PC_NETWORK_HINT_HOSTS)[number];
export type PlaystationPlusPcCodeCacheAssetUrl = (typeof PLAYSTATION_PLUS_PC_CODE_CACHE_ASSET_URLS)[number];
export type PlaystationPlusPcRoamingLocalStorageOrigin = (typeof PLAYSTATION_PLUS_PC_ROAMING_LOCAL_STORAGE_ORIGINS)[number];
export type PlaystationPlusPcRoamingSessionStorageOrigin = (typeof PLAYSTATION_PLUS_PC_ROAMING_SESSION_STORAGE_ORIGINS)[number];
