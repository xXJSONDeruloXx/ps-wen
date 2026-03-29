# PlayStation web surface endpoint inventory

Derived from `artifacts/auth/safari-session-summary.json` and the normalized `artifacts/auth/safari-endpoint-report.json` while using an already authenticated Safari session.

## Scope

This is a **browser web-surface** inventory, not a native cloud-streaming protocol capture. It is still valuable because it maps the currently visible control-plane and telemetry hosts used by first-party web properties.

## Surfaces inspected

- `https://www.playstation.com/en-us/support/`
- `https://www.playstation.com/en-us/playstation-network/`
- `https://store.playstation.com/en-us/pages/latest`

## High-value first-party hosts observed

### Shared / identity-adjacent
- `web-toolbar.playstation.com`
- `web.np.playstation.com`
- `io.playstation.com`
- `social.playstation.com`

### Store / content / media
- `store.playstation.com`
- `image.api.playstation.com`
- `static.playstation.com`
- `gmedia.playstation.com`
- `static-resource.np.community.playstation.net`

### Telemetry / analytics
- `telemetry.api.playstation.com`
- `smetrics.aem.playstation.com`
- `web-commerce-anywhere.playstation.com`

## Concrete endpoint examples observed

### Web toolbar / profile bootstrap
- `https://web-toolbar.playstation.com/psnBootstrap.js`
- `https://web-toolbar.playstation.com/assets/l10n/en-us.json`
- `https://web-toolbar.playstation.com/oracle-*.js`
- `https://web-toolbar.playstation.com/oracle-*.css`

A paced Safari probe also confirmed `web-toolbar.playstation.com/assets/l10n/en-us.json` returns a localization/bootstrap JSON payload (`200`).

The current toolbar bundle also embeds config pointing to:
- `https://web.np.playstation.com/api/graphql/v1/`
- `https://web.np.playstation.com/api/session/v1/`
- `signInCookieName = isSignedIn`
- `signInEndpoint = /signin`
- `signOutEndPoint = /signout`

### `web.np.playstation.com` GraphQL persisted queries
Observed query operations include:
- `getCartItemCount`
- `getProfileOracle`
- `queryOracleUserProfileFullSubscription`
- `getPurchasedGameList`
- `storeRetrieveWishlist`
- `wcaPlatformVariantsRetrive`

All were seen through:
- `https://web.np.playstation.com/api/graphql/v1/op?...`

This is one of the strongest current public/browser clues for the PlayStation web control plane.

### `io.playstation.com`
Observed endpoints:
- `https://io.playstation.com/user/details`
- `https://io.playstation.com/user/segments`

These appear on the general PlayStation web pages rather than the Store-only surface.

### `social.playstation.com`
Observed endpoint:
- `https://social.playstation.com/jetstream/quicklinks/en-us.json`

A paced Safari probe confirmed this returns a structured quick-links JSON payload (`200`) and behaves like browser bootstrap/navigation content, not a stream-session API.

### Store implementation clues
- `store.playstation.com/_next/static/...`
- `store.playstation.com/static/lib/shared-nav/...`

This indicates the current Store surface is a Next.js-style app with its own asset/runtime layer.

### Telemetry
- `https://telemetry.api.playstation.com/api/telemetry/v1/publish/telemetry/telemetry/`
- Adobe/smetrics collection requests under `smetrics.aem.playstation.com`

## Interpretation

### What looks shared across multiple first-party web surfaces
- web toolbar/bootstrap logic
- persisted-query GraphQL access on `web.np.playstation.com`
- PlayStation session cookies and signed-in state indicators

### What looks page-family specific
- `gpdcUser` on PlayStation.com pages
- `chimera-*` local storage on the Store
- Store-specific Next.js assets and smetrics naming

## Direct replay note

Browser-session API probing showed that some first-party endpoints can be called directly from the authenticated browser session (`io.playstation.com/user/details`, `io.playstation.com/user/segments`), while many observed GraphQL persisted queries on `web.np.playstation.com` either:
- fail with schema errors, or
- return GraphQL access-denied payloads

That means the observed resource URLs are valuable evidence, but they are **not** automatically reusable as a general-purpose API client surface.

## Why this matters for the implementation path

Even though this repo is targeting a clean-room, non-wrapper path, these browser findings suggest a reusable separation of concerns:

1. **identity/bootstrap layer**
   - cookies, signed-in state, profile bootstrap, toolbar
2. **data/query layer**
   - persisted GraphQL calls under `web.np.playstation.com`
3. **surface-specific app layer**
   - PlayStation.com versus Store runtime/state differences
4. **telemetry layer**
   - separate from functional control-plane requests

## Caution

These are **web** endpoints. They do not imply that native cloud-streaming session startup uses the same exact APIs or auth material. But they are high-value reference points for terminology, hostnames, and identity/profile data flow.
