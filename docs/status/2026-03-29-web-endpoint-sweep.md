# Web endpoint sweep — 2026-03-29

## Artifact

- `artifacts/auth/safari-session-summary.json`

## Method

Used Safari Apple Events JavaScript against already open, signed-in PlayStation tabs to inspect:
- cookie names and signed-in markers
- local/session storage key names
- `performance.getEntriesByType('resource')` hostnames and URLs

## High-confidence endpoint findings

### Shared web identity / toolbar path
Observed across signed-in PlayStation web surfaces:
- `web-toolbar.playstation.com`
- `web.np.playstation.com`
- `io.playstation.com`
- `social.playstation.com`

### GraphQL control-plane clues
Observed on current first-party web surfaces:
- `https://web.np.playstation.com/api/graphql/v1/op?...`

Persisted operation names observed include:
- `getCartItemCount`
- `getProfileOracle`
- `queryOracleUserProfileFullSubscription`
- `getPurchasedGameList`
- `storeRetrieveWishlist`
- `wcaPlatformVariantsRetrive`

### PlayStation.com page-specific clues
Observed on the PSN/support surfaces:
- `https://io.playstation.com/user/details`
- `https://io.playstation.com/user/segments`
- `sessionStorage.gpdcUser`

### Store-specific clues
Observed on `store.playstation.com`:
- Next.js-style assets under `_next/static`
- signed-in state in `sessionStorage.isSignedIn`
- store-specific `chimera-*` local storage keys

### Telemetry separation
Observed independently of core page rendering:
- `telemetry.api.playstation.com`
- `smetrics.aem.playstation.com`
- `web-commerce-anywhere.playstation.com`

## Why this matters

This is the clearest current evidence in-repo for the **web control plane**:
- web auth/session state
- profile/bootstrap queries
- store/state/runtime split
- telemetry endpoints separate from functional profile/cart/wishlist queries

## Remaining caution

These are still browser surfaces. They help map terminology and hostnames, but do not prove the same APIs or auth material are used for native cloud-streaming session startup.
