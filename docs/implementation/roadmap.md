# PlayStation Plus  roadmap

This is the living done/todo tracker for turning current evidence into a  OSS thin-client MVP without overstating what has been proven.

## Status legend

- **Done** — captured locally or implemented in the repo
- **In progress** — partially proven / partially implemented
- **Next** — highest-value follow-up work
- **Blocked** — needs evidence we still do not have

## Done

### Evidence and archaeology

- **Done**: installed Windows PlayStation Plus payload summarized
  - Electron/ASAR shell confirmed
  - package lineage `playstation-now`
  - runtime `9.0.4`
  - app URL `https://psnow.playstation.com/app/...`
- **Done**: localhost broker confirmed
  - `ws://localhost:1235/`
  - preload/notifier command inventory captured
- **Done**: redacted PC-app auth/storage surface summarized
  - QtWebEngine + roaming Chromium-style profile evidence
  - redacted `grc-response.html` handoff modes
- **Done**: public PC-app bundles inventoried
  - `apollo.js`, `vendor.js`, `js_ex.min.js`
  - Kamaji / PC Now / account API hints extracted
- **Done**: Windows metadata captures performed
  - startup/control-plane captures
  - full stream-phase all-port capture
  - segmented launch/quit/save-action captures
- **Done**: strong stream transport clue established
  - high-volume UDP/2053 to Sony-owned `104.142.128.0/17`

### Prototype implementation

- **Done**: observation-backed PlayStation Plus provider
- **Done**: prototype CLI
  - `status`
  - `bootstrap`
  - `entitlements`
  - `allocate`
  - `login`
- **Done**: system-browser login flow by default
- **Done**: persisted browser-login flow state machine
  - `confirm-login`
  - `reset-flow`
- **Done**: built-in pcapng summarizer with transport-candidate detection

### Auth token surface (2026-03-30)

- **Done**: all five auth credential layers located and documented
  - NPSSO + supporting cookies in `%APPDATA%\playstation-now\Cookies` (SQLite, **plaintext** — old Electron runtime, no DPAPI)
  - JSESSIONID + WEBDUID in `%LOCALAPPDATA%\...\QtWebEngine\Default\Coookies` (note triple-o typo)
  - Cached access tokens and full authorize request URLs in `%APPDATA%\playstation-now\Cache\data_1`
- **Done**: complete OAuth client ID and scope map extracted from live browser cache
  - 5 distinct client IDs with their scopes and response types documented
  - Gaikai stream client IDs (`7bdba4ee`, `95505df0`) distinguished from OAuth client IDs
- **Done**: NPSSO → live bearer token exchange confirmed working
  - `entitlements` client (`dc523cc2`) with implicit grant delivers `access_token` directly
  - `commerce` client (`bc6b0777`) with code grant delivers authorization code
- **Done**: live Kamaji `/geo` endpoint confirmed working with bearer token
  - Returns region (US), timezone (EST), postal code range
- **Done**: Kamaji session state probe documented
  - `session-expired` confirmed; JSESSIONID is stale post-session
  - Re-establishment path identified: app launch → POST to `/kamaji/api/pcnow/00_09_000/user`
- **Done**: Kamaji session establishment confirmed working standalone (2026-03-30)
  - guest session endpoint: `POST /kamaji/api/pcnow/00_09_000/user/session`
  - guest body: form-encoded `country_code + language_code + date_of_birth`
  - access-token session endpoint: same path, body `token=<urlencoded_access_token>`
  - No Authorization header on the session POST — auth rides Akamai bot-management cookies seeded by any Sony request
  - Returns JSESSIONID + WEBDUID + sessionUrl in one shot
  - access-token session yields non-null `accountId`, `onlineId`, `signInId` and unlocks `/user/profile` + `/user/entitlements`
  - internal `recognizedSession` may remain false even though the session is practically authenticated
- **Done**: `/user/stores` confirmed working with guest session
  - Returns full store/catalog/search/PS-Plus/recs URL map
- **Done**: complete app `clientIDMap` extracted from live HTML meta tag
  - Two new client IDs found: `df10acc0` (browser/pachirisu/luxray), `1045850d` (zapdos/jolteon)
- **Done**: GrandCentral SDK (`grandcentral.js`, 534KB) fetched and saved
  - Fully obfuscated — no plaintext paths survive; Playwright intercept was necessary
- **Done**: `session`, `stores`, `profile`, `entitlements`, `manifest`, and `catalog` commands added to `psn-direct-cli.ts`
- **Done**: app manifest endpoint confirmed live
  - `GET /exp-manifest/ms/pc/1.0/apollo/application/json/manifest`
  - returns app version map, env URLs, and PS Plus deep-link category IDs by region
- **Done**: store catalog confirmed live with guest session
  - `GET /store/api/pcnow/00_09_000/container/US/en/19/STORE-MSF192018-APOLLOROOT`
  - full browseable category tree confirmed (Must Play, Action, Sports, Adventure, Shooter, Racing, RPG, Puzzle, Kids & Family, Fighting, Simulation, Strategy, Remasters, PSP/PS1/PS2, PS3, alphabetical ranges)
  - `STORE-MSF192018-PLUSDEALS` returned live counts: 497 games, 113 bundles, 72 add-ons, 1 avatar
  - real product inventory extracted from category containers (e.g. Days Gone, God of War, Assassin's Creed Odyssey, Marvel's Guardians of the Galaxy, Far Cry 6, Heavenly Sword, Ratchet & Clank remasters, The Last of Us Remastered, LEGO Batman 3, My Friend Peppa Pig)
  - title/content IDs confirmed in live responses (`UPxxxx-CUSA...`, `UP9000-NPUA...`)
- **Done**: `auth:intercept-session` Playwright interceptor script
  - broader intercept confirmed full GrandCentral startup sequence including Akamai sensor POSTs to `/ELdff8h5I1y7/...`, manifest fetch, OAuth GET, and session POST to `/user/session`
  - recognition blocker identified: cross-domain `ca.account.sony.com/ELdff8h5I1y7/...` load returns 403 in plain browser context; native Electron WebView likely required
  - `token` — NPSSO → bearer token or auth code
  - `geo` — live Kamaji geo query
  - `session-probe` — Kamaji session health with actionable guidance
  - `broker` — localhost:1235 WebSocket reachability probe
  - `status` — combined snapshot of all of the above
- **Done**: all traps and corrections documented in `docs/status/2026-03-30-psn-auth-token-surface.md`
- **Done**: full autonomous auth resolution (2026-03-30)
  - NPSSO: Safari `prompt=none` silent auth + `document.cookie` AppleScript — no Playwright, no manual login needed
  - Kamaji session: `token=<urlencoded_bearer>` body POST yields accountId + onlineId + JSESSIONID + WEBDUID
  - `/user/profile` + `/user/entitlements` (597 titles) confirmed live
  - Chiaki Remote Play tokens obtained via same Safari path: access_token + refresh_token + user_id confirmed
  - `cloudAssistedNavigation/v2/users/me/clients` working with Chiaki token (no PS5 registered)
  - Four DUID prefix families documented: `0000000700400088` (PC-app), `0000000700090100` (web), `0000000700410080` (Chiaki), `0000000700060100` (guest session)
  - `recognizedSession: false` confirmed permanent outside native Electron WebView (cross-domain `ca.account.sony.com/ELdff8h5I1y7/...` load blocked by Akamai; does not affect profile/entitlements)
  - Sony login form stable selectors documented: `#signin-entrance-input-signinId`, `#signin-password-input-password`
  - Akamai bot-management (not passkey) is the auth blocker for automated `ssocookie` — passkey is `enabled:false` on this account

## In progress

### Control plane

- **In progress**: distinguishing bootstrap hosts from long-lived session-control hosts
  - launch/start slice suggests `accounts.api.playstation.com`, `commerce.api.np.km.playstation.net`, `config.cc.prod.gaikai.com`, `download-psnow.playstation.com`, `theia.dl.playstation.net`, and `web.np.playstation.com` are more bootstrap-heavy
  - quit/save slices suggest `client.cc.prod.gaikai.com` and `psnow.playstation.com` persist later in the session

### Transport

- **In progress**: transport family identification
  - custom UDP is now strongly indicated
  - exact framing, multiplexing, and codec semantics remain unknown

### Save/overlay semantics

- **In progress**: save-management mapping
  - copy-to-online-storage did not surface a distinct obvious save-only PlayStation hostname family
  - delete-only comparison remains optional unless save-management becomes a real MVP requirement
- **In progress**: overlay-action mapping
  - an overlay-only capture is now recorded
  - it did not surface fresh PlayStation DNS/TLS hostnames, which suggests simple overlay toggles may ride an already-open session/broker path

### MVP shell

- **In progress**: the repo can model login/bootstrap/gated entitlements/placeholder allocation, but it does not yet have a dedicated broker adapter or placeholder launch/quit UX layer

## Next

### Highest-value evidence collection

0. **Subscription + allocator path discovery** — authenticated token sessions now work standalone. The highest-value next step is to identify the real subscription endpoint (since `/user/subscription` returns 404) and then move on to stream/session allocation requests.

1. **Cleaner click-from-list to picture-only** segmented capture
   - one such run already suggests allocation/startup had progressed into `client.cc` + Sony-owned UDP/2053 before the first visible frame
   - repeat with explicit timing notes for title click and first picture
2. **Timed quit-game capture**
   - repeat with explicit timing notes for overlay open, quit select, confirm, and window close
3. **Action timestamp correlation**
   - note approximate user action times during capture windows so host/port shifts can be matched to UI actions more precisely
4. **Optional / lower priority**: delete-from-online-storage-only segmented capture if save-management becomes important again

### Highest-value implementation work

1. **Subscription endpoint discovery** — authenticated session is live, but `/user/subscription` returns 404. Probe sibling paths and inspect app traffic for the real subscription resource.

2. **Broker replay / capture (now highest value)** — `broker send <command> [payload]` is now implemented in `psn-direct-cli.ts`, so the next task is to use it against a live running app to capture real replies for `requestClientId`, `setSettings`, `setAuthCodes`, `requestGame`, and `startGame`. Known commands: `startGame`, `stop`, `requestGame`, `requestClientId`, `testConnection`, `setAuthCodes`, `setSettings`, `sendXmbCommand`, `routeInputToPlayer`, `routeInputToClient`, `saveDataDeepLink`, `rawDataDeepLink`, `invitationDeepLink`, `gameAlertDeepLink`, `systemStatusDeepLink`. Newer bundle evidence also narrows the likely payload shapes: PC `requestClientId()` appears to take no params and emit `gkClientId`, `ps3GKClientID`, and `streamServerClientId`; PC `setSettings()` appears object-shaped; PC auth-code staging may be either a direct `setAuthCodes` command or a second `setSettings` call carrying `gkCloudAuthCode`, `gkPs3AuthCode`, and `streamServerAuthCode`; and PC `requestGame()` may reduce to a boolean `forceLogout` call after setup.

3. **Allocator/session-start endpoint discovery** — with standalone auth now solved and browser/HTTP-side Gaikai preflight now covered by the CLI (`gaikai id|config|auth-code|event|log|preflight`), focus on the request/response shape that turns entitlement + title selection into a real stream allocation. The current evidence suggests the remaining boundary is likely broker/plugin-facing rather than a simple extra public HTTP route.

4. **Live `prototype:psplus -- status` integration** — replace the static observation provider calls for login/entitlement state with live calls from `psn-auth.ts`, so the prototype CLI reflects real-time state rather than cached artifacts.

5. **Entitlement normalization** — correlate `/user/entitlements` IDs and SKU IDs with store catalog product/container IDs.

6. **Placeholder launch/quit UX** — use current placeholder allocation results + flow state machine

7. **Diagnostics panel / capture comparison view** — compare launch vs quit vs save-action captures side by side

8. **Session lifecycle model** — bootstrap -> running -> overlay -> save action -> quit -> post-session

## Blocked / missing for a true Sony-app replacement

These are the pieces that still prevent a full standalone replacement of the official app:

### Auth/session ownership

- ~~a standalone native auth completion model~~ **fully resolved (2026-03-30)**:
  - NPSSO obtained via Safari `prompt=none` silent auth + `document.cookie` via AppleScript
  - NPSSO → bearer token → `token=<bearer>` body POST to `/user/session` → JSESSIONID + WEBDUID + accountId + onlineId confirmed
  - `/user/profile` + `/user/entitlements` (597 titles) confirmed working standalone
  - Chiaki Remote Play tokens (access_token + refresh_token + user_id) obtained via same Safari silent-auth path
  - `recognizedSession: false` is permanent outside native Electron WebView — does NOT block profile/entitlements

### Entitlements

- exact Premium streaming entitlement semantics
- exact device/region/subscription gating behavior

### Session allocation

- allocator request/response message shapes
- exact relationship between:
  - `psnow.playstation.com`
  - `cc.prod.gaikai.com/v1/apollo/id`
  - `client.cc.prod.gaikai.com/v1/events`
  - `client.cc.prod.gaikai.com/v1/logs`
  - `config.cc.prod.gaikai.com/v1/config`
  - the session-assigned UDP/2053 endpoints
- native `requestClientId` event payload, especially `streamServerClientId`
- broker/plugin contract for `setSettings` → `setAuthCodes` → `requestGame` → `startGame`

### Media/control transport

- framing and channel layout
- codec/bitstream details
- encryption/session keying
- whether media/input/control are multiplexed or split
- reconnect behavior

### Save-management semantics

- whether save actions ride an existing TLS control channel, the UDP session transport, or both

## What the OSS MVP can honestly do now

A  MVP can already:

- open official browser login
- track login confirmation state
- inspect known bootstrap/runtime/auth observations
- expose gated entitlement placeholders
- expose placeholder allocation results
- mint Gaikai `clientSessionId` / `apolloId`
- fetch and decode `config.cc.prod.gaikai.com/v1/config`
- dispatch Gaikai `/v1/events` and `/v1/logs` with valid headers
- mint `gaikai://local` PSN auth codes for launch preflight
- replay raw or structured localhost broker frames via `broker send`
- hint that stream transport is likely custom UDP
- provide strong diagnostics and capture comparison tooling

It cannot yet honestly claim to:

- allocate real cloud-stream sessions independently
- decode or drive the live media transport
- fully replace the official Sony app for gameplay

## Exit condition for the next phase

The next phase is ready when we have:

1. the delete-only and overlay-only segmented captures documented
2. a broker adapter seam in the prototype
3. a clearer launch/bootstrap vs running-session vs quit teardown map
4. enough confidence to keep transport labeled as `custom-udp` with tighter lifecycle correlation, even if protocol semantics remain unknown
