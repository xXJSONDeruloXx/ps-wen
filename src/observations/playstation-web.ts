export const KNOWN_WEB_SESSION_COOKIES = ['isSignedIn', 'session', 'userinfo', 'pdcws2', 'pdcsi'] as const;

export const KNOWN_PLAYSTATION_COM_STORAGE_KEYS = ['userId', 'gpdcUser'] as const;

export const KNOWN_STORE_STORAGE_KEY_PREFIXES = ['chimera-'] as const;

export const CONTROL_PLANE_HOSTS = [
  'web.np.playstation.com',
  'web-toolbar.playstation.com',
  'io.playstation.com',
  'social.playstation.com'
] as const;

export const TELEMETRY_HOSTS = [
  'telemetry.api.playstation.com',
  'smetrics.aem.playstation.com',
  'web-commerce-anywhere.playstation.com'
] as const;

export const OBSERVED_GRAPHQL_OPERATIONS = [
  'getCartItemCount',
  'getProfileOracle',
  'getPurchasedGameList',
  'queryOracleUserProfileFullSubscription',
  'storeRetrieveWishlist',
  'wcaPlatformVariantsRetrive'
] as const;

export type KnownWebSessionCookie = (typeof KNOWN_WEB_SESSION_COOKIES)[number];
export type ControlPlaneHost = (typeof CONTROL_PLANE_HOSTS)[number];
export type TelemetryHost = (typeof TELEMETRY_HOSTS)[number];
export type ObservedGraphQLOperation = (typeof OBSERVED_GRAPHQL_OPERATIONS)[number];
