# Public web bundle findings

Derived from:
- `artifacts/auth/safari-session-summary.json`
- `artifacts/public/playstation-web-asset-inventory.json`

## Why this matters

The Safari endpoint sweep told us **which** hosts and URLs were being hit. The next step was to inspect the publicly fetchable first-party JS/JSON assets themselves to see what they hardcode about the current web control plane.

## Asset inventory scope

- inspected `61` first-party JS/JSON/CSS assets referenced by the signed-in Safari session
- focused on first-party hosts under PlayStation/Sony domains
- searched for endpoint hostnames, GraphQL operation names, field names, and session-state terms

## Highest-value assets

### 1. `web-toolbar.playstation.com/oracle-82f902097b9d4cf1a7a6.js`

This bundle is especially important because it contains both configuration and GraphQL document strings.

Observed config strings include:
- `gqlHost: "https://web.np.playstation.com/api/graphql/v1/"`
- `host: "https://web.np.playstation.com/api/session/v1/"`
- `signInCookieName: "isSignedIn"`

Observed embedded query documents include:
- `query getProfileOracle { oracleUserProfileRetrieve { ... } }`
- `query getCartItemCount { webCheckoutCartRetrieve { itemCount } }`

### 2. `https://static.playstation.com/wca/v2/js/common.331069fd60b94f4373ea.js`

This bundle also embeds full GraphQL document text.

Observed embedded query documents include:
- `query queryOracleUserProfileFullSubscription { oracleUserProfileRetrieve { ... userSubscription { ... } } }`
- `query wcaPlatformVariantsRetrive($entityTag: Long) { variantsForPlatformRetrieve(platform: WEB, entityTag: $entityTag) { ... } }`

It also contains code paths that write/read `chimera-*` local storage keys for platform variants.

## Strong interpretation

### A. Public bundles still embed meaningful GraphQL/control-plane details
These are not just opaque hashes. Current public bundles still reveal:
- the GraphQL host family
- the session host family
- cookie-name expectations
- operation names
- field names inside GraphQL documents

### B. Public-bundle queries and live replay behavior do not fully agree
This repo's direct browser-session API probes found that:
- `getCartItemCount` replay fails because `webCheckoutCartRetrieve` is no longer queryable
- `getProfileOracle` / `queryOracleUserProfileFullSubscription` replay fail because `oracleUserProfileRetrieve` is no longer queryable

But those exact field names still appear in current public first-party JS bundles.

This suggests one or more of:
- schema drift between shipped JS and currently reachable API schema
- compatibility gating behind additional runtime conditions
- different execution paths for persisted runtime operations versus naive replay
- multiple backend/schema versions behind the same host family

### C. Direct raw GraphQL queries appear blocked on the `op` endpoint
Controlled non-persisted GraphQL query probes resulted in browser-side `TypeError: Load failed` rather than ordinary JSON GraphQL responses.

Interpretation:
- the `.../graphql/v1/op` endpoint may be intended primarily for persisted-operation flows
- or the gateway may require stricter request shapes/runtime state than a generic GraphQL POST

## What we did **not** find

- no `kamaji` clue in these public browser assets
- no direct cloud-stream session allocator surfaced from this bundle sweep
- no evidence yet that public browser bundles alone expose the native cloud-stream startup path

## Important consequence for research

These public bundles are highly useful for:
- naming current host families
- mapping query/document terminology
- identifying likely stale versus current surface assumptions

But they do **not** eliminate the need for runtime/native-client evidence when moving toward cloud-stream session startup.
