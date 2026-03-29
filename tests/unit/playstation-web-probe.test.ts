import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProbeResult, summarizeProbeBody, summarizeProbeReport } from '../../scripts/lib/playstation-web-probe.js';

test('probe classification detects access denied, schema drift, and direct-query-blocked cases', () => {
  assert.equal(
    classifyProbeResult({ status: 'done', code: 200, error: null, errorMessages: ['Access denied! You need to be authorized to perform this action!'] }),
    'access-denied'
  );
  assert.equal(
    classifyProbeResult({ status: 'done', code: 400, error: null, errorMessages: ['Cannot query field "oracleUserProfileRetrieve" on type "Query".'] }),
    'schema-drift'
  );
  assert.equal(
    classifyProbeResult({ status: 'error', code: null, error: 'TypeError: Load failed', errorMessages: [] }),
    'direct-query-blocked'
  );
});

test('probe body summary redacts profile-like fields and captures GraphQL errors', () => {
  const summary = summarizeProbeBody(
    JSON.stringify({
      data: {
        handle: 'ExampleUser',
        avatar_url_medium: 'https://example.com/avatar.png',
        locale: 'en-US'
      },
      errors: [{ message: 'Access denied!' }]
    })
  );

  assert.equal(summary.kind, 'json');
  assert.deepEqual(summary.errorMessages, ['Access denied!']);
  const shape = summary.shape as { data: { handle: string } };
  assert.equal(shape.data.handle, '<redacted>');
});

test('probe report summary groups probe ids by classification', () => {
  const summary = summarizeProbeReport([
    { id: 'a', response: { classification: 'success', code: 200 } },
    { id: 'b', response: { classification: 'access-denied', code: 200 } },
    { id: 'c', response: { classification: 'direct-query-blocked', code: null } }
  ]);

  assert.equal(summary.counts.success, 1);
  assert.equal(summary.counts['access-denied'], 1);
  assert.equal(summary.counts['direct-query-blocked'], 1);
  assert.deepEqual(summary.byClassification.success, ['a']);
});
