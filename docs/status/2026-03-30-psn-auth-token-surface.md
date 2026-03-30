# PSN auth token surface investigation — 2026-03-30

## Purpose

After confirming that the PlayStation Plus PC app was signed in
(`likelySignedIn: true` in `artifacts/auth/playstation-plus-pc-auth-summary.json`),
the goal of this session was to:

1. Locate exactly where every auth credential is stored on disk.
2. Determine whether those credentials are readable without the app running.
3. Exchange them for live API tokens directly from Node.js.
4. Map which Kamaji / PSN endpoints those tokens unlock.
5. Flesh out the CLI with the missing roadmap pieces that are now unblocked.

This document records every finding **and every wrong turn**, because the
wrong turns reveal assumptions that will recur when building further tooling.

> **Update / superseded in part:** several blocked items in this investigation
> were resolved later the same day. See also:
>
> - `docs/status/2026-03-30-access-token-session.md`
> - `docs/status/2026-03-30-auth-techniques-sweep.md`
> - `docs/status/2026-03-30-gaikai-stream-bootstrap-probe.md`
> - `docs/status/2026-03-30-psn-direct-gaikai-surface.md`
>
> In particular, standalone access-token Kamaji sessions, Gaikai `/v1/apollo/id`,
> Gaikai `/v1/events` + `/v1/logs`, `gaikai://local` auth-code minting, and the
> `broker send` CLI surface are now all confirmed.

---

## Auth credential storage — all five layers

### Layer 1 — NPSSO (`ca.account.sony.com`)

**File:** `%APPDATA%\playstation-now\Cookies`
**Format:** Chromium-style SQLite, table `cookies`
**Column:** `value` (plaintext string, 64 characters)

```
host_key : ca.account.sony.com
name     : npsso
value    : <64-char opaque string>   ← directly readable
```

The NPSSO (PlayStation Network Single Sign-On) is the long-lived master
credential.  It is typically valid for 2 years, survives app restarts, and
is the root from which every short-lived bearer token is derived.

**Critical finding:** The value column is **plaintext**.  The
`encrypted_value` column is empty (length 0).  No DPAPI decryption is
required.

This is because the app runs on Electron/Chromium runtime 9.0.4 — an old
build that predates the Chromium v80+ migration to AES-GCM cookie
encryption.  Every cookie in this profile is stored in cleartext.

### Layer 2 — Supporting Sony account cookies

Same file as Layer 1.  Also plaintext.

| host_key             | name        | purpose                              |
|----------------------|-------------|--------------------------------------|
| ca.account.sony.com  | dars        | Device auth redirect state (64 chars)|
| ca.account.sony.com  | KP_uIDz     | Sony account session token (172 chars)|
| ca.account.sony.com  | KP_uIDz-ssn | Sony session (secure variant)        |
| my.account.sony.com  | KP_uIDz     | my.account variant                   |
| my.account.sony.com  | KP_uIDz-ssn | my.account secure variant            |

### Layer 3 — OAuth bearer tokens (short-lived, derivable from NPSSO)

**Not stored on disk between sessions.**  The app obtains a fresh bearer
token on each launch by driving `ca.account.sony.com/api/v1/oauth/authorize`
with the NPSSO cookie.  Evidence of past tokens exists in:

- `%APPDATA%\playstation-now\Cache\data_3` (Chromium HTTP cache, plaintext)

One complete access token response was recovered from the cache:

```
https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/grc-response.html
  #access_token=5cfc6d63-8131-474b-80cb-29208bf1ad5f
  &token_type=bearer
  &expires_in=1199
  &cid=a2c33298-e925-4f66-89c0-eca5d8a9134a
```

`expires_in=1199` → ~20 minutes.  That cached token is long dead.
The live tooling re-derives a fresh one on every invocation using the NPSSO.

### Layer 4 — JSESSIONID + WEBDUID (Kamaji session, Qt WebEngine)

**File:** `%LOCALAPPDATA%\Sony Interactive Entertainment Inc\PlayStationPlus\QtWebEngine\Default\Coookies`

> **Note the triple-o typo** in `Coookies` — this is the actual directory
> name Sony shipped.  Any path-building code must reproduce it exactly.

| host_key                 | name       | purpose                               |
|--------------------------|------------|---------------------------------------|
| psnow.playstation.com    | JSESSIONID | Kamaji server-side session token      |
| psnow.playstation.com    | WEBDUID    | Device-unique identifier (80 hex chars)|

The JSESSIONID is created by the Kamaji server when the PlayStation Plus app
launches and POSTs to `/kamaji/api/pcnow/00_09_000/user` with an
authorization code.  It expires when the app session ends or the server
rotates it.  As of this writing the stored JSESSIONID is **stale**
(session-expired).

The WEBDUID is device-specific and longer-lived.  It is present in both the
Qt WebEngine store (path `/kamaji/api/pcnow/00_09_000/user`) and in the
roaming Chromium profile (path `/kamaji/api/pcnow/00_09_000/user`).

Also present in the Qt WebEngine store:
- `.playstation.com` — `_abck`, `bm_sz` (Akamai bot-management cookies)
- `.sony.com` — `_abck`, `bm_s`, `bm_so`, `bm_ss`, `bm_sz`
- `psnow.playstation.com` — `akacd_psnow-manifest`

### Layer 5 — Cached auth redirect URLs (Chromium HTTP cache)

**File:** `%APPDATA%\playstation-now\Cache\data_1` and `data_3`

The Chromium cache stores the full redirect URLs that `grc-response.html`
received, including query strings and fragments.  Scanning these files
with a regex reveals the exact OAuth parameters the app used, including:

- Every `client_id` value ever used
- Every `scope` string requested
- Authorization codes (already consumed, useless)
- Access tokens (expired, but confirm the token format)

This is how all the client IDs documented below were discovered.

---

## OAuth client IDs and scopes — complete observed map

All extracted from `%APPDATA%\playstation-now\Cache\data_1` by scanning
for full `ca.account.sony.com/api/v1/oauth/authorize?...` URLs.

| Client name     | client_id                            | response_type | scopes                                                                                                                                                  |
|-----------------|--------------------------------------|---------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| `commerce`      | bc6b0777-abb5-40da-92ca-e133cf18e989 | code          | `kamaji:commerce_native kamaji:commerce_container kamaji:lists kamaji:s2s.subscriptionsPremium.get`                                                     |
| `entitlements`  | dc523cc2-b51b-4190-bff0-3397c06871b3 | **token**     | `kamaji:get_internal_entitlements user:account.attributes.validate kamaji:get_privacy_settings user:account.settings.privacy.get kamaji:s2s.subscriptionsPremium.get` |
| `firstplay`     | 7bdba4ee-43dc-47e9-b3de-f72c95cb5010 | code          | `kamaji:commerce_native versa:user_update_entitlements_first_play kamaji:lists`                                                                         |
| `commerce-basic`| 95505df0-0bd8-444a-81b8-8f420c990ca6 | code          | `kamaji:commerce_native`                                                                                                                                |
| `sso`           | 52b0e92a-e131-4940-86f5-5d4447c73dd1 | code          | `sso:none`                                                                                                                                              |

`entitlements` is the only client configured for `response_type=token`
(implicit grant), which means it is the only one that delivers a bearer
`access_token` directly in the redirect fragment without a second round-trip.
All others use `response_type=code` and require a token-exchange step.

### Gaikai stream client IDs (distinct from OAuth client IDs)

These were found in the compiled V8 bytecode cache
(`%APPDATA%\playstation-now\Code Cache\js\*`) in the context of a
`PSN_Event_GotClientId` event payload.  They are Gaikai streaming session
identifiers, **not** OAuth client IDs, and are not used with the PSN
authorization endpoint.

| Name          | Value                                |
|---------------|--------------------------------------|
| gkClient      | 7bdba4ee-43dc-47e9-b3de-f72c95cb5010 |
| ps3GkClientId | 95505df0-0bd8-444a-81b8-8f420c990ca6 |

Note the overlap: `7bdba4ee` and `95505df0` appear as both OAuth client IDs
(for the `firstplay` and `commerce-basic` scopes) and as Gaikai stream
client IDs.  This is intentional — those client IDs are dual-purpose:
they authenticate to the OAuth layer and identify the stream session type to
the Gaikai control plane.

### Common OAuth request parameters

All observed authorize requests share these fixed parameters regardless of
client:

```
smcid          : pc:psnow
applicationId  : psnow
service_entity : urn:service-entity:psn
prompt         : none
renderMode     : mobilePortrait
hidePageElements: forgotPasswordLink
displayFooter  : none
disableLinks   : qriocityLink
mid            : PSNOW
layout_type    : popup
service_logo   : ps
tp_psn         : true
noEVBlock      : true
redirect_uri   : https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/grc-response.html
duid           : <WEBDUID hex value>
```

The `duid` is read from the WEBDUID cookie at session start and echoed back
in every subsequent authorize request.  The observed value for this machine
is `000000070040008864383a34333a61653a31343a35613a6130`.

---

## OAuth authorize endpoint — which version to use

The `VersaURLBuilder` class in `apollo.js` defines four endpoint variants:

```javascript
this.api = {
  signin     : "https://ca.account.sony.com/api/authz/v3/oauth/authorize",
  signout    : "https://ca.account.sony.com/api/authn/v3/signOut",
  token      : "https://ca.account.sony.com/2.0/oauth/token",
  tokenV3    : "https://ca.account.sony.com/api/authz/v3/oauth/token",
  authCode   : "https://ca.account.sony.com/api/v1/oauth/authorize",  // used for authcode + accessToken flows
  authCodeV3 : "https://ca.account.sony.com/api/authz/v3/oauth/authorize"
}
```

All live observed requests used `api/v1/oauth/authorize` (`authCode`).
The v3 endpoint (`authCodeV3` / `signin`) is used for the interactive
sign-in webview popup, not for silent token refresh.

---

## Traps encountered and corrected

### Trap 1 — Assuming DPAPI encryption

**Initial assumption:** Chromium cookies on Windows are DPAPI-encrypted.
The standard decryption path for modern Chrome is:

1. Read `%APPDATA%\Local State` → `os_crypt.encrypted_key` → base64 decode
   → strip 5-byte "DPAPI" prefix → Windows `CryptUnprotectData` → AES key
2. Read cookie `encrypted_value` → strip 3-byte `v10`/`v11` prefix →
   12-byte IV → AES-256-GCM decrypt → plaintext value

**Reality:** This app uses Electron/Chromium **runtime 9.0.4** (circa 2019),
which predates the v80 migration to AES-GCM encryption.  There is no
`Local State` file in the roaming profile.  The `value` column holds the
raw plaintext string.  The `encrypted_value` column has length 0 for every
cookie.

**How we confirmed it:** Queried `length(value)` vs `length(encrypted_value)`
on the live database.  `value` was non-zero for every auth cookie;
`encrypted_value` was zero for all of them.

**Lesson:** Always check `encrypted_value` length first before building a
DPAPI decryption chain.  For legacy Electron apps check the runtime version
against the v80 cutoff.

---

### Trap 2 — `cid` in redirect URL is NOT the `client_id`

**Initial assumption:** The cached redirect URL
```
grc-response.html#access_token=5cfc6d63...&cid=a2c33298-e925-4f66-89c0-eca5d8a9134a
```
meant `a2c33298` was the OAuth `client_id` to use for new authorize
requests.

**Reality:** `cid` is the server-side **correlation ID** (a request trace
UUID), not the client identifier.  Sending `client_id=a2c33298...` to the
authorize endpoint returned:

```json
{"error":"invalid_client","error_code":4173,"error_description":"Invalid client"}
```

**How we found the real client IDs:** Scanned the full authorize **request**
URLs from `data_1` (not response URLs from `data_3`).  Request URLs contain
`client_id=<real-UUID>` as an explicit query parameter; response redirect
URLs echo `cid=<correlation-UUID>` as a trace identifier.

---

### Trap 3 — Wrong OAuth endpoint version

**Initial attempt:** Used `api/authz/v3/oauth/authorize` with the
`09515159` public PSN mobile client ID (from community research).

**Reality:** The PS Now app exclusively uses `api/v1/oauth/authorize` for
all silent token refresh flows.  The v3 endpoint is only used for the
interactive sign-in webview.  Additionally, `09515159` is registered with a
`com.scee.psxandroid.scesoft://` redirect URI; our redirect URI is
`https://psnow.playstation.com/...`, so every attempt with that client
returned `Redirect URI mismatch`.

**What we tried (all failed):**
- `client_id=09515159` + v3 endpoint + `com.scee.psxandroid...` redirect → mismatch
- `client_id=09515159` + v3 endpoint + psnow redirect → mismatch
- `client_id=09515159` + v1 endpoint + psnow redirect → mismatch

**Resolution:** Use only the client IDs extracted directly from this app's
own cache, paired with this app's own redirect URI and the v1 endpoint.

---

### Trap 4 — `COALESCE(is_secure, secure, 0)` SQL bug

**The problem:** The `readCookiesFromDb` function initially used
`COALESCE(is_secure, secure, 0)` to handle both Chromium column name
variants.  In SQLite, all column references in a COALESCE are parsed
and validated at query-prepare time, not lazily at evaluation time.
Since the `secure` column does not exist in either cookie DB, the
`prepare()` call threw a parse error.  That error was silently caught
by the `.catch(() => [])` guard in `readLocalPsnCookies`, so the
function returned an empty array with no visible error.  The result was
`npsso: ''` (falsy), making the entire auth stack look absent even
though the cookies were right there.

**Symptom:** `npm run api:psn-direct -- status` reported
`NPSSO present: false` on the first run.

**Fix:** Perform a `PRAGMA table_info(cookies)` first, detect which
column name is present (`is_secure` vs `secure`), then build the SELECT
dynamically using only the column that exists.  The `.catch(() => [])`
guard was retained but is now a last-resort rather than a silent catch-all.

**Lesson:** Never use `COALESCE` across column names in SQLite without
pre-checking the schema.  And never let silent error suppression eat a
schema mismatch — at minimum log the error even if returning a fallback.

---

### Trap 5 — `psnow` vs `pcnow` in the Kamaji base path

**Initial assumption:** The Kamaji API base path for the PC app is
`/kamaji/api/psnow/00_09_000/` (matching the legacy PS Now service type).

**Partial reality:** The app uses both:

- `https://psnow.playstation.com/kamaji/api/psnow/00_09_000/` — public
  endpoints like `/geo` that do not require a session
- `https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/` — the
  PC-specific session path

The WEBDUID cookie in the Qt WebEngine store has `path` set to
`/kamaji/api/pcnow/00_09_000/user`, which is the session-establishment
endpoint.  This is the definitive indicator that session-gated operations
(user, entitlements, stores) go through the `pcnow` service type, not
`psnow`.

Both paths return the same `Session Expired` 401 when the JSESSIONID is
stale, so the distinction is moot until a live session-establishment path
is found.

---

### Trap 6 — Bearer token alone is insufficient for most Kamaji endpoints

**Assumption:** A freshly-minted bearer token from the `entitlements` client
would allow direct GET requests to `/user`, `/user/entitlements`, etc.

**Reality:** The Kamaji API is session-gated.  Every user-context endpoint
returns:

```json
{"header":{"status_code":"0x0005","message_key":"Session Expired"}}
```

regardless of whether a valid bearer token is present in `Authorization`.
The Kamaji server requires a valid `JSESSIONID` cookie (plus typically
`WEBDUID`) in addition to the bearer token.  The JSESSIONID is established
by POSTing to `/kamaji/api/pcnow/00_09_000/user` from the native app, and
it expires when the app session ends.

**What does work with a bearer token alone:**

| Endpoint                                          | Works? | Result              |
|---------------------------------------------------|--------|---------------------|
| `GET /kamaji/api/psnow/00_09_000/geo`             | ✓ yes  | Region, timezone, postal range |
| `GET /kamaji/api/pcnow/00_09_000/user`            | ✗ 401  | Session Expired     |
| `GET /kamaji/api/psnow/00_09_000/user`            | ✗ 401  | Session Expired     |
| `GET /kamaji/api/psnow/00_09_000/user/stores`     | ✗ 401  | Session Expired     |
| `GET /kamaji/api/psnow/00_09_000/user/entitlements` | ✗ 401 | Session Expired   |
| `GET /kamaji/api/psnow/00_09_000/subscription`    | ✗ 404  | No Data Found       |
| `POST /kamaji/api/pcnow/00_09_000/user` (code body)| ✗ 401 | Session Expired    |

The `/geo` endpoint is the only one that returns live data without a
session.  This is consistent with it being used pre-login for region
detection.

**Path to unblocking session-gated endpoints:** The JSESSIONID must be
re-established by launching the PlayStation Plus app.  The app's startup
flow posts an authorization code to the `pcnow` session endpoint.  Once
a fresh JSESSIONID is written to the Qt WebEngine cookie store, it can be
read by `readLocalPsnCookies()` and sent alongside the bearer token.
The `session-probe` command will then report `session-active`.

---

### Trap 7 — `accounts.api.playstation.com` returning 405

**Attempt:** `GET /api/v2/accounts/me/attributes` with the `entitlements`
bearer token.

**Result:** HTTP 405 Method Not Allowed (no body).

**Interpretation:** The endpoint exists, our credentials are accepted, but
the HTTP method or exact path is wrong.  The 405 without an `Allow` header
means the server didn't bother advertising accepted methods (common behind
Akamai).  The correct path for accounts info appears to have changed between
the Apollo codebase reference (`/api/v2/accounts/me/attributes`) and the
current production API.  Other guesses (`/api/v1/me`, `/api/v2/accounts/me`)
returned 404.

**Status:** Blocked.  Needs a network capture with
`accounts.api.playstation.com` traffic to read the exact path and method
used by the live app.  The TLS capture showed only 1 flow to this host
during the bootstrap phase, which was not decoded in the pcapng metadata.

---

### Trap 8 — `config.cc.prod.gaikai.com` returning 404

**Original attempt:** `GET /v3/config?serviceType=psnow`

**Original result:** nginx 404.

**Later resolution:** the host is real, but the earlier guess used the wrong
method/path.  Confirmed working later the same day:

```http
POST https://config.cc.prod.gaikai.com/v1/config
Content-Type: application/json
body: {}
→ 200
```

Decoded config currently yields only telemetry/control metadata:

- `logEndpoint`  → `https://client.cc.prod.gaikai.com/v1/logs`
- `crashEndpoint` → `https://client.cc.prod.gaikai.com/v1/dump`
- `eventEndpoint` → `https://client.cc.prod.gaikai.com/v1/events`

So this trap is still useful as a record of the wrong guess, but the Gaikai
config path is no longer unknown.

---

## What the NPSSO exchange actually does — step by step

For the implicit grant (the only path that gives a bearer token directly):

```
1. Build a GET URL to:
   https://ca.account.sony.com/api/v1/oauth/authorize

   With query parameters:
   - client_id     : dc523cc2-b51b-4190-bff0-3397c06871b3
   - response_type : token
   - scope         : kamaji:get_internal_entitlements user:account.attributes.validate
                     kamaji:get_privacy_settings user:account.settings.privacy.get
                     kamaji:s2s.subscriptionsPremium.get
   - redirect_uri  : https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/grc-response.html
   - smcid         : pc:psnow
   - applicationId : psnow
   - service_entity: urn:service-entity:psn
   - prompt        : none          ← silent; server must not show a login page
   - duid          : <WEBDUID hex>
   - (plus: mid, tp_psn, noEVBlock, layout_type, renderMode, displayFooter, etc.)

2. Send the GET with:
   Cookie: npsso=<NPSSO value>
   User-Agent: (anything; gkApollo suffix is what the real app sends)

3. The PSN OAuth server validates the NPSSO, sees prompt=none, and responds:
   HTTP 302  Location: https://psnow.playstation.com/.../grc-response.html
               #access_token=<UUID>
               &token_type=bearer
               &expires_in=1199
               &cid=<correlation-UUID>

4. Do NOT follow the redirect. Extract access_token from the Location header.
   The redirect destination is a static HTML file in the app bundle that
   exists only to receive and forward the token back to the Ember app.

5. Use the access_token as: Authorization: Bearer <token>
   Valid for ~20 minutes from issuance.
```

For the authorization code grant (commerce client):

```
Steps 1–3 are the same except response_type=code.
The redirect lands at grc-response.html?code=<6-char-code>&cid=<correlation-UUID>
The code is single-use and expires in seconds.
It must be immediately posted to the Kamaji session endpoint to establish
a JSESSIONID, which is what the native app does on launch.
```

---

## Live API results

### Confirmed working (no session required)

#### `GET /kamaji/api/psnow/00_09_000/geo`

Works with or without a bearer token.  Returns:

```json
{
  "header": { "status_code": "0x0000", "message_key": "success" },
  "data": "US",
  "postal_code": "27601-27617+27619-27629+...",
  "timezone": "EST"
}
```

This is the region/timezone pre-check that runs before any session
is established.  The postal code range is the NPA zone for the
originating IP, not the user's home address.

### Confirmed blocked (requires live Kamaji session)

**This section is superseded by the later standalone access-token session work.**

It is still true that `/user/*` endpoints fail when no valid session cookies are
present, but re-establishing the session does **not** require launching the PS
Plus app anymore.

Later resolution:

- `POST /kamaji/api/pcnow/00_09_000/user/session`
- `Content-Type: application/x-www-form-urlencoded`
- body: `token=<urlencoded_access_token>`

That standalone flow returns fresh `JSESSIONID` + `WEBDUID` and immediately
unlocks:

- `/user/profile`
- `/user/entitlements`

with `recognizedSession` still often `false`.

What remains blocked is not session establishment itself, but the final native
launch path and any endpoints still hidden behind the broker/plugin runtime.

### Confirmed reachable but path unknown

- `accounts.api.playstation.com` — 1 TLS flow observed, path unknown
- `merchandise.api.playstation.com` — 2 TLS flows, path unknown
- `commerce.api.np.km.playstation.net` — 2 TLS flows, path unknown

Later-resolved Gaikai paths:

- `POST https://config.cc.prod.gaikai.com/v1/config`
- `GET/POST https://cc.prod.gaikai.com/v1/apollo/id`
- `POST https://client.cc.prod.gaikai.com/v1/events`
- `POST https://client.cc.prod.gaikai.com/v1/logs`

So `config.cc` is no longer path-unknown; the remaining unknowns here are mostly
account/commerce paths and the final allocator/broker contract.

---

## New files added

### `scripts/lib/psn-auth.ts`

Core auth library.  Provides:

- `readLocalPsnCookies()` — reads NPSSO + JSESSIONID + WEBDUID from both
  on-disk SQLite databases safely (temp-copy before open, schema-adaptive
  column detection, silent no-file fallback)
- `exchangeNpssoForToken(npsso, clientName)` — implicit grant → `access_token`
- `exchangeNpssoForCode(npsso, clientName)` — code grant → `code`
- `queryKamajiGeo(accessToken?)` — live geo query
- `probeKamajiSessionState(token, jsessionId?, webduid?)` — session health
- `probeBrokerReachability(host, port)` — ws://localhost:1235/ TCP probe
- `PSN_OAUTH_CLIENTS` — typed map of all observed client ID / scope combos
- `GAIKAI_CLIENT_IDS` — the two Gaikai stream client IDs
- `defaultRoamingCookiesPath()` / `defaultQtWebEngineCookiesPath()` — path
  helpers (includes the triple-o `Coookies` typo)

### `scripts/api/psn-direct-cli.ts`

Direct API CLI.  The command list shown below reflects the **initial** surface
from this investigation.  It has since grown substantially.

Later-added commands now include, in addition to the original set:

- `session`, `stores`, `profile`, `entitlements`, `manifest`, `catalog`
- `broker send`
- `gaikai id`, `gaikai config`, `gaikai auth-code`, `gaikai event`, `gaikai log`, `gaikai preflight`

All commands accept `--json` for machine-readable output.
`token` still writes to `artifacts/auth/psn-token-exchange.json` by default
(overridable with `--out`).

---

## Roadmap impact

### Now unblocked

- **Token management** — `token` command gives a live bearer token on demand
  from the on-disk NPSSO.  No credential input, no browser, no app running.
- **Geo query** — confirmed live endpoint, real data, works standalone.
- **Session state probe** — `session-probe` gives an actionable diagnosis
  (active / expired / absent) with next-step guidance rather than a raw 401.
- **Broker probe** — `broker` command confirms whether the native client is
  running and exposes the full known preload command list as a reference.

### Unblocked pending one action (launch the app)

**Superseded in part.**  Launching the app is no longer required for the
following standalone cases:

- `/user/profile`
- `/user/entitlements`
- `/user/stores`
- store/catalog queries
- Gaikai preflight (`/v1/apollo/id`, `/v1/config`, `/v1/events`, `/v1/logs`)
- `gaikai://local` auth-code minting

What app launch is still needed for is the **native broker/plugin path**:

- live broker replies
- `requestClientId`
- `streamServerClientId`
- native `setSettings`
- native `setAuthCodes`
- native `requestGame`
- native `startGame`

### Still blocked (needs additional evidence collection)

- **`accounts.api.playstation.com` exact path** — 1 observed TLS flow,
  path unknown.  Needs HTTP payload capture.
- **Session allocation request/response shapes** — the primary remaining
  `Blocked` item from the roadmap.  Browser/HTTP-side preflight is now well
  covered, but the final allocator/launch contract still needs live broker or
  app-runtime evidence.
- **Native broker/plugin replies** — especially the real payloads for
  `requestClientId`, `setSettings`, `setAuthCodes`, `requestGame`, and
  `startGame`, plus the event that yields `streamServerClientId`.

---

## Key reference values (this machine)

These are live values from the authenticated state at time of writing.
They are sensitive and are documented here for engineering reference only;
they are never committed to the repository.

| Item              | Location                                                   |
|-------------------|------------------------------------------------------------|
| NPSSO             | `%APPDATA%\playstation-now\Cookies` → `npsso`              |
| WEBDUID (roaming) | `%APPDATA%\playstation-now\Cookies` → `WEBDUID`            |
| WEBDUID (Qt)      | `%LOCALAPPDATA%\...\QtWebEngine\Default\Coookies` → `WEBDUID` |
| JSESSIONID        | `%LOCALAPPDATA%\...\QtWebEngine\Default\Coookies` → `JSESSIONID` (currently stale) |
| Observed DUID     | `000000070040008864383a34333a61653a31343a35613a6130`       |
| App URL           | `https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/`  |
| Redirect URI      | `https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/grc-response.html` |

---

## Next actions

1. **Run `broker send` against a live app instance** and capture actual reply
   envelopes for:
   - `requestClientId`
   - `testConnection`
   - `setSettings`
   - `setAuthCodes`
   - `requestGame`
   - `startGame`

2. **Capture the event that yields `streamServerClientId`**, which is the most
   concrete remaining missing launch prerequisite.

3. **Continue narrowing allocator/session-start behavior** by combining:
   - broker replies
   - segmented network captures
   - current browser/HTTP-side Gaikai preflight evidence

4. **Keep `prototype:psplus -- status` and the direct CLI aligned** with the
   live auth/session/Gaikai helpers as the remaining launch contract is mapped.
