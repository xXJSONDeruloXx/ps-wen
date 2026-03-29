export type SessionSurface = 'playstation.com' | 'store.playstation.com' | 'native-client' | 'unknown';

export type SessionMarker = {
  source: 'cookie' | 'localStorage' | 'sessionStorage' | 'header' | 'other';
  key: string;
  present: boolean;
  notes?: string;
};

export type AccountSessionSnapshot = {
  capturedAt: string;
  surface: SessionSurface;
  signedIn: boolean;
  markers: SessionMarker[];
  profileHints?: {
    userIdPresent?: boolean;
    handlePresent?: boolean;
    subscriptionInfoPresent?: boolean;
    regionPresent?: boolean;
  };
};

export type PersistedQueryRequest = {
  operationName: string;
  variables?: unknown;
  extensions?: unknown;
};

export type PersistedQueryResponse<T = unknown> = {
  operationName: string;
  data?: T;
  errors?: Array<{ message: string }>;
};

export interface IdentityBootstrapProvider {
  detectSession(): Promise<AccountSessionSnapshot>;
  getProfileBootstrap(): Promise<Record<string, unknown>>;
}

export interface QueryProvider {
  executePersistedQuery<T = unknown>(request: PersistedQueryRequest): Promise<PersistedQueryResponse<T>>;
}

export type EvidenceConfidence = 'observed' | 'inferred';

export type EntitlementState = 'active' | 'inactive' | 'gated' | 'unknown';

export type EntitlementRecord = {
  id: string;
  source: string;
  state: EntitlementState;
  confidence: EvidenceConfidence;
  attributes?: Record<string, unknown>;
  evidence?: string[];
  notes?: string[];
};

export interface EntitlementProvider {
  listEntitlements(): Promise<EntitlementRecord[]>;
}

export type SessionAllocationRequest = {
  titleId?: string;
  regionPreference?: string;
  qualityPreference?: 'auto' | '720p' | '1080p' | '4k';
};

export type SessionAllocation = {
  state: 'allocated' | 'blocked' | 'placeholder';
  confidence: EvidenceConfidence;
  sessionId?: string;
  region?: string;
  transportHint?: 'webrtc' | 'custom-udp' | 'quic-like' | 'unknown';
  endpointHints?: string[];
  evidence?: string[];
  blockers?: string[];
  notes?: string[];
};

export interface SessionAllocator {
  allocate(request: SessionAllocationRequest): Promise<SessionAllocation>;
  release(sessionId: string): Promise<void>;
}
