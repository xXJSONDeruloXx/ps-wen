# PlayStation Plus PC app Apollo summary — 2026-03-29

## Commands

```bash
npm run research:pc-app-apollo
```

## Artifact

- `artifacts/public/playstation-plus-pc-apollo-summary.json`

## What this adds

This step takes the already-downloaded public `apollo.js` asset for the live PC-app URL and extracts a more structured summary than the generic asset inventory.

## Direct findings

### 1. GrandCentral config still centers the shell on Kamaji

Observed config keys passed into `GrandCentral.setConfig(...)`:

- `clientId`
- `duid`
- `kamajiEnv`
- `kamajiEventsBatchLimit`
- `kamajiEventsTransmitInterval`
- `kamajiEventsUrl`
- `kamajiHostUrl`
- `psnPassword`
- `psnUsername`

Interpretation:

- the public shell code still treats **Kamaji** as a first-class backend concept
- the frontend is built to consume Sony auth/session material directly, even though repo tooling keeps that material redacted

### 2. The live public shell still carries PC-specific Kamaji paths

Observed Kamaji path families:

- `https://psnow.playstation.com/kamaji/api/<serviceType>/00_09_000/`
- `kamaji/api/psnow/00_09_000/`
- `kamaji/api/swordfish/00_09_000/`

That is stronger than a historical string hit: these are in the **live current app asset**, not only the local binary cache.

### 3. The public shell exposes concrete PC user/account endpoint templates

Observed PC-user/API path families:

- `gateway/lists/v1/users/me/lists`
- `user/stores`
- `geo`

Observed account/banner API templates:

- `https://lists.<line>.api.playstation.com/v1/users/me/lists`
- `https://accounts.<line>.api.playstation.com/api/v2/accounts/me/attributes`
- `https://merchandise<line>.api.playstation.com/v1/channels/19/contexts/<Banners>`
- `https://merchandise<line>.api.playstation.com/v1/users/me/channels/19/contexts/<Banners>`

Interpretation:

- the live PC shell appears to mix:
  - Kamaji-backed app-specific endpoints
  - generic account APIs
  - list/banner/store-related APIs
- this gives us a more credible clean-room split between:
  - **identity/account/profile APIs**
  - **PS Now / PC Now / Kamaji app APIs**

### 4. The public shell still advertises an auth-code oriented session bootstrap

Observed auth flow hints in current public `apollo.js`:

- `createAuthCodeSession`
- `promptSignIn`
- `redirectSignIn`
- `kamajiSessionURL`
- `useSessionURL`
- `accountAttributesUrl`
- `myListUrl`
- `requestUserStores`

Interpretation:

- the current PC shell is explicitly built around an **auth-code/session-establishment flow**, not just passive cookie inspection
- this lines up with the cached `grc-response.html` redirect evidence already observed locally

## Practical takeaway

We now have a stronger model for the native PC stack:

1. **Public shell config** says Kamaji is still central.
2. **Local cache** says auth handoff includes both authorization-code and access-token-style redirects.
3. **Running app** says the shell is launched on `psnow.playstation.com/app/...` and talks to a localhost broker.

That is enough to justify treating the current Windows client as a real **PS Now / Kamaji / PC Now control-plane family**, not just a Store shell with extra packaging.

## Next best step

Still unchanged: run metadata capture during a real queue/start/stream flow from an elevated shell.

That is the missing piece needed to confirm which of these observed path families actually appear on the wire during live orchestration.
