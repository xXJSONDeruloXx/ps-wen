import type {
  AccountSessionSnapshot,
  SessionMarker,
  SessionSurface
} from '../architecture/provider-types.js';
import { CONTROL_PLANE_HOSTS, TELEMETRY_HOSTS } from './playstation-web.js';

export type ProbeClassification =
  | 'success'
  | 'schema-hint'
  | 'schema-drift'
  | 'access-denied'
  | 'csrf-blocked'
  | 'opaque-redirect'
  | 'direct-query-blocked'
  | 'request-error'
  | 'other';

export type SafariPageSummary = {
  url: string;
  title: string;
  signInPrompt?: boolean;
  isSignedInCookie?: string | null;
  hasSessionCookie?: boolean;
  hasUserInfoCookie?: boolean;
  pdcws2CookiePresent?: boolean;
  pdcsiCookiePresent?: boolean;
  localStorageKeys?: string[];
  sessionStorageKeys?: string[];
  userIdLength?: number;
  gpdcUserPresent?: boolean;
  gpdcUserKeys?: string[];
  chimeraKeys?: string[];
  resourceHostnames?: string[];
};

export type SafariSessionSummaryArtifact = {
  generatedAt: string;
  summaries: Array<{
    index: number;
    title: string;
    url: string;
    summary: SafariPageSummary;
  }>;
};

export type ProbeReportEntry = {
  id: string;
  request: {
    operationName?: string | null;
  };
  response: {
    classification: ProbeClassification;
    code: number | null;
    error?: string | null;
    summary?: {
      kind?: 'json' | 'text' | 'empty';
      errorMessages?: string[];
      shape?: unknown;
    } | null;
  };
  rawBody?: string | null;
};

export type ProbeReportArtifact = {
  generatedAt: string;
  results: ProbeReportEntry[];
};

export type ProbeSummaryArtifact = {
  generatedAt: string;
  counts: Record<string, number>;
  byClassification: Record<string, string[]>;
};

export type AssetInventoryArtifact = {
  generatedAt: string;
  assetCount?: number;
  assets: Array<{
    url: string;
    graphqlOperationMatches?: string[];
    sampleHostnames?: string[];
  }>;
};

export type GraphqlDocumentReportArtifact = {
  generatedAt: string;
  operations: Array<{
    operationType: 'query' | 'mutation' | 'subscription';
    operationName: string;
    readOnly: boolean;
    rootFields: string[];
    sourceUrls: string[];
    probeIds: string[];
    classifications: string[];
  }>;
  summary: {
    unprobedReadOnlyOperations: string[];
    mutationOperations: string[];
  };
};

export type CapabilityStatus = 'observed' | 'partial' | 'gated' | 'unknown';

export type ControlPlaneCapability = {
  status: CapabilityStatus;
  evidence: string[];
  notes: string[];
};

export type ObservedWebSurface = {
  title: string;
  url: string;
  score: number;
  snapshot: AccountSessionSnapshot;
  resourceHostnames: string[];
};

export type PlayStationWebControlPlaneSnapshot = {
  generatedAt: string;
  sourceGeneratedAt: {
    safariSessionSummary: string;
    probeReport: string;
    probeSummary?: string;
    assetInventory: string;
    graphqlDocumentReport?: string;
  };
  primarySession: AccountSessionSnapshot | null;
  observedSurfaces: ObservedWebSurface[];
  hosts: {
    controlPlane: string[];
    telemetry: string[];
    firstPartyOther: string[];
    firstPartyOtherPatterns: string[];
  };
  probeOutcomes: Record<ProbeClassification, string[]>;
  graphqlOperations: {
    fromAssetMatches: string[];
    extractedQueries: string[];
    extractedMutations: string[];
    unprobedReadOnly: string[];
  };
  capabilities: {
    identityBootstrap: ControlPlaneCapability;
    profileBootstrap: ControlPlaneCapability;
    querySurface: ControlPlaneCapability;
    entitlements: ControlPlaneCapability;
    sessionBootstrap: ControlPlaneCapability;
    sessionAllocation: ControlPlaneCapability;
  };
  recommendations: string[];
};

const CONTROL_PLANE_HOST_SET = new Set<string>(CONTROL_PLANE_HOSTS);
const TELEMETRY_HOST_SET = new Set<string>(TELEMETRY_HOSTS);

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function boolCount(values: boolean[]) {
  return values.filter(Boolean).length;
}

export function sessionSurfaceFromUrl(url: string): SessionSurface {
  const normalized = url.toLowerCase();
  if (normalized.includes('store.playstation.com')) return 'store.playstation.com';
  if (normalized.includes('playstation.com')) return 'playstation.com';
  return 'unknown';
}

export function scoreSafariPageSummary(summary: SafariPageSummary): number {
  return (
    (summary.isSignedInCookie === 'true' ? 4 : 0) +
    (summary.hasSessionCookie ? 3 : 0) +
    (summary.hasUserInfoCookie ? 3 : 0) +
    (summary.pdcws2CookiePresent ? 2 : 0) +
    (summary.pdcsiCookiePresent ? 2 : 0) +
    ((summary.userIdLength ?? 0) > 0 ? 3 : 0) +
    (summary.gpdcUserPresent ? 3 : 0) +
    ((summary.chimeraKeys?.length ?? 0) > 0 ? 3 : 0) +
    (summary.signInPrompt ? -1 : 0)
  );
}

export function buildSessionMarkers(summary: SafariPageSummary): SessionMarker[] {
  const localStorageKeys = new Set(summary.localStorageKeys ?? []);
  const sessionStorageKeys = new Set(summary.sessionStorageKeys ?? []);
  const chimeraPresent = (summary.chimeraKeys?.length ?? 0) > 0;

  return [
    { source: 'cookie', key: 'isSignedIn', present: summary.isSignedInCookie === 'true' },
    { source: 'cookie', key: 'session', present: Boolean(summary.hasSessionCookie) },
    { source: 'cookie', key: 'userinfo', present: Boolean(summary.hasUserInfoCookie) },
    { source: 'cookie', key: 'pdcws2', present: Boolean(summary.pdcws2CookiePresent) },
    { source: 'cookie', key: 'pdcsi', present: Boolean(summary.pdcsiCookiePresent) },
    {
      source: 'localStorage',
      key: 'userId',
      present: localStorageKeys.has('userId') || (summary.userIdLength ?? 0) > 0
    },
    {
      source: 'sessionStorage',
      key: 'gpdcUser',
      present: sessionStorageKeys.has('gpdcUser') || Boolean(summary.gpdcUserPresent)
    },
    {
      source: 'sessionStorage',
      key: 'chimera-*',
      present: chimeraPresent,
      notes: chimeraPresent ? `${summary.chimeraKeys?.length ?? 0} keys observed` : undefined
    }
  ];
}

export function isLikelySignedIn(summary: SafariPageSummary): boolean {
  const cookieSignals = boolCount([
    summary.isSignedInCookie === 'true',
    Boolean(summary.hasSessionCookie),
    Boolean(summary.hasUserInfoCookie),
    Boolean(summary.pdcws2CookiePresent),
    Boolean(summary.pdcsiCookiePresent)
  ]);
  const storageSignals = boolCount([
    (summary.userIdLength ?? 0) > 0,
    Boolean(summary.gpdcUserPresent),
    (summary.chimeraKeys?.length ?? 0) > 0
  ]);

  return cookieSignals >= 3 && storageSignals >= 1;
}

export function toAccountSessionSnapshot(summary: SafariPageSummary, capturedAt: string): AccountSessionSnapshot {
  return {
    capturedAt,
    surface: sessionSurfaceFromUrl(summary.url),
    signedIn: isLikelySignedIn(summary),
    markers: buildSessionMarkers(summary),
    profileHints: {
      userIdPresent: (summary.userIdLength ?? 0) > 0,
      handlePresent: Boolean(summary.gpdcUserPresent),
      subscriptionInfoPresent: (summary.gpdcUserKeys ?? []).some((key) => /subscription|plus|premium/i.test(key)),
      regionPresent: Boolean(summary.gpdcUserPresent)
    }
  };
}

export function selectPrimarySessionSummary(
  artifact: SafariSessionSummaryArtifact
): SafariSessionSummaryArtifact['summaries'][number] | null {
  const ranked = artifact.summaries
    .map((entry) => ({ entry, score: scoreSafariPageSummary(entry.summary) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftSurface = sessionSurfaceFromUrl(left.entry.summary.url);
      const rightSurface = sessionSurfaceFromUrl(right.entry.summary.url);
      const surfaceRank = (surface: SessionSurface) =>
        surface === 'playstation.com' ? 3 : surface === 'store.playstation.com' ? 2 : surface === 'native-client' ? 1 : 0;
      return surfaceRank(rightSurface) - surfaceRank(leftSurface);
    });

  return ranked[0]?.entry ?? null;
}

function deriveProbeOutcomes(
  probeReport: ProbeReportArtifact,
  probeSummary?: ProbeSummaryArtifact
): Record<ProbeClassification, string[]> {
  const empty: Record<ProbeClassification, string[]> = {
    success: [],
    'schema-hint': [],
    'schema-drift': [],
    'access-denied': [],
    'csrf-blocked': [],
    'opaque-redirect': [],
    'direct-query-blocked': [],
    'request-error': [],
    other: []
  };

  if (probeSummary) {
    return {
      success: [...(probeSummary.byClassification.success ?? [])],
      'schema-hint': [...(probeSummary.byClassification['schema-hint'] ?? [])],
      'schema-drift': [...(probeSummary.byClassification['schema-drift'] ?? [])],
      'access-denied': [...(probeSummary.byClassification['access-denied'] ?? [])],
      'csrf-blocked': [...(probeSummary.byClassification['csrf-blocked'] ?? [])],
      'opaque-redirect': [...(probeSummary.byClassification['opaque-redirect'] ?? [])],
      'direct-query-blocked': [...(probeSummary.byClassification['direct-query-blocked'] ?? [])],
      'request-error': [...(probeSummary.byClassification['request-error'] ?? [])],
      other: [...(probeSummary.byClassification.other ?? [])]
    };
  }

  for (const result of probeReport.results) {
    empty[result.response.classification].push(result.id);
  }

  for (const key of Object.keys(empty) as ProbeClassification[]) {
    empty[key] = uniqueSorted(empty[key]);
  }

  return empty;
}

function isFirstPartyHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized.includes('playstation.com') ||
    normalized.includes('playstation.net') ||
    normalized.includes('sonyentertainmentnetwork.com') ||
    normalized === 'sony.com' ||
    normalized.endsWith('.sony.com')
  );
}

function isHostPattern(hostname: string): boolean {
  return hostname.includes('{') || hostname.includes('}') || hostname.includes('\\');
}

function collectObservedHostnames(
  safariSessionSummary: SafariSessionSummaryArtifact,
  assetInventory: AssetInventoryArtifact
): string[] {
  const values = [
    ...safariSessionSummary.summaries.flatMap((entry) => entry.summary.resourceHostnames ?? []),
    ...assetInventory.assets.flatMap((asset) => asset.sampleHostnames ?? [])
  ];

  return uniqueSorted(values);
}

function makeCapability(status: CapabilityStatus, evidence: string[], notes: string[]): ControlPlaneCapability {
  return {
    status,
    evidence: uniqueSorted(evidence),
    notes
  };
}

export function summarizePlaystationWebControlPlane(input: {
  safariSessionSummary: SafariSessionSummaryArtifact;
  probeReport: ProbeReportArtifact;
  probeSummary?: ProbeSummaryArtifact;
  assetInventory: AssetInventoryArtifact;
  graphqlDocumentReport?: GraphqlDocumentReportArtifact;
}): PlayStationWebControlPlaneSnapshot {
  const observedSurfaces = input.safariSessionSummary.summaries
    .map((entry) => ({
      title: entry.title,
      url: entry.url,
      score: scoreSafariPageSummary(entry.summary),
      snapshot: toAccountSessionSnapshot(entry.summary, input.safariSessionSummary.generatedAt),
      resourceHostnames: uniqueSorted(entry.summary.resourceHostnames ?? [])
    }))
    .sort((left, right) => right.score - left.score);

  const primaryEntry = selectPrimarySessionSummary(input.safariSessionSummary);
  const primarySession = primaryEntry
    ? toAccountSessionSnapshot(primaryEntry.summary, input.safariSessionSummary.generatedAt)
    : null;

  const probeOutcomes = deriveProbeOutcomes(input.probeReport, input.probeSummary);
  const observedHostnames = collectObservedHostnames(input.safariSessionSummary, input.assetInventory);
  const bundleOperations = uniqueSorted(input.assetInventory.assets.flatMap((asset) => asset.graphqlOperationMatches ?? []));
  const extractedQueries = uniqueSorted(
    (input.graphqlDocumentReport?.operations ?? [])
      .filter((operation) => operation.operationType === 'query')
      .map((operation) => operation.operationName)
  );
  const extractedMutations = uniqueSorted(
    (input.graphqlDocumentReport?.operations ?? [])
      .filter((operation) => operation.operationType === 'mutation')
      .map((operation) => operation.operationName)
  );
  const unprobedReadOnly = uniqueSorted(input.graphqlDocumentReport?.summary.unprobedReadOnlyOperations ?? []);

  const controlPlaneHosts = observedHostnames.filter((hostname) => CONTROL_PLANE_HOST_SET.has(hostname));
  const telemetryHosts = observedHostnames.filter((hostname) => TELEMETRY_HOST_SET.has(hostname));
  const firstPartyOtherHosts = observedHostnames.filter(
    (hostname) =>
      isFirstPartyHost(hostname) && !isHostPattern(hostname) && !CONTROL_PLANE_HOST_SET.has(hostname) && !TELEMETRY_HOST_SET.has(hostname)
  );
  const firstPartyOtherPatterns = observedHostnames.filter(
    (hostname) =>
      isFirstPartyHost(hostname) && isHostPattern(hostname) && !CONTROL_PLANE_HOST_SET.has(hostname) && !TELEMETRY_HOST_SET.has(hostname)
  );

  const identityBootstrap = makeCapability(
    primarySession?.signedIn && probeOutcomes.success.includes('io.user.details') ? 'observed' : primarySession ? 'partial' : 'unknown',
    [
      ...(primarySession?.signedIn ? ['signed-in-session-markers'] : []),
      ...(probeOutcomes.success.includes('io.user.details') ? ['io.user.details'] : []),
      ...(probeOutcomes.success.includes('io.user.segments') ? ['io.user.segments'] : [])
    ],
    [
      'Strong first-party browser cookies and storage markers are sufficient to recognize a signed-in web session.',
      'The io.playstation.com surface provides direct profile/segment bootstrap data from an authenticated Safari session.'
    ]
  );

  const profileBootstrap = makeCapability(
    probeOutcomes.success.includes('io.user.details') && probeOutcomes.success.includes('io.user.segments') ? 'observed' : 'partial',
    ['io.user.details', 'io.user.segments'].filter((id) => probeOutcomes.success.includes(id)),
    ['Basic profile and segmentation bootstrap are observable without exporting tokens out of Safari.']
  );

  const querySurfaceEvidence = [
    ...probeOutcomes['schema-drift'],
    ...probeOutcomes['access-denied'],
    ...probeOutcomes['direct-query-blocked']
  ];
  const querySurface = makeCapability(
    querySurfaceEvidence.length > 0 ? 'partial' : 'unknown',
    querySurfaceEvidence,
    [
      'The web.np.playstation.com GraphQL surface is real, but replay is only partially reusable from a browser session.',
      'Observed failure modes include stale persisted docs, access gating, and blocked ad hoc direct queries.'
    ]
  );

  const entitlementsEvidence = ['graphql.getPurchasedGameList', 'graphql.storeRetrieveWishlist'].filter((id) =>
    probeOutcomes['access-denied'].includes(id)
  );
  const entitlements = makeCapability(
    entitlementsEvidence.length > 0 ? 'gated' : 'unknown',
    entitlementsEvidence,
    ['Wishlist and purchase-list style queries appear to exist, but currently replay as authorization-gated operations.']
  );

  const sessionBootstrap = makeCapability(
    probeOutcomes['opaque-redirect'].some((id) => id.startsWith('session.redirect.')) ? 'observed' : 'unknown',
    probeOutcomes['opaque-redirect'].filter((id) => id.startsWith('session.redirect.')),
    ['The session host participates in redirect-oriented browser bootstrap flows rather than behaving like a plain JSON API.']
  );

  const sessionAllocation = makeCapability('unknown', [], [
    'No browser-side evidence yet identifies the live cloud-stream allocation endpoint or transport bootstrap.'
  ]);

  return {
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: {
      safariSessionSummary: input.safariSessionSummary.generatedAt,
      probeReport: input.probeReport.generatedAt,
      probeSummary: input.probeSummary?.generatedAt,
      assetInventory: input.assetInventory.generatedAt,
      graphqlDocumentReport: input.graphqlDocumentReport?.generatedAt
    },
    primarySession,
    observedSurfaces,
    hosts: {
      controlPlane: controlPlaneHosts,
      telemetry: telemetryHosts,
      firstPartyOther: firstPartyOtherHosts,
      firstPartyOtherPatterns
    },
    probeOutcomes,
    graphqlOperations: {
      fromAssetMatches: bundleOperations,
      extractedQueries,
      extractedMutations,
      unprobedReadOnly
    },
    capabilities: {
      identityBootstrap,
      profileBootstrap,
      querySurface,
      entitlements,
      sessionBootstrap,
      sessionAllocation
    },
    recommendations: [
      'Prefer offline artifact synthesis and cached summaries before issuing any new authenticated requests.',
      'When live probing is necessary, keep to the observed allowlist and space requests out by several seconds.',
      ...(unprobedReadOnly.length > 0
        ? [
            `If more GraphQL validation is needed, prioritize the small read-only bundle query set: ${unprobedReadOnly.join(', ')}.`
          ]
        : []),
      'Use the observation-backed provider prototype to shape clean-room control-plane interfaces before any native-client work.'
    ]
  };
}
