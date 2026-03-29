# Safari auth session snapshot — 2026-03-29

## Why this matters

The earlier Chromium helper captures were ambiguous because they ended on a public PlayStation page. After the user enabled **Safari → Developer → Allow JavaScript from Apple Events**, the repo was able to inspect an already authenticated Safari session in a safer, redacted way.

## Artifact

- `artifacts/auth/safari-session-summary.json`

## Tabs inspected

- `https://www.playstation.com/en-us/support/`
- `https://www.playstation.com/en-us/playstation-network/`
- `https://store.playstation.com/en-us/pages/latest`

## High-confidence findings

### 1. Safari session is genuinely signed in on PlayStation web surfaces
Across the inspected PlayStation pages, the browser session showed all of the following:

- `isSignedIn=true`
- presence of `session` cookie
- presence of `userinfo` cookie
- presence of `pdcws2` cookie
- presence of `pdcsi` cookie

This is much stronger evidence of a real authenticated web session than the earlier Chromium capture.

### 2. Cookie lengths are stable-looking across multiple PlayStation web surfaces
Observed on support / PSN / store pages:

- `session` length: `64`
- `userinfo` length: `64`
- `pdcws2` length: `132`
- `pdcsi` length: `307` on PlayStation web pages and store in this snapshot

These are documented only as lengths, not values.

### 3. The generic PlayStation web surface stores a user-centric profile blob in session storage
On `https://www.playstation.com/en-us/playstation-network/`:

- `sessionStorage.gpdcUser` is present
- length observed: `541`
- top-level keys observed:
  - `encrypted_id`
  - `isLoggedIn`
  - `isArkhamLoggedIn`
  - `subscriptions`
  - `handle`
  - `locale`
  - `age`
  - `subAccount`
  - `legalCountry`
  - `region`
  - `avatar_url_medium`

This is a strong clue for the PlayStation.com web identity layer.

### 4. `userId` local storage exists on PlayStation.com pages
On support / PSN pages:

- local storage key `userId` is present
- observed length: `36`

### 5. Store uses a different storage shape than the general PlayStation.com pages
On `https://store.playstation.com/en-us/pages/latest`:

- `sessionStorage.isSignedIn=true`
- no `gpdcUser` observed in session storage
- local storage contains `chimera-*` keys
- local storage also includes `!gct!identifier-short-term-id-store`

This suggests the Store surface has its own client/state layer distinct from the broader PlayStation.com pages.

### 6. Public page UI can still show sign-in marketing while the session is authenticated
On `https://www.playstation.com/en-us/playstation-network/`:

- the page text still includes a visible sign-in prompt section
- but auth cookies and storage strongly indicate the Safari session is already signed in

This confirms the earlier lesson: **page copy alone is not a reliable sign-in detector**.

## Immediate implications

- Web auth validation should key off cookie/storage structure, not just visible page text.
- The Safari session gives us a strong baseline for comparing any future Chromium/session captures.
- `gpdcUser`, `userId`, `pdcws2`, `pdcsi`, `session`, `userinfo`, and store `chimera-*` keys are now first-class items in the web control-plane evidence map.
