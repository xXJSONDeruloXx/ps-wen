# GraphQL document extraction and correlation — 2026-03-29

## Commands

```bash
npm run research:graphql-docs
npm run api:playstation-web -- probe --ids social.quicklinks.en-us,webtoolbar.l10n.en-us --delay-ms 5000 --out artifacts/api/playstation-web-bootstrap-report.json
npm run api:playstation-web-summary artifacts/api/playstation-web-bootstrap-report.json artifacts/api/playstation-web-bootstrap-summary.json
```

## Artifacts

- `artifacts/public/playstation-graphql-document-report.json`
- `artifacts/api/playstation-web-bootstrap-report.json`
- `artifacts/api/playstation-web-bootstrap-summary.json`

## Why this matters

The public first-party bundles do not only expose operation names. They also embed full GraphQL document text for a subset of PlayStation web operations.

That lets us do three useful things offline:
- distinguish read-only queries from mutations
- extract top-level GraphQL field names used by each operation
- correlate bundle-exposed documents against the current browser-session probe results

## Findings

The current extraction report found:
- `10` embedded GraphQL operations
- `7` queries
- `3` mutations

Already correlated against live probe results:
- `getCartItemCount` → `schema-drift`
- `getProfileOracle` → `schema-drift`
- `queryOracleUserProfileFullSubscription` → `schema-drift`
- `wcaPlatformVariantsRetrive` → `access-denied`

Read-only bundle queries not yet covered by live browser-session probing:
- `getExperienceId`
- `getResolvedProduct`
- `wcaRetrieveWishlist`

Mutation operations clearly identified from bundles and therefore out of scope for read-only probing:
- `backgroundPurchase`
- `wcaAddItemToStoreWishlist`
- `wcaRemoveItemFromStoreWishlist`

## Bootstrap probe note

The new public/bootstrap probes confirmed two additional first-party JSON resources are cleanly fetchable from Safari with paced requests:
- `social.playstation.com/jetstream/quicklinks/en-us.json` → `200`
- `web-toolbar.playstation.com/assets/l10n/en-us.json` → `200`

These look like browser bootstrap/config content, not stream-session allocation APIs.
