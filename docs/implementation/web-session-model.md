# Web session model notes

This document translates current browser evidence into implementation-relevant concepts.

## Confirmed browser session markers

Across authenticated first-party web surfaces, the following markers were observed:
- cookie `isSignedIn=true`
- cookie `session`
- cookie `userinfo`
- cookie `pdcws2`
- cookie `pdcsi`

These should be treated as **web-surface session indicators**, not assumed-native-client credentials.

## Surface families

### A. PlayStation.com pages
Examples:
- support
- PlayStation Network landing page

Observed state:
- `localStorage.userId`
- `sessionStorage.gpdcUser` on at least some signed-in pages
- `gpdcUser` includes handle / locale / region / subscription-adjacent fields

Implication:
- a browser-oriented identity/profile bootstrap layer exists outside the Store app.

### B. PlayStation Store
Observed state:
- `sessionStorage.isSignedIn=true`
- store-local `chimera-*` keys
- Next.js-style `_next/static` assets

Implication:
- the Store is a distinct app/runtime surface that still shares common auth/session markers with the broader PlayStation web ecosystem.

## Confirmed web control-plane hosts

### Identity / toolbar / profile bootstrap
- `web-toolbar.playstation.com`
- `web.np.playstation.com`
- `io.playstation.com`
- `social.playstation.com`

### Telemetry / analytics
- `telemetry.api.playstation.com`
- `smetrics.aem.playstation.com`
- `web-commerce-anywhere.playstation.com`

## Persisted query pattern

Observed browser requests use:
- `https://web.np.playstation.com/api/graphql/v1/op`

with persisted query operation names such as:
- `getProfileOracle`
- `queryOracleUserProfileFullSubscription`
- `getCartItemCount`
- `getPurchasedGameList`
- `storeRetrieveWishlist`
- `wcaPlatformVariantsRetrive`

## Clean-room takeaway

For an open-source thin-client architecture, this suggests at least three distinct control-plane abstractions:

1. **identity bootstrap provider**
   - determines whether the user is signed in
   - fetches basic profile/session context
2. **catalog/profile query provider**
   - handles GraphQL-like query surfaces
   - remains replaceable per product surface
3. **native streaming session allocator**
   - still unknown
   - likely separate from the public browser-only profile/cart/wishlist flows

## What remains unknown

- whether cloud-stream session startup reuses any of these exact cookies or query surfaces
- whether native clients depend on different OAuth clients/scopes or additional device trust
- whether cloud entitlements are discoverable from web surfaces alone
