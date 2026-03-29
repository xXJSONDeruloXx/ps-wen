import test from 'node:test';
import assert from 'node:assert/strict';
import { correlateGraphqlDocuments, extractGraphqlDocumentsFromAssetText, extractRootFields } from '../../scripts/lib/playstation-graphql-documents.js';

test('extractRootFields returns the top-level fields for queries and mutations', () => {
  assert.deepEqual(
    extractRootFields(`query getProfileOracle {\n  oracleUserProfileRetrieve {\n    accountId\n  }\n}`),
    ['oracleUserProfileRetrieve']
  );
  assert.deepEqual(
    extractRootFields(`mutation wcaAddItemToStoreWishlist($input: StoreWishlistAddItemInput) {\n  storeWishlistAddItem(input: $input) {\n    itemId\n  }\n}`),
    ['storeWishlistAddItem']
  );
});

test('extractGraphqlDocumentsFromAssetText finds embedded GraphQL docs in minified bundle strings', () => {
  const assetText = 'function X(){return g()(["\\n  query getProfileOracle {\\n    oracleUserProfileRetrieve {\\n      accountId\\n    }\\n  }\\n"])} function Y(){return g()(["mutation wcaAddItemToStoreWishlist($input: StoreWishlistAddItemInput) {\\n  storeWishlistAddItem(input: $input) {\\n    itemId\\n  }\\n}\\n"])}';
  const docs = extractGraphqlDocumentsFromAssetText(assetText);

  assert.deepEqual(
    docs.map((document) => [document.operationType, document.operationName]),
    [
      ['query', 'getProfileOracle'],
      ['mutation', 'wcaAddItemToStoreWishlist']
    ]
  );
  assert.deepEqual(docs.find((document) => document.operationName === 'getProfileOracle')?.rootFields, ['oracleUserProfileRetrieve']);
});

test('correlateGraphqlDocuments marks unprobed read-only operations and probe classifications', () => {
  const correlation = correlateGraphqlDocuments({
    documentsBySourceUrl: {
      'https://example.com/bundle.js': [
        {
          operationType: 'query',
          operationName: 'getProfileOracle',
          document: 'query getProfileOracle { oracleUserProfileRetrieve { accountId } }',
          rootFields: ['oracleUserProfileRetrieve']
        },
        {
          operationType: 'query',
          operationName: 'getSubscriptionType',
          document: 'query getSubscriptionType { subscriptionTypeRetrieve { type } }',
          rootFields: ['subscriptionTypeRetrieve']
        },
        {
          operationType: 'mutation',
          operationName: 'wcaAddItemToStoreWishlist',
          document: 'mutation wcaAddItemToStoreWishlist($input: StoreWishlistAddItemInput) { storeWishlistAddItem(input: $input) { itemId } }',
          rootFields: ['storeWishlistAddItem']
        }
      ]
    },
    probeReport: {
      results: [
        {
          id: 'graphql.getProfileOracle',
          request: { operationName: 'getProfileOracle' },
          response: { classification: 'schema-drift' }
        }
      ]
    }
  });

  assert.deepEqual(correlation.summary.unprobedReadOnlyOperations, ['getSubscriptionType']);
  assert.deepEqual(correlation.summary.mutationOperations, ['wcaAddItemToStoreWishlist']);
  assert.deepEqual(correlation.summary.byClassification['schema-drift'], ['getProfileOracle']);
});
