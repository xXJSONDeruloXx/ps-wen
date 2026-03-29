import type {
  AccountSessionSnapshot,
  IdentityBootstrapProvider,
  PersistedQueryRequest,
  PersistedQueryResponse,
  QueryProvider
} from '../architecture/provider-types.js';
import {
  selectPrimarySessionSummary,
  toAccountSessionSnapshot,
  type ProbeReportArtifact,
  type ProbeReportEntry,
  type SafariSessionSummaryArtifact
} from '../observations/playstation-web-control-plane.js';

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findProbeResultByOperationName(probeReport: ProbeReportArtifact, operationName: string): ProbeReportEntry | undefined {
  return probeReport.results.find(
    (result) => result.request.operationName === operationName || result.id.endsWith(`.${operationName}`)
  );
}

function toFallbackQueryResponse<T>(operationName: string, result: ProbeReportEntry): PersistedQueryResponse<T> {
  const errorMessages = result.response.summary?.errorMessages ?? [];
  return {
    operationName,
    errors:
      errorMessages.length > 0
        ? errorMessages.map((message) => ({ message }))
        : [
            {
              message:
                result.response.error ??
                `Cached observation for ${operationName} is classified as ${result.response.classification}.`
            }
          ]
  };
}

export class PlayStationWebObservationProvider implements IdentityBootstrapProvider, QueryProvider {
  constructor(
    private readonly safariSessionSummary: SafariSessionSummaryArtifact,
    private readonly probeReport: ProbeReportArtifact
  ) {}

  async detectSession(): Promise<AccountSessionSnapshot> {
    const primary = selectPrimarySessionSummary(this.safariSessionSummary);
    if (!primary) {
      return {
        capturedAt: this.safariSessionSummary.generatedAt,
        surface: 'unknown',
        signedIn: false,
        markers: []
      };
    }

    return toAccountSessionSnapshot(primary.summary, this.safariSessionSummary.generatedAt);
  }

  async getProfileBootstrap(): Promise<Record<string, unknown>> {
    const details = parseJson(this.probeReport.results.find((result) => result.id === 'io.user.details')?.rawBody);
    const segments = parseJson(this.probeReport.results.find((result) => result.id === 'io.user.segments')?.rawBody);

    return {
      details,
      segments
    };
  }

  async executePersistedQuery<T = unknown>(request: PersistedQueryRequest): Promise<PersistedQueryResponse<T>> {
    const result = findProbeResultByOperationName(this.probeReport, request.operationName);
    if (!result) {
      return {
        operationName: request.operationName,
        errors: [{ message: `No cached observation found for operation ${request.operationName}.` }]
      };
    }

    const parsed = parseJson(result.rawBody);
    if (parsed && typeof parsed === 'object') {
      const payload = parsed as { data?: T; errors?: Array<{ message?: string }> };
      if ('data' in payload || 'errors' in payload) {
        return {
          operationName: request.operationName,
          data: payload.data,
          errors: payload.errors?.map((error) => ({ message: error.message ?? '(no message)' }))
        };
      }

      return {
        operationName: request.operationName,
        data: parsed as T
      };
    }

    return toFallbackQueryResponse<T>(request.operationName, result);
  }
}
