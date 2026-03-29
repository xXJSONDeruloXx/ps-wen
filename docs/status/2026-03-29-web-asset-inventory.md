# Web asset inventory — 2026-03-29

## Artifact

- `artifacts/public/playstation-web-asset-inventory.json`

## Command

```bash
npm run research:web-assets
```

## Direct observations

- inspected `61` first-party PlayStation/Sony JS/JSON/CSS assets referenced by the Safari session summary
- the most valuable hits came from:
  - `web-toolbar.playstation.com/oracle-82f902097b9d4cf1a7a6.js`
  - `static.playstation.com/wca/v2/js/common.331069fd60b94f4373ea.js`

## Most important findings

### Web toolbar bundle
The toolbar bundle embeds:
- `gqlHost` → `https://web.np.playstation.com/api/graphql/v1/`
- `host` → `https://web.np.playstation.com/api/session/v1/`
- `signInCookieName` → `isSignedIn`
- GraphQL document text for:
  - `getProfileOracle`
  - `getCartItemCount`

### WCA/common bundle
The common bundle embeds GraphQL document text for:
- `queryOracleUserProfileFullSubscription`
- `wcaPlatformVariantsRetrive`

and references the field names:
- `oracleUserProfileRetrieve`
- `variantsForPlatformRetrieve`

### Replay mismatch is now strongly evidenced
The public bundles still contain field names that the direct browser-session probe could not replay successfully against the current endpoint:
- `oracleUserProfileRetrieve`
- `webCheckoutCartRetrieve`

That is a meaningful sign of schema drift / runtime gating / version skew.

## What changed

- confidence increased that public first-party browser bundles are a useful source of **control-plane naming and configuration clues**
- confidence also increased that browser bundle strings alone are **not sufficient** to produce a working general API client
