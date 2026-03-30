import type {
  AccountSessionSnapshot,
  EntitlementProvider,
  EntitlementRecord,
  IdentityBootstrapProvider,
  PersistedQueryRequest,
  PersistedQueryResponse,
  QueryProvider,
  SessionAllocation,
  SessionAllocationRequest,
  SessionAllocator,
  SessionMarker
} from '../architecture/provider-types.js';
import { sessionSurfaceFromUrl } from '../observations/playstation-web-control-plane.js';
import {
  PLAYSTATION_PLUS_PC_CAPTURED_METADATA_HOSTS,
  PLAYSTATION_PLUS_PC_PUBLIC_ACCOUNT_API_TEMPLATES,
  PLAYSTATION_PLUS_PC_PUBLIC_KAMAJI_PATHS,
  PLAYSTATION_PLUS_PC_PUBLIC_USER_API_PATHS,
  PLAYSTATION_PLUS_PC_PUBLIC_GRAND_CENTRAL_CONFIG_KEYS
} from '../observations/playstation-plus-pc.js';

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function uniqueInOrder(values: Iterable<string>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export type BrowserAuthSummaryArtifact = {
  generatedAt: string;
  currentUrl: string;
  likelySignedIn: boolean;
  onSigninSurface?: boolean;
  cookieDomains?: Array<{
    domain: string;
    count?: number;
    authLikeNames?: string[];
    names?: string[];
  }>;
  originStorage?: Record<
    string,
    {
      localStorageKeys?: string[];
      sessionStorageKeys?: string[];
    }
  >;
};

export type PcAuthSummaryArtifact = {
  generatedAt: string;
  currentAppUrl?: string;
  likelySignedIn: boolean;
  cookieSurfaces?: Array<{
    authLikeDomains?: Array<{
      domain: string;
      names: string[];
    }>;
  }>;
  localStorage?: {
    keys?: string[];
    classifiedKeys?: Array<{
      key: string;
      valueClass: string;
      jsonKeys?: string[];
    }>;
  };
  indexedDbOrigins?: string[];
  cachedAuthRedirects?: Array<{
    kind: string;
    path: string;
  }>;
};

export type PcSurfaceSummaryArtifact = {
  generatedAt: string;
  shell?: {
    packageName?: string;
    packageVersion?: string;
    runtimeVersion?: string;
    currentAppUrl?: string;
    preloadCommands?: string[];
    notifierCommands?: string[];
    dependencyNames?: string[];
  };
  ipc?: {
    localWebSocket?: {
      host: string;
      port: number;
      keepConnected?: boolean;
    };
    listeningOnLocalhost1235?: boolean;
  };
  updater?: {
    metaUrl?: string;
  };
};

export type PcApolloSummaryArtifact = {
  generatedAt: string;
  pcSpecificKamajiPaths?: string[];
  pcUserApiPaths?: string[];
  accountApiTemplates?: string[];
  grandCentralConfigKeys?: string[];
  authFlowHints?: string[];
  commerceHosts?: string[];
};

export type NetworkSummaryArtifact = {
  generatedAt: string;
  playstationSignals?: string[];
  sonySignals?: string[];
  tlsServerNames?: Array<{
    serverName: string;
    flowCount: number;
    remoteIps?: string[];
  }>;
  remoteEndpoints?: Array<{
    remoteIp: string;
    hostnames?: string[];
    tcp443BytesOut?: number;
    tcp443BytesIn?: number;
    udp443PacketsOut?: number;
    udp443PacketsIn?: number;
  }>;
  transportCandidates?: Array<{
    remoteIp: string;
    protocol: 'tcp' | 'udp';
    remotePort: number;
    hostnames?: string[];
    bytesOut?: number;
    bytesIn?: number;
    packetsOut?: number;
    packetsIn?: number;
  }>;
};

export type PlayStationPlusObservationProviderOptions = {
  browserAuthSummary?: BrowserAuthSummaryArtifact | null;
  pcAuthSummary?: PcAuthSummaryArtifact | null;
  pcSurfaceSummary?: PcSurfaceSummaryArtifact | null;
  pcApolloSummary?: PcApolloSummaryArtifact | null;
  networkSummaries?: NetworkSummaryArtifact[];
};

export type PrototypeCapabilityState = 'observed' | 'partial' | 'gated' | 'placeholder' | 'unknown';

export type PrototypeCapability = {
  state: PrototypeCapabilityState;
  evidence: string[];
  notes: string[];
};

export type PlayStationPlusPrototypeStatus = {
  generatedAt: string;
  session: AccountSessionSnapshot;
  app: {
    packageName?: string;
    runtimeVersion?: string;
    currentAppUrl?: string;
    localhostBrokerUrl?: string;
    preloadCommandCount: number;
    notifierCommandCount: number;
  };
  hosts: {
    captured: string[];
    accountAndCommerce: string[];
    streamingLineage: string[];
  };
  capabilities: {
    login: PrototypeCapability;
    nativeBroker: PrototypeCapability;
    profileBootstrap: PrototypeCapability;
    entitlements: PrototypeCapability;
    sessionAllocation: PrototypeCapability;
    streamingTransport: PrototypeCapability;
  };
  nextSteps: string[];
};

function createMarker(source: SessionMarker['source'], key: string, present: boolean, notes?: string): SessionMarker {
  return { source, key, present, notes };
}

function summarizeCookieSurfaceDomains(summary: PcAuthSummaryArtifact | null | undefined) {
  return uniqueSorted(
    (summary?.cookieSurfaces ?? [])
      .flatMap((surface) => surface.authLikeDomains ?? [])
      .map((domainSummary) => domainSummary.domain)
  );
}

function summarizePcCurrentUserKeys(summary: PcAuthSummaryArtifact | null | undefined) {
  return uniqueSorted(
    (summary?.localStorage?.classifiedKeys ?? [])
      .filter((entry) => entry.key === 'currentUser')
      .flatMap((entry) => entry.jsonKeys ?? [])
  );
}

function collectCapturedHosts(summaries: NetworkSummaryArtifact[]) {
  const fromSignals = summaries.flatMap((summary) => [...(summary.playstationSignals ?? []), ...(summary.sonySignals ?? [])]);
  const fromSni = summaries.flatMap((summary) => (summary.tlsServerNames ?? []).map((entry) => entry.serverName));
  const fromEndpoints = summaries.flatMap((summary) => (summary.remoteEndpoints ?? []).flatMap((entry) => entry.hostnames ?? []));
  const fromTransportCandidates = summaries.flatMap((summary) =>
    (summary.transportCandidates ?? []).flatMap((entry) => entry.hostnames ?? [])
  );
  return uniqueSorted([
    ...PLAYSTATION_PLUS_PC_CAPTURED_METADATA_HOSTS,
    ...fromSignals,
    ...fromSni,
    ...fromEndpoints,
    ...fromTransportCandidates
  ]);
}

function collectTransportCandidateStrings(summaries: NetworkSummaryArtifact[]) {
  return uniqueSorted(
    summaries.flatMap((summary) =>
      (summary.transportCandidates ?? []).map((entry) => `${entry.protocol}://${entry.remoteIp}:${entry.remotePort}`)
    )
  );
}

function pickSessionSummarySource(options: PlayStationPlusObservationProviderOptions) {
  if (options.browserAuthSummary) {
    return { kind: 'browser' as const, generatedAt: options.browserAuthSummary.generatedAt };
  }

  if (options.pcAuthSummary) {
    return { kind: 'native' as const, generatedAt: options.pcAuthSummary.generatedAt };
  }

  if (options.pcSurfaceSummary) {
    return { kind: 'surface' as const, generatedAt: options.pcSurfaceSummary.generatedAt };
  }

  const latestNetwork = [...(options.networkSummaries ?? [])].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  if (latestNetwork) {
    return { kind: 'network' as const, generatedAt: latestNetwork.generatedAt };
  }

  return { kind: 'fallback' as const, generatedAt: new Date(0).toISOString() };
}

export class PlayStationPlusObservationProvider
  implements IdentityBootstrapProvider, QueryProvider, EntitlementProvider, SessionAllocator
{
  private readonly browserAuthSummary: BrowserAuthSummaryArtifact | null;
  private readonly pcAuthSummary: PcAuthSummaryArtifact | null;
  private readonly pcSurfaceSummary: PcSurfaceSummaryArtifact | null;
  private readonly pcApolloSummary: PcApolloSummaryArtifact | null;
  private readonly networkSummaries: NetworkSummaryArtifact[];

  constructor(options: PlayStationPlusObservationProviderOptions) {
    this.browserAuthSummary = options.browserAuthSummary ?? null;
    this.pcAuthSummary = options.pcAuthSummary ?? null;
    this.pcSurfaceSummary = options.pcSurfaceSummary ?? null;
    this.pcApolloSummary = options.pcApolloSummary ?? null;
    this.networkSummaries = options.networkSummaries ?? [];
  }

  async detectSession(): Promise<AccountSessionSnapshot> {
    const source = pickSessionSummarySource({
      browserAuthSummary: this.browserAuthSummary,
      pcAuthSummary: this.pcAuthSummary,
      pcSurfaceSummary: this.pcSurfaceSummary,
      networkSummaries: this.networkSummaries
    });

    if (this.browserAuthSummary) {
      const storageOrigins = Object.keys(this.browserAuthSummary.originStorage ?? {}).sort();
      const markers: SessionMarker[] = [
        createMarker(
          'cookie',
          'browser-auth-domains',
          (this.browserAuthSummary.cookieDomains?.length ?? 0) > 0,
          uniqueSorted((this.browserAuthSummary.cookieDomains ?? []).map((entry) => entry.domain)).join(', ')
        ),
        createMarker('other', 'signin-surface-cleared', !Boolean(this.browserAuthSummary.onSigninSurface)),
        createMarker('localStorage', 'browser-storage-origins', storageOrigins.length > 0, storageOrigins.join(', '))
      ];

      const userIdPresent = storageOrigins.some((origin) =>
        (this.browserAuthSummary?.originStorage?.[origin]?.localStorageKeys ?? []).includes('userId')
      );
      const handlePresent = storageOrigins.some((origin) =>
        (this.browserAuthSummary?.originStorage?.[origin]?.sessionStorageKeys ?? []).includes('gpdcUser')
      );
      const subscriptionInfoPresent = storageOrigins.some((origin) =>
        [...(this.browserAuthSummary?.originStorage?.[origin]?.localStorageKeys ?? []), ...(this.browserAuthSummary?.originStorage?.[origin]?.sessionStorageKeys ?? [])].some(
          (key) => /subscription|premium|plus/i.test(key)
        )
      );

      return {
        capturedAt: source.generatedAt,
        surface: sessionSurfaceFromUrl(this.browserAuthSummary.currentUrl),
        signedIn: this.browserAuthSummary.likelySignedIn,
        markers,
        profileHints: {
          userIdPresent,
          handlePresent,
          subscriptionInfoPresent,
          regionPresent: storageOrigins.length > 0
        }
      };
    }

    if (this.pcAuthSummary || this.pcSurfaceSummary) {
      const cookieDomains = summarizeCookieSurfaceDomains(this.pcAuthSummary);
      const localStorageKeys = uniqueSorted(this.pcAuthSummary?.localStorage?.keys ?? []);
      const markers: SessionMarker[] = [
        createMarker('cookie', 'native-auth-domains', cookieDomains.length > 0, cookieDomains.join(', ')),
        createMarker('localStorage', 'native-local-storage', localStorageKeys.length > 0, localStorageKeys.join(', ')),
        createMarker(
          'other',
          'native-redirect-handoffs',
          (this.pcAuthSummary?.cachedAuthRedirects?.length ?? 0) > 0,
          uniqueSorted((this.pcAuthSummary?.cachedAuthRedirects ?? []).map((entry) => entry.kind)).join(', ')
        )
      ];

      return {
        capturedAt: source.generatedAt,
        surface: 'native-client',
        signedIn: Boolean(this.pcAuthSummary?.likelySignedIn),
        markers,
        profileHints: {
          userIdPresent: summarizePcCurrentUserKeys(this.pcAuthSummary).includes('accountID'),
          handlePresent: summarizePcCurrentUserKeys(this.pcAuthSummary).includes('profile'),
          subscriptionInfoPresent: false,
          regionPresent: (this.pcAuthSummary?.indexedDbOrigins?.length ?? 0) > 0
        }
      };
    }

    return {
      capturedAt: source.generatedAt,
      surface: 'unknown',
      signedIn: false,
      markers: []
    };
  }

  async getProfileBootstrap(): Promise<Record<string, unknown>> {
    const capturedHosts = collectCapturedHosts(this.networkSummaries);
    const transportCandidates = collectTransportCandidateStrings(this.networkSummaries);
    return {
      session: await this.detectSession(),
      runtime: {
        packageName: this.pcSurfaceSummary?.shell?.packageName,
        packageVersion: this.pcSurfaceSummary?.shell?.packageVersion,
        runtimeVersion: this.pcSurfaceSummary?.shell?.runtimeVersion,
        currentAppUrl: this.pcSurfaceSummary?.shell?.currentAppUrl ?? this.pcAuthSummary?.currentAppUrl,
        localhostBroker: this.pcSurfaceSummary?.ipc?.localWebSocket
          ? `ws://${this.pcSurfaceSummary.ipc.localWebSocket.host}:${this.pcSurfaceSummary.ipc.localWebSocket.port}`
          : null,
        preloadCommands: uniqueSorted(this.pcSurfaceSummary?.shell?.preloadCommands ?? []),
        notifierCommands: uniqueSorted(this.pcSurfaceSummary?.shell?.notifierCommands ?? []),
        updaterMetaUrl: this.pcSurfaceSummary?.updater?.metaUrl ?? null
      },
      auth: {
        cookieDomains: summarizeCookieSurfaceDomains(this.pcAuthSummary),
        localStorageKeys: uniqueSorted(this.pcAuthSummary?.localStorage?.keys ?? []),
        currentUserKeys: summarizePcCurrentUserKeys(this.pcAuthSummary),
        indexedDbOrigins: uniqueSorted(this.pcAuthSummary?.indexedDbOrigins ?? []),
        cachedAuthRedirectKinds: uniqueSorted((this.pcAuthSummary?.cachedAuthRedirects ?? []).map((entry) => entry.kind))
      },
      controlPlane: {
        capturedHosts,
        transportCandidates,
        kamajiPaths: uniqueSorted(this.pcApolloSummary?.pcSpecificKamajiPaths ?? PLAYSTATION_PLUS_PC_PUBLIC_KAMAJI_PATHS),
        pcUserApiPaths: uniqueSorted(this.pcApolloSummary?.pcUserApiPaths ?? PLAYSTATION_PLUS_PC_PUBLIC_USER_API_PATHS),
        accountApiTemplates: uniqueSorted(
          this.pcApolloSummary?.accountApiTemplates ?? PLAYSTATION_PLUS_PC_PUBLIC_ACCOUNT_API_TEMPLATES
        ),
        grandCentralConfigKeys: uniqueSorted(
          this.pcApolloSummary?.grandCentralConfigKeys ?? PLAYSTATION_PLUS_PC_PUBLIC_GRAND_CENTRAL_CONFIG_KEYS
        ),
        authFlowHints: uniqueSorted(this.pcApolloSummary?.authFlowHints ?? []),
        commerceHosts: uniqueSorted(this.pcApolloSummary?.commerceHosts ?? [])
      }
    };
  }

  async executePersistedQuery<T = unknown>(_request: PersistedQueryRequest): Promise<PersistedQueryResponse<T>> {
    return {
      operationName: _request.operationName,
      errors: [
        {
          message:
            'No live read/query provider is wired into the PlayStation Plus observation prototype yet. Use cached browser probe artifacts for read-only GraphQL/API work, and treat native session allocation as a placeholder until an entitled queue/start path is observed.'
        }
      ]
    };
  }

  async listEntitlements(): Promise<EntitlementRecord[]> {
    const capturedHosts = collectCapturedHosts(this.networkSummaries);
    const commerceEvidence = uniqueSorted(
      [
        ...capturedHosts.filter((host) => /checkout|web-commerce-anywhere|merchandise|commerce\.api/i.test(host)),
        ...uniqueSorted(this.pcApolloSummary?.pcUserApiPaths ?? []).filter((value) => /stores|lists/i.test(value)),
        ...uniqueSorted(this.pcApolloSummary?.accountApiTemplates ?? []).filter((value) => /accounts|lists|merchandise/i.test(value))
      ].filter(Boolean)
    );
    const sessionAllocationEvidence = uniqueSorted(
      [
        ...capturedHosts.filter((host) => /psnow|gaikai|km\.playstation\.net|web\.np\.playstation\.com/i.test(host)),
        ...uniqueSorted(this.pcApolloSummary?.pcSpecificKamajiPaths ?? []),
        ...uniqueSorted(this.pcApolloSummary?.authFlowHints ?? []).filter((value) => /session|signIn|AuthCode/i.test(value))
      ].filter(Boolean)
    );

    return [
      {
        id: 'playstation-plus-premium-streaming',
        source: 'observed-artifacts',
        state: 'gated',
        confidence: 'observed',
        attributes: {
          relatedHosts: commerceEvidence,
          relatedApiTemplates: uniqueSorted(this.pcApolloSummary?.accountApiTemplates ?? []),
          relatedUserPaths: uniqueSorted(this.pcApolloSummary?.pcUserApiPaths ?? [])
        },
        evidence: commerceEvidence,
        notes: [
          'Membership/commerce-related hosts and templates are observed, but a repo-local Premium entitlement record has not been directly confirmed.',
          'Treat this as a placeholder seam for future entitled-account validation rather than a working entitlement extractor.'
        ]
      },
      {
        id: 'native-stream-session-bootstrap',
        source: 'observed-artifacts',
        state: 'gated',
        confidence: 'observed',
        attributes: {
          kamajiPaths: uniqueSorted(this.pcApolloSummary?.pcSpecificKamajiPaths ?? []),
          authFlowHints: uniqueSorted(this.pcApolloSummary?.authFlowHints ?? []),
          currentAppUrl: this.pcSurfaceSummary?.shell?.currentAppUrl ?? this.pcAuthSummary?.currentAppUrl ?? null
        },
        evidence: sessionAllocationEvidence,
        notes: [
          'Session bootstrap families are clearly visible in static/runtime/capture evidence.',
          'A real stream-phase capture now exists, but title entitlement semantics and allocator message shapes are still not cleanly isolated.'
        ]
      }
    ];
  }

  async allocate(request: SessionAllocationRequest): Promise<SessionAllocation> {
    const capturedHosts = collectCapturedHosts(this.networkSummaries);
    const transportCandidates = collectTransportCandidateStrings(this.networkSummaries);
    const endpointHints = uniqueInOrder([
      ...transportCandidates,
      ...capturedHosts.filter((host) => /psnow|gaikai|km\.playstation\.net|web\.np\.playstation\.com/i.test(host)),
      ...uniqueSorted(this.pcApolloSummary?.pcSpecificKamajiPaths ?? []),
      ...uniqueSorted(this.pcApolloSummary?.commerceHosts ?? []).filter((host) => /km\.playstation\.net|theia|apollo/i.test(host))
    ]);

    return {
      state: 'placeholder',
      confidence: 'observed',
      sessionId: request.titleId ? `placeholder:${request.titleId}` : 'placeholder:unknown-title',
      region: request.regionPreference,
      transportHint: transportCandidates.some((value) => value.startsWith('udp://')) ? 'custom-udp' : 'unknown',
      endpointHints,
      evidence: [
        'psnow.playstation.com on-wire DNS/TLS observed',
        'commerce.api.np.km.playstation.net on-wire observed',
        'cc.prod.gaikai.com on-wire observed',
        'kamaji/api/psnow and kamaji/api/swordfish paths in current public app assets'
      ],
      blockers: [
        'The repo still lacks a short segmented capture that isolates allocator/bootstrap traffic from the long-lived media channel.',
        'Allocator-specific hostnames and transport channels still need deeper correlation and replay-free confirmation from more entitled stream captures.'
      ],
      notes: [
        'This is an observation-backed placeholder allocation result for wiring control-flow/UI seams only.',
        'Do not treat endpoint hints as a working reproduction of Sony session allocation.'
      ]
    };
  }

  async release(_sessionId: string): Promise<void> {
    return;
  }

  async getStatus(): Promise<PlayStationPlusPrototypeStatus> {
    const session = await this.detectSession();
    const entitlements = await this.listEntitlements();
    const capturedHosts = collectCapturedHosts(this.networkSummaries);
    const transportCandidates = collectTransportCandidateStrings(this.networkSummaries);
    const localhostBrokerUrl = this.pcSurfaceSummary?.ipc?.localWebSocket
      ? `ws://${this.pcSurfaceSummary.ipc.localWebSocket.host}:${this.pcSurfaceSummary.ipc.localWebSocket.port}`
      : undefined;
    const accountAndCommerceHosts = capturedHosts.filter((host) => /account|checkout|commerce|merchandise|web-commerce/i.test(host));
    const streamingLineageHosts = capturedHosts.filter((host) => /psnow|gaikai|km\.playstation\.net|theia|web\.np\.playstation\.com/i.test(host));

    return {
      generatedAt: new Date().toISOString(),
      session,
      app: {
        packageName: this.pcSurfaceSummary?.shell?.packageName,
        runtimeVersion: this.pcSurfaceSummary?.shell?.runtimeVersion,
        currentAppUrl: this.pcSurfaceSummary?.shell?.currentAppUrl ?? this.pcAuthSummary?.currentAppUrl,
        localhostBrokerUrl,
        preloadCommandCount: uniqueSorted(this.pcSurfaceSummary?.shell?.preloadCommands ?? []).length,
        notifierCommandCount: uniqueSorted(this.pcSurfaceSummary?.shell?.notifierCommands ?? []).length
      },
      hosts: {
        captured: capturedHosts,
        accountAndCommerce: accountAndCommerceHosts,
        streamingLineage: streamingLineageHosts
      },
      capabilities: {
        login: {
          state: session.signedIn ? 'observed' : this.browserAuthSummary || this.pcAuthSummary ? 'partial' : 'unknown',
          evidence: session.markers.filter((marker) => marker.present).map((marker) => `${marker.source}:${marker.key}`),
          notes: session.signedIn
            ? ['Official login state is observable through local browser/native-client artifacts.']
            : ['Use `npm run auth:psn-headed` for an official browser login capture.']
        },
        nativeBroker: {
          state: localhostBrokerUrl ? 'observed' : 'unknown',
          evidence: localhostBrokerUrl ? [localhostBrokerUrl] : [],
          notes: localhostBrokerUrl
            ? [`${uniqueSorted(this.pcSurfaceSummary?.shell?.preloadCommands ?? []).length} preload commands observed in the Electron shell.`]
            : ['Localhost broker not yet observed in current artifacts.']
        },
        profileBootstrap: {
          state: session.signedIn || summarizePcCurrentUserKeys(this.pcAuthSummary).length > 0 ? 'observed' : 'partial',
          evidence: uniqueSorted([
            ...summarizePcCurrentUserKeys(this.pcAuthSummary),
            ...uniqueSorted(this.pcApolloSummary?.pcUserApiPaths ?? []),
            ...uniqueSorted(this.pcApolloSummary?.accountApiTemplates ?? [])
          ]),
          notes: ['Current bootstrap is observation-backed and read-only; no proprietary session replay is attempted.']
        },
        entitlements: {
          state: entitlements.some((entry) => entry.state === 'gated') ? 'gated' : 'unknown',
          evidence: uniqueSorted(entitlements.flatMap((entry) => entry.evidence ?? [])),
          notes: uniqueSorted(entitlements.flatMap((entry) => entry.notes ?? []))
        },
        sessionAllocation: {
          state: 'placeholder',
          evidence: uniqueSorted([
            ...streamingLineageHosts,
            ...uniqueSorted(this.pcApolloSummary?.pcSpecificKamajiPaths ?? [])
          ]),
          notes: ['A real allocator result is still unavailable; the prototype only returns placeholder allocation responses.']
        },
        streamingTransport: {
          state: transportCandidates.length > 0 ? 'partial' : 'unknown',
          evidence: uniqueInOrder([
            ...transportCandidates,
            ...capturedHosts.filter((host) => /gaikai|psnow|web\.np\.playstation\.com|km\.playstation\.net/i.test(host))
          ]),
          notes:
            transportCandidates.length > 0
              ? ['Live stream-phase captures now show high-volume UDP transport candidates, but protocol/session semantics are still not fully mapped.']
              : ['No entitled live media transport capture exists yet, so transport remains intentionally undefined.']
        }
      },
      nextSteps: [
        'Use the observation-backed `allocate()` placeholder to wire UI and control flow without claiming a working stream bootstrap.',
        'Keep login on official Sony-controlled browser surfaces via `npm run auth:psn-headed`.',
        'When a real Premium queue/start path becomes available, replace placeholder allocation evidence with captured allocator/transport observations.'
      ]
    };
  }
}
