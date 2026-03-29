export type ProbeClassification =
  | 'success'
  | 'schema-hint'
  | 'schema-drift'
  | 'access-denied'
  | 'csrf-blocked'
  | 'direct-query-blocked'
  | 'request-error'
  | 'other';

export type ProbeExecutionResult = {
  status: 'done' | 'error';
  ok?: boolean;
  code?: number | null;
  url?: string;
  contentType?: string | null;
  body?: string;
  error?: string | null;
};

export function summarizeJsonShape(value: unknown, depth = 0): unknown {
  if (depth > 2) {
    if (Array.isArray(value)) return { type: 'array', length: value.length };
    if (value && typeof value === 'object') return { type: 'object', keysCount: Object.keys(value as Record<string, unknown>).length };
    if (typeof value === 'string') return `<string:${value.length}>`;
    if (typeof value === 'number') return 'number';
    return typeof value;
  }

  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      itemShape: value.length > 0 ? summarizeJsonShape(value[0], depth + 1) : null
    };
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const looksLikeDynamicMap = keys.length >= 8 && keys.every((key) => /^[A-F0-9]{6,}$/i.test(key));
    if (looksLikeDynamicMap) {
      return {
        type: 'object',
        keysCount: keys.length,
        valueShape: keys.length > 0 ? summarizeJsonShape(obj[keys[0]], depth + 1) : null
      };
    }

    return Object.fromEntries(
      keys.map((key) => {
        const nested = obj[key];
        if (['handle', 'avatar_url_medium', 'encrypted_id', 'userId'].includes(key)) {
          return [key, '<redacted>'];
        }
        return [key, summarizeJsonShape(nested, depth + 1)];
      })
    );
  }

  if (typeof value === 'string') return `<string:${value.length}>`;
  if (typeof value === 'number') return 'number';
  return value;
}

export function summarizeProbeBody(body: string | undefined) {
  if (!body) return { kind: 'empty' as const, errorMessages: [] as string[] };

  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ message?: string }> };
    return {
      kind: 'json' as const,
      errorMessages: parsed.errors?.map((error) => error.message ?? '(no message)') ?? [],
      shape: summarizeJsonShape(parsed)
    };
  } catch {
    return {
      kind: 'text' as const,
      errorMessages: [] as string[],
      sample: body.slice(0, 500)
    };
  }
}

export function classifyProbeResult(params: {
  status: ProbeExecutionResult['status'];
  code: number | null;
  error: string | null;
  errorMessages: string[];
}): ProbeClassification {
  if (/load failed/i.test(params.error ?? '')) return 'direct-query-blocked';
  if (params.status === 'error' || params.error) return 'request-error';

  const joined = params.errorMessages.join(' | ');
  if (/cross-site request forgery|csrf/i.test(joined)) return 'csrf-blocked';
  if (/access denied/i.test(joined)) return 'access-denied';
  if (/cannot query field/i.test(joined)) return 'schema-drift';
  if (/required type|argument|must have a selection of subfields|field .* of type .* must have a selection/i.test(joined)) {
    return 'schema-hint';
  }
  if ((params.code ?? 0) >= 200 && (params.code ?? 0) < 300 && params.errorMessages.length === 0) return 'success';
  return 'other';
}

export type ProbeReportResult = {
  id: string;
  response: {
    classification: ProbeClassification;
    code: number | null;
  };
};

export function summarizeProbeReport(results: ProbeReportResult[]) {
  const counts = results.reduce<Record<ProbeClassification, number>>(
    (acc, result) => {
      acc[result.response.classification] = (acc[result.response.classification] ?? 0) + 1;
      return acc;
    },
    {
      success: 0,
      'schema-hint': 0,
      'schema-drift': 0,
      'access-denied': 0,
      'csrf-blocked': 0,
      'direct-query-blocked': 0,
      'request-error': 0,
      other: 0
    }
  );

  return {
    counts,
    byClassification: Object.fromEntries(
      Object.keys(counts).map((classification) => [
        classification,
        results.filter((result) => result.response.classification === classification).map((result) => result.id)
      ])
    )
  };
}
