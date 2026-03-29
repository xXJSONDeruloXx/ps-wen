# Browser API probe — 2026-03-29

## Why this step mattered

After confirming that Safari held a genuinely signed-in PlayStation web session, the next question was whether the current web control plane could be exercised **directly** from that same browser session without exporting raw tokens.

To keep the research bounded and safer:
- requests were executed **inside Safari** via Apple Events JavaScript
- only a small allowlist of **observed** first-party endpoints and persisted GraphQL operations was used
- raw responses were kept local under `artifacts/api/`
- this note records only redacted outcomes

## Artifacts

- `artifacts/api/playstation-web-probe-report.json`

## CLI added

```bash
npm run api:playstation-web -- list
npm run api:playstation-web -- call io.user.details
npm run api:playstation-web -- probe
```

## High-confidence results

### 1. Some first-party JSON endpoints work directly from the signed-in browser session
Successful direct calls:
- `io.user.details` → `200`
- `io.user.segments` → `200`

Redacted structural observations:
- `io.user.details` returns a compact profile object with fields like handle, locale, age, country/region, and avatar URL
- `io.user.segments` returns a `segmentsMap` object; current local capture had `13` segment keys

### 2. The `web.np.playstation.com` GraphQL endpoint is reachable, but many observed persisted operations do not replay cleanly
Observed outcomes:
- `graphql.getCartItemCount` → `400`
- `graphql.getProfileOracle` → `400`
- `graphql.queryOracleUserProfileFullSubscription` → `400`
- `graphql.storeRetrieveWishlist` → `200` with GraphQL access-denied error in payload
- `graphql.wcaPlatformVariantsRetrive` → `200` with GraphQL access-denied error in payload
- `graphql.getPurchasedGameList` → `200` with GraphQL access-denied error in payload

### 3. Two distinct failure modes showed up

#### A. Schema drift / stale persisted query behavior
Examples:
- `getCartItemCount` replay reported missing field `webCheckoutCartRetrieve`
- `getProfileOracle` / `queryOracleUserProfileFullSubscription` replay reported missing field `oracleUserProfileRetrieve`

Interpretation:
- browser-observed resource URLs may include persisted operations that are stale, compatibility-gated, or no longer valid for straightforward replay

#### B. Authz failure despite signed-in browser session
Examples:
- wishlist / variants / purchased titles calls returned GraphQL payloads with `Access denied! You need to be authorized to perform this action!`

Interpretation:
- a valid signed-in browser session is **not** sufficient for every observed `web.np.playstation.com` operation
- additional cookies, headers, origin checks, surface-specific state, or backend authorization rules likely matter

## Most important conclusion

Yes, the authenticated browser session is enough to use **some** first-party endpoints directly.

But the results show a split:
- **simple browser-profile endpoints** on `io.playstation.com` work directly
- **observed GraphQL operations** on `web.np.playstation.com` are a mix of:
  - stale/schema-mismatched
  - reachable but access-denied
  - not obviously reusable outside the exact runtime conditions of the page that emitted them
- **direct raw GraphQL query attempts** against the `.../graphql/v1/op` endpoint currently fail at the browser/network layer with `TypeError: Load failed`, which suggests that the `op` path is not a straightforward general GraphQL surface for ad-hoc querying

## Implication for the open-source implementation path

This strongly supports a layered model:
1. browser/session identity bootstrap is one layer
2. browser/query replay is another layer
3. native/session-allocation for cloud streaming is likely a further layer beyond both

In other words: successful browser auth does **not** collapse the problem into “just call the cloud API now.”
