export type PlaystationPlusPcApolloSummary = {
  kamajiBasePaths: string[];
  pcSpecificKamajiPaths: string[];
  grandCentralConfigKeys: string[];
  pcUserApiPaths: string[];
  accountApiTemplates: string[];
  commerceHosts: string[];
  telemetryHosts: string[];
  authFlowHints: string[];
};

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizeKamajiPath(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return value.replace(/^\/+/, '');
}

export function extractPlaystationPlusPcApolloSummary(text: string): PlaystationPlusPcApolloSummary {
  const kamajiBasePaths = uniqueSorted([
    ...[...text.matchAll(/\/kamaji\/api\/[A-Za-z0-9_?=./:-]+/g)].map((match) => match[0]),
    ...[...text.matchAll(/kamaji\/api\/[A-Za-z0-9_?=./:-]+/g)].map((match) => match[0]),
    ...(text.includes('https://psnow.playstation.com/kamaji/api/') ? ['https://psnow.playstation.com/kamaji/api/<serviceType>/00_09_000/'] : [])
  ].map(normalizeKamajiPath)).slice(0, 80);

  const grandCentralConfigMatch = text.match(/GrandCentral\.setConfig\(\{([^}]+)\}\)/);
  const grandCentralConfigKeys = grandCentralConfigMatch
    ? uniqueSorted(
        [...grandCentralConfigMatch[1].matchAll(/([A-Za-z][A-Za-z0-9]+)\s*:/g)].map((match) => match[1])
      )
    : [];

  const pcUserApiPaths = uniqueSorted([
    ...[...text.matchAll(/gateway\/lists\/v1\/users\/me\/lists/g)].map((match) => match[0]),
    ...[...text.matchAll(/user\/stores/g)].map((match) => match[0]),
    ...[...text.matchAll(/geo\b/g)].map((match) => match[0])
  ]);

  const accountApiTemplates = uniqueSorted([
    ...(text.includes('api.playstation.com/v1/users/me/lists')
      ? ['https://lists.<line>.api.playstation.com/v1/users/me/lists']
      : []),
    ...(text.includes('api.playstation.com/api/v2/accounts/me/attributes')
      ? ['https://accounts.<line>.api.playstation.com/api/v2/accounts/me/attributes']
      : []),
    ...(text.includes('api.playstation.com/v1/channels/19/contexts/')
      ? ['https://merchandise<line>.api.playstation.com/v1/channels/19/contexts/<Banners>']
      : []),
    ...(text.includes('api.playstation.com/v1/users/me/channels/19/contexts/')
      ? ['https://merchandise<line>.api.playstation.com/v1/users/me/channels/19/contexts/<Banners>']
      : [])
  ]);

  const commerceHosts = uniqueSorted([
    ...[...text.matchAll(/\b(?:commerce1?|image|catalog|activity|event|friendfinder|livearea|recs|sn|mds)\.[A-Za-z0-9{}.-]+(?:playstation\.net|playstation\.com)\b/g)].map(
      (match) => match[0]
    ),
    ...[...text.matchAll(/\b(?:apollo2?|theia|nsx|legaldoc|static-resource)\.[A-Za-z0-9{}.-]+(?:playstation\.net|playstation\.com)\b/g)].map(
      (match) => match[0]
    )
  ]).slice(0, 120);

  const telemetryHosts = uniqueSorted(
    [...text.matchAll(/\b(?:smetrics|metrics)\.aem\.playstation\.com\b/g)].map((match) => match[0])
  );

  const authFlowHints = uniqueSorted([
    ...(text.includes('createAuthCodeSession') ? ['createAuthCodeSession'] : []),
    ...(text.includes('promptSignIn') ? ['promptSignIn'] : []),
    ...(text.includes('redirectSignIn') ? ['redirectSignIn'] : []),
    ...(text.includes('kamajiSessionURL') ? ['kamajiSessionURL'] : []),
    ...(text.includes('useSessionURL') ? ['useSessionURL'] : []),
    ...(text.includes('accountAttributesUrl') ? ['accountAttributesUrl'] : []),
    ...(text.includes('myListUrl') ? ['myListUrl'] : []),
    ...(text.includes('requestUserStores') ? ['requestUserStores'] : [])
  ]);

  const pcSpecificKamajiPaths = uniqueSorted(
    kamajiBasePaths.filter((value) => /pcnow|psnow|swordfish/i.test(value))
  );

  return {
    kamajiBasePaths,
    pcSpecificKamajiPaths,
    grandCentralConfigKeys,
    pcUserApiPaths,
    accountApiTemplates,
    commerceHosts,
    telemetryHosts,
    authFlowHints
  };
}
