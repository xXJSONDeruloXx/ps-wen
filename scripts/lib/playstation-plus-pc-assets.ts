export type PlaystationPlusPcAppAssetSignals = {
  hostnames: string[];
  hitTerms: string[];
  kamajiPaths: string[];
  pcnowPaths: string[];
  apiPaths: string[];
  telemetryNamespaces: string[];
};

const HIT_TERMS = [
  'kamaji',
  'pcnow',
  'chihiro',
  'api.playstation.com',
  'store.playstation.com/store/api/chihiro',
  'psnow.e1-np.playstation.com/store/api/pcnow',
  'psnow.playstation.com/kamaji/api',
  'psnow.playstation.com/psnow/view-2.0/category',
  'clientSessionId',
  'streamSessionId',
  'queuePosition',
  'waitTimeEstimate',
  'closeStream',
  'accessToken',
  'subscriptionSku',
  'isMember',
  'smetrics.aem.playstation.com'
] as const;

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizePossibleHostname(value: string) {
  const normalized = value
    .replace(/^https?:\/\//i, '')
    .replace(/^2F/i, '')
    .replace(/[\\/"'`].*$/, '')
    .replace(/^[^A-Za-z0-9{]+/, '')
    .replace(/[^A-Za-z0-9}.-]+$/g, '');

  if (!normalized.includes('.')) return null;
  if (!/^[A-Za-z0-9{][A-Za-z0-9{}.-]*\.[A-Za-z0-9{}.-]+$/.test(normalized)) return null;
  return normalized;
}

export function extractPlaystationPlusPcAppAssetSignals(text: string): PlaystationPlusPcAppAssetSignals {
  const hostnames = uniqueSorted(
    [
      ...[...text.matchAll(/https?:\/\/([^/'"`\s]+)/g)].map((match) => match[1]),
      ...[...text.matchAll(/\b(?:[A-Za-z0-9{}-]+\.)+(?:playstation\.com|playstation\.net|sony\.com|sonyentertainmentnetwork\.com)\b/gi)].map(
        (match) => match[0]
      )
    ]
      .map((value) => normalizePossibleHostname(value))
      .filter((value): value is string => Boolean(value))
  );

  const hitTerms = HIT_TERMS.filter((term) => text.toLowerCase().includes(term.toLowerCase()));

  const kamajiPaths = uniqueSorted([
    ...[...text.matchAll(/kamaji(?:\/api)?\/[A-Za-z0-9_?=./:-]+/gi)].map((match) => match[0]),
    ...[...text.matchAll(/psnow\.playstation\.com\/kamaji\/api\/[A-Za-z0-9_?=./:-]+/gi)].map((match) => match[0])
  ]).slice(0, 80);

  const pcnowPaths = uniqueSorted([
    ...[...text.matchAll(/(?:store\/api\/pcnow\/[A-Za-z0-9_?=./:-]+|pcnow\/[A-Za-z0-9_?=./:-]+|psnow\/view-2\.0\/[A-Za-z0-9_?=./:-]+)/gi)].map(
      (match) => match[0]
    )
  ]).slice(0, 120);

  const apiPaths = uniqueSorted([
    ...[...text.matchAll(/api\.playstation\.com\/[A-Za-z0-9_?=./:-]+/gi)].map((match) => match[0]),
    ...[...text.matchAll(/store\.playstation\.com\/store\/api\/chihiro\/[A-Za-z0-9_?=./:-]+/gi)].map((match) => match[0])
  ]).slice(0, 120);

  const telemetryNamespaces = uniqueSorted(
    [...text.matchAll(/\b(apollo2|kamaji|blackbird|monaco|titan|VideoStream|PageView|UserFacingError|Impression|Click)\b/g)].map(
      (match) => match[0]
    )
  );

  return {
    hostnames,
    hitTerms,
    kamajiPaths,
    pcnowPaths,
    apiPaths,
    telemetryNamespaces
  };
}
