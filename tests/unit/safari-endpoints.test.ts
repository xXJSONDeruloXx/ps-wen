import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHostname, normalizeUrl, summarizeSafariEndpoints, type SafariSummaryArtifact } from '../../scripts/lib/safari-endpoints.js';

test('normalizeUrl extracts origin, path, query keys, and GraphQL operation name', () => {
  const normalized = normalizeUrl(
    'https://web.np.playstation.com/api/graphql/v1/op?operationName=getProfileOracle&variables=%7B%7D&extensions=%7B%7D'
  );

  assert.ok(normalized);
  assert.equal(normalized.origin, 'https://web.np.playstation.com');
  assert.equal(normalized.path, '/api/graphql/v1/op');
  assert.deepEqual(normalized.queryKeys, ['extensions', 'operationName', 'variables']);
  assert.equal(normalized.operationName, 'getProfileOracle');
});

test('classifyHostname distinguishes control-plane, telemetry, content, and third-party hosts', () => {
  assert.equal(classifyHostname('web.np.playstation.com'), 'playstation-control-plane');
  assert.equal(classifyHostname('telemetry.api.playstation.com'), 'playstation-telemetry');
  assert.equal(classifyHostname('store.playstation.com'), 'playstation-content');
  assert.equal(classifyHostname('my.account.sony.com'), 'sony-first-party');
  assert.equal(classifyHostname('www.google.com'), 'third-party');
});

test('summarizeSafariEndpoints aggregates GraphQL operation names and host classes', () => {
  const artifact: SafariSummaryArtifact = {
    summaries: [
      {
        title: 'Store',
        url: 'https://store.playstation.com/en-us/pages/latest',
        summary: {
          resourceHostnames: ['store.playstation.com', 'web.np.playstation.com', 'telemetry.api.playstation.com'],
          sampleResourceUrls: [
            'https://web.np.playstation.com/api/graphql/v1/op?operationName=getCartItemCount&variables=%7B%7D',
            'https://store.playstation.com/_next/static/chunks/main.js',
            'https://telemetry.api.playstation.com/api/telemetry/v1/publish/telemetry/telemetry/'
          ]
        }
      }
    ]
  };

  const summary = summarizeSafariEndpoints(artifact);
  assert.deepEqual(summary.graphqlOperations, ['getCartItemCount']);
  assert.equal(summary.hostClassCounts['playstation-control-plane'], 1);
  assert.equal(summary.hostClassCounts['playstation-content'], 1);
  assert.equal(summary.hostClassCounts['playstation-telemetry'], 1);
  assert.equal(summary.uniquePaths.includes('https://web.np.playstation.com/api/graphql/v1/op'), true);
});
