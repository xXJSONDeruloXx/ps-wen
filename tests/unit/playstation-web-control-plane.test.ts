import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreSafariPageSummary,
  summarizePlaystationWebControlPlane,
  toAccountSessionSnapshot,
  type AssetInventoryArtifact,
  type GraphqlDocumentReportArtifact,
  type ProbeReportArtifact,
  type ProbeSummaryArtifact,
  type SafariSessionSummaryArtifact
} from '../../src/observations/playstation-web-control-plane.js';
import { PlayStationWebObservationProvider } from '../../src/providers/playstation-web-observation-provider.js';

function makeSafariSessionSummary(): SafariSessionSummaryArtifact {
  return {
    generatedAt: '2026-03-29T00:00:00.000Z',
    summaries: [
      {
        index: 4,
        title: 'PlayStation Network',
        url: 'https://www.playstation.com/en-us/playstation-network/',
        summary: {
          url: 'https://www.playstation.com/en-us/playstation-network/',
          title: 'PlayStation Network',
          signInPrompt: true,
          isSignedInCookie: 'true',
          hasSessionCookie: true,
          hasUserInfoCookie: true,
          pdcws2CookiePresent: true,
          pdcsiCookiePresent: true,
          localStorageKeys: ['userId'],
          sessionStorageKeys: ['gpdcUser'],
          userIdLength: 36,
          gpdcUserPresent: true,
          gpdcUserKeys: ['onlineId', 'country', 'subscriptionTier'],
          resourceHostnames: ['io.playstation.com', 'web.np.playstation.com', 'telemetry.api.playstation.com']
        }
      },
      {
        index: 6,
        title: 'Latest | Official PlayStation™Store US',
        url: 'https://store.playstation.com/en-us/pages/latest',
        summary: {
          url: 'https://store.playstation.com/en-us/pages/latest',
          title: 'Store',
          signInPrompt: false,
          isSignedInCookie: 'true',
          hasSessionCookie: true,
          hasUserInfoCookie: true,
          chimeraKeys: ['chimera-user', 'chimera-session'],
          resourceHostnames: ['web-toolbar.playstation.com']
        }
      }
    ]
  };
}

function makeProbeReport(): ProbeReportArtifact {
  return {
    generatedAt: '2026-03-29T00:05:00.000Z',
    results: [
      {
        id: 'io.user.details',
        request: { operationName: null },
        response: { classification: 'success', code: 200, summary: { kind: 'json', errorMessages: [] } },
        rawBody: JSON.stringify({ data: { handle: 'ExampleUser', locale: 'en-US' } })
      },
      {
        id: 'io.user.segments',
        request: { operationName: null },
        response: { classification: 'success', code: 200, summary: { kind: 'json', errorMessages: [] } },
        rawBody: JSON.stringify({ data: { segmentsMap: { alpha: true } } })
      },
      {
        id: 'graphql.getPurchasedGameList',
        request: { operationName: 'getPurchasedGameList' },
        response: {
          classification: 'access-denied',
          code: 200,
          summary: { kind: 'json', errorMessages: ['Access denied! You need to be authorized to perform this action!'] }
        },
        rawBody: JSON.stringify({ errors: [{ message: 'Access denied! You need to be authorized to perform this action!' }] })
      },
      {
        id: 'session.redirect.signin',
        request: { operationName: null },
        response: { classification: 'opaque-redirect', code: 0, summary: { kind: 'empty', errorMessages: [] } },
        rawBody: ''
      },
      {
        id: 'graphql.getProfileOracle',
        request: { operationName: 'getProfileOracle' },
        response: {
          classification: 'schema-drift',
          code: 400,
          summary: { kind: 'json', errorMessages: ['Cannot query field "oracleUserProfileRetrieve" on type "Query".'] }
        },
        rawBody: JSON.stringify({ errors: [{ message: 'Cannot query field "oracleUserProfileRetrieve" on type "Query".' }] })
      },
      {
        id: 'graphql.schema.queryType',
        request: { operationName: 'SchemaRootProbe' },
        response: { classification: 'direct-query-blocked', code: null, error: 'TypeError: Load failed', summary: { kind: 'empty', errorMessages: [] } },
        rawBody: null
      }
    ]
  };
}

function makeProbeSummary(): ProbeSummaryArtifact {
  return {
    generatedAt: '2026-03-29T00:06:00.000Z',
    counts: {
      success: 2,
      'schema-hint': 0,
      'schema-drift': 1,
      'access-denied': 1,
      'csrf-blocked': 0,
      'opaque-redirect': 1,
      'direct-query-blocked': 1,
      'request-error': 0,
      other: 0
    },
    byClassification: {
      success: ['io.user.details', 'io.user.segments'],
      'schema-hint': [],
      'schema-drift': ['graphql.getProfileOracle'],
      'access-denied': ['graphql.getPurchasedGameList'],
      'csrf-blocked': [],
      'opaque-redirect': ['session.redirect.signin'],
      'direct-query-blocked': ['graphql.schema.queryType'],
      'request-error': [],
      other: []
    }
  };
}

function makeAssetInventory(): AssetInventoryArtifact {
  return {
    generatedAt: '2026-03-29T00:07:00.000Z',
    assetCount: 2,
    assets: [
      {
        url: 'https://static.playstation.com/wca/v2/js/common.js',
        graphqlOperationMatches: ['queryOracleUserProfileFullSubscription', 'getSubscriptionInfo'],
        sampleHostnames: ['id-lookup.api.playstation.com']
      },
      {
        url: 'https://web-toolbar.playstation.com/oracle.js',
        graphqlOperationMatches: ['getProfileOracle'],
        sampleHostnames: ['web-toolbar.playstation.com']
      }
    ]
  };
}

function makeGraphqlDocumentReport(): GraphqlDocumentReportArtifact {
  return {
    generatedAt: '2026-03-29T00:08:00.000Z',
    operations: [
      {
        operationType: 'query',
        operationName: 'getProfileOracle',
        readOnly: true,
        rootFields: ['oracleUserProfileRetrieve'],
        sourceUrls: ['https://web-toolbar.playstation.com/oracle.js'],
        probeIds: ['graphql.getProfileOracle'],
        classifications: ['schema-drift']
      },
      {
        operationType: 'query',
        operationName: 'wcaRetrieveWishlist',
        readOnly: true,
        rootFields: ['storeWishlist'],
        sourceUrls: ['https://static.playstation.com/wca/v2/js/common.js'],
        probeIds: [],
        classifications: []
      },
      {
        operationType: 'mutation',
        operationName: 'wcaAddItemToStoreWishlist',
        readOnly: false,
        rootFields: ['storeWishlistAddItem'],
        sourceUrls: ['https://static.playstation.com/wca/v2/js/common.js'],
        probeIds: [],
        classifications: []
      }
    ],
    summary: {
      unprobedReadOnlyOperations: ['wcaRetrieveWishlist'],
      mutationOperations: ['wcaAddItemToStoreWishlist']
    }
  };
}

test('session snapshots preserve strong browser markers despite noisy sign-in prompt copy', () => {
  const safari = makeSafariSessionSummary();
  const snapshot = toAccountSessionSnapshot(safari.summaries[0].summary, safari.generatedAt);

  assert.equal(snapshot.surface, 'playstation.com');
  assert.equal(snapshot.signedIn, true);
  assert.equal(scoreSafariPageSummary(safari.summaries[0].summary) > 0, true);
  assert.equal(snapshot.markers.some((marker) => marker.key === 'gpdcUser' && marker.present), true);
});

test('control-plane summary derives capability states from cached artifacts', () => {
  const summary = summarizePlaystationWebControlPlane({
    safariSessionSummary: makeSafariSessionSummary(),
    probeReport: makeProbeReport(),
    probeSummary: makeProbeSummary(),
    assetInventory: makeAssetInventory(),
    graphqlDocumentReport: makeGraphqlDocumentReport()
  });

  assert.equal(summary.primarySession?.signedIn, true);
  assert.equal(summary.capabilities.identityBootstrap.status, 'observed');
  assert.equal(summary.capabilities.profileBootstrap.status, 'observed');
  assert.equal(summary.capabilities.querySurface.status, 'partial');
  assert.equal(summary.capabilities.entitlements.status, 'gated');
  assert.equal(summary.capabilities.sessionBootstrap.status, 'observed');
  assert.deepEqual(summary.hosts.controlPlane, ['io.playstation.com', 'web-toolbar.playstation.com', 'web.np.playstation.com']);
  assert.deepEqual(summary.hosts.firstPartyOtherPatterns, []);
  assert.deepEqual(summary.graphqlOperations.fromAssetMatches, ['getProfileOracle', 'getSubscriptionInfo', 'queryOracleUserProfileFullSubscription']);
  assert.deepEqual(summary.graphqlOperations.extractedQueries, ['getProfileOracle', 'wcaRetrieveWishlist']);
  assert.deepEqual(summary.graphqlOperations.extractedMutations, ['wcaAddItemToStoreWishlist']);
  assert.deepEqual(summary.graphqlOperations.unprobedReadOnly, ['wcaRetrieveWishlist']);
});

test('observation-backed provider exposes cached profile bootstrap and query outcomes', async () => {
  const provider = new PlayStationWebObservationProvider(makeSafariSessionSummary(), makeProbeReport());

  const session = await provider.detectSession();
  assert.equal(session.signedIn, true);

  const bootstrap = await provider.getProfileBootstrap();
  assert.equal((bootstrap.details as { data: { handle: string } }).data.handle, 'ExampleUser');

  const purchasedGameList = await provider.executePersistedQuery({ operationName: 'getPurchasedGameList' });
  assert.equal(purchasedGameList.errors?.[0]?.message, 'Access denied! You need to be authorized to perform this action!');

  const missing = await provider.executePersistedQuery({ operationName: 'doesNotExist' });
  assert.match(missing.errors?.[0]?.message ?? '', /No cached observation/);
});
