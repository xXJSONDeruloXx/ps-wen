export type GraphqlOperationType = 'query' | 'mutation' | 'subscription';

export type ExtractedGraphqlDocument = {
  operationType: GraphqlOperationType;
  operationName: string;
  document: string;
  rootFields: string[];
};

export type GraphqlDocumentCorrelationEntry = {
  operationType: GraphqlOperationType;
  operationName: string;
  readOnly: boolean;
  rootFields: string[];
  sourceUrls: string[];
  probeIds: string[];
  classifications: string[];
};

export type ProbeReportLike = {
  results: Array<{
    id: string;
    request?: { operationName?: string | null };
    response: { classification: string };
  }>;
};

const JS_STRING_ARRAY_RE = /\["((?:\\.|[^"\\])*)"\]\)/g;

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function decodeEmbeddedJsString(value: string): string | null {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return null;
  }
}

export function extractRootFields(document: string): string[] {
  const lines = document.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const bodyLines = lines.slice(1);
  let minIndent = Number.POSITIVE_INFINITY;
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (trimmed === '{' || trimmed === '}' || trimmed.startsWith('#')) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    minIndent = Math.min(minIndent, indent);
  }

  if (!Number.isFinite(minIndent)) return [];

  return uniqueSorted(
    bodyLines
      .filter((line) => {
        const trimmed = line.trim();
        if (trimmed === '{' || trimmed === '}' || trimmed.startsWith('#')) return false;
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        return indent === minIndent;
      })
      .map((line) => line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? '')
  );
}

export function extractGraphqlDocumentsFromAssetText(text: string): ExtractedGraphqlDocument[] {
  const results = new Map<string, ExtractedGraphqlDocument>();

  for (const match of text.matchAll(JS_STRING_ARRAY_RE)) {
    const decoded = decodeEmbeddedJsString(match[1]);
    if (!decoded) continue;

    const trimmed = decoded.trim();
    const operationMatch = /^(query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(trimmed);
    if (!operationMatch) continue;

    const operationType = operationMatch[1] as GraphqlOperationType;
    const operationName = operationMatch[2];
    const key = `${operationType}:${operationName}:${trimmed}`;
    if (results.has(key)) continue;

    results.set(key, {
      operationType,
      operationName,
      document: trimmed,
      rootFields: extractRootFields(trimmed)
    });
  }

  return [...results.values()].sort((left, right) => left.operationName.localeCompare(right.operationName));
}

export function correlateGraphqlDocuments(params: {
  documentsBySourceUrl: Record<string, ExtractedGraphqlDocument[]>;
  probeReport?: ProbeReportLike;
}) {
  const merged = new Map<string, GraphqlDocumentCorrelationEntry>();

  for (const [sourceUrl, documents] of Object.entries(params.documentsBySourceUrl)) {
    for (const document of documents) {
      const key = `${document.operationType}:${document.operationName}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          operationType: document.operationType,
          operationName: document.operationName,
          readOnly: document.operationType === 'query',
          rootFields: [...document.rootFields],
          sourceUrls: [sourceUrl],
          probeIds: [],
          classifications: []
        });
        continue;
      }

      existing.rootFields = uniqueSorted([...existing.rootFields, ...document.rootFields]);
      existing.sourceUrls = uniqueSorted([...existing.sourceUrls, sourceUrl]);
    }
  }

  if (params.probeReport) {
    for (const entry of merged.values()) {
      const matches = params.probeReport.results.filter(
        (result) => result.request?.operationName === entry.operationName || result.id.endsWith(`.${entry.operationName}`)
      );
      entry.probeIds = uniqueSorted(matches.map((result) => result.id));
      entry.classifications = uniqueSorted(matches.map((result) => result.response.classification));
    }
  }

  const operations = [...merged.values()].sort((left, right) => left.operationName.localeCompare(right.operationName));

  return {
    operations,
    summary: {
      totalOperations: operations.length,
      queryCount: operations.filter((operation) => operation.operationType === 'query').length,
      mutationCount: operations.filter((operation) => operation.operationType === 'mutation').length,
      subscriptionCount: operations.filter((operation) => operation.operationType === 'subscription').length,
      probedOperations: operations.filter((operation) => operation.probeIds.length > 0).map((operation) => operation.operationName),
      unprobedReadOnlyOperations: operations
        .filter((operation) => operation.readOnly && operation.probeIds.length === 0)
        .map((operation) => operation.operationName),
      mutationOperations: operations.filter((operation) => operation.operationType === 'mutation').map((operation) => operation.operationName),
      byClassification: Object.fromEntries(
        uniqueSorted(operations.flatMap((operation) => operation.classifications)).map((classification) => [
          classification,
          operations.filter((operation) => operation.classifications.includes(classification)).map((operation) => operation.operationName)
        ])
      )
    }
  };
}
