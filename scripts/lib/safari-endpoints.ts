export type SafariSummaryArtifact = {
  summaries: Array<{
    title: string;
    url: string;
    summary: {
      resourceHostnames?: string[];
      sampleResourceUrls?: string[];
    };
  }>;
};

export type NormalizedEndpoint = {
  origin: string;
  path: string;
  queryKeys: string[];
  operationName?: string;
};

export type HostClass =
  | 'playstation-control-plane'
  | 'playstation-content'
  | 'playstation-telemetry'
  | 'sony-first-party'
  | 'third-party';

export function normalizeUrl(rawUrl: string): NormalizedEndpoint | null {
  try {
    const url = new URL(rawUrl);
    const queryKeys = [...new Set([...url.searchParams.keys()])].sort();
    const operationName = url.searchParams.get('operationName') ?? undefined;
    return {
      origin: url.origin,
      path: url.pathname,
      queryKeys,
      operationName
    };
  } catch {
    return null;
  }
}

export function classifyHostname(hostname: string): HostClass {
  if (/^(web\.np|web-toolbar|io|social)\.playstation\.com$/i.test(hostname)) {
    return 'playstation-control-plane';
  }

  if (/^(telemetry\.api|smetrics\.aem|web-commerce-anywhere)\.playstation\.com$/i.test(hostname)) {
    return 'playstation-telemetry';
  }

  if (/(^|\.)playstation\.com$|(^|\.)playstation\.net$/i.test(hostname)) {
    return 'playstation-content';
  }

  if (/(^|\.)sony\.com$/i.test(hostname)) {
    return 'sony-first-party';
  }

  return 'third-party';
}

export function summarizeSafariEndpoints(artifact: SafariSummaryArtifact) {
  const tabs = artifact.summaries.map((entry) => {
    const normalizedEndpoints = (entry.summary.sampleResourceUrls ?? [])
      .map(normalizeUrl)
      .filter((value): value is NormalizedEndpoint => value !== null);

    const graphqlOperations = [...new Set(normalizedEndpoints.map((item) => item.operationName).filter(Boolean))].sort();
    const uniquePaths = [...new Set(normalizedEndpoints.map((item) => `${item.origin}${item.path}`))].sort();
    const hostClasses = Object.fromEntries(
      [...new Set(entry.summary.resourceHostnames ?? [])]
        .sort()
        .map((hostname) => [hostname, classifyHostname(hostname)])
    );

    return {
      title: entry.title,
      pageUrl: entry.url,
      resourceHostnames: (entry.summary.resourceHostnames ?? []).slice().sort(),
      hostClasses,
      normalizedEndpoints,
      graphqlOperations,
      uniquePaths
    };
  });

  const allEndpoints = tabs.flatMap((entry) => entry.normalizedEndpoints);
  const uniqueHostnames = [...new Set(tabs.flatMap((entry) => entry.resourceHostnames))].sort();
  const hostClassCounts = tabs
    .flatMap((entry) => Object.values(entry.hostClasses))
    .reduce<Record<HostClass, number>>(
      (acc, hostClass) => {
        acc[hostClass] = (acc[hostClass] ?? 0) + 1;
        return acc;
      },
      {
        'playstation-control-plane': 0,
        'playstation-content': 0,
        'playstation-telemetry': 0,
        'sony-first-party': 0,
        'third-party': 0
      }
    );

  return {
    tabs,
    uniqueHostnames,
    hostClassCounts,
    graphqlOperations: [...new Set(allEndpoints.map((entry) => entry.operationName).filter(Boolean))].sort(),
    uniquePaths: [...new Set(allEndpoints.map((entry) => `${entry.origin}${entry.path}`))].sort()
  };
}
