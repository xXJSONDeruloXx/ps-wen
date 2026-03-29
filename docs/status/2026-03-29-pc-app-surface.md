# PlayStation Plus PC app surface — 2026-03-29

## Commands

```bash
npm run inspect:pc-app
npm run auth:pc-app-summary
```

## Artifacts

- `artifacts/static/playstation-plus-pc-surface.json`
- `artifacts/auth/playstation-plus-pc-auth-summary.json`

## What is now directly observed

### 1. The installed PC app is still an Electron/ASAR shell

The installed `PlayStation Plus` 12.5.0 payload under `C:\Program Files (x86)\PlayStationPlus\` is not a brand-new native-only frontend.

Observed runtime facts:

- `agl/resources/app.asar` is present
- extracted `package.json` still identifies the shell as **`playstation-now`**
- `agl/version` reports **`9.0.4`**
- the shell depends on Electron-facing modules such as:
  - `websocket`
  - `windows-foreground-love`
  - `ps-list`
  - `regedit`

### 2. The active app URL is a PS Now / PS Plus web app URL, not the Store GraphQL shell

The running `agl.exe` command line shows:

```text
--url=https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/
--settings-dir="C:/Users/kurt/AppData/Local/Sony Interactive Entertainment Inc/PlayStationPlus"
```

So the current Windows client is wrapping a first-party **`psnow.playstation.com/app/...`** web application rather than the Store web shell we had been probing in Safari.

### 3. A native local broker is present on localhost

Observed process tree:

- `pspluslauncher.exe`
- `pspluslauncher.exe --child`
- `agl.exe`
- Electron helper processes under `agl.exe` (`renderer`, `gpu-process`, `utility`)

Observed IPC facts:

- `pspluslauncher.exe` listens on **`ws://localhost:1235/`**
- the Electron shell connects to that broker over loopback
- the shell appends **`gkApollo`** to its user agent
- the preload bridge exposes a much broader command surface than the browser-only Store shell

Examples from the observed preload/API bridge:

- session/control:
  - `requestClientId`
  - `requestGame`
  - `requestSwitchGame`
  - `startGame`
  - `stop`
  - `isStreaming`
  - `isQueued`
  - `isShuttingDown`
- window/input/controller:
  - `windowControl`
  - `routeInputToPlayer`
  - `routeInputToClient`
  - `gamepadSetRumbleEnabled`
  - `gamepadSwap`
  - `gamepadDisconnect`
- device/audio/mic:
  - `audioVolumeControl`
  - `micControl`
  - `isMicConnected`
  - `sendMicConnectedEvent`
- tray/deeplink/supporting UX:
  - `notificationWindow`
  - `trayNotification`
  - `qasTrayIcon`
  - `qasTrayMenu`
  - `saveDataDeepLink`
  - `invitationDeepLink`
  - `gameAlertDeepLink`
  - `systemStatusDeepLink`
  - `rawDataDeepLink`

### 4. The shell hard-allowlists PS Now / Sony account / PS Plus pages

The local Electron main process only opens a small first-party allowlist, including:

- `https://psnow.playstation.com/app/...`
- `https://id.sonyentertainmentnetwork.com/id/management...`
- `https://id.sonyentertainmentnetwork.com/id/upgrade_account_ca`
- `https://www.playstation.com/ps-now`
- `https://www.playstation.com/ps-plus`
- `https://www.playstation.com/playstation-plus/getting-started`
- `https://playstation.com/ps-plus-controllers`

### 5. PC-app auth state is clearly stored in local cookie + storage profiles

Redacted summary only; no raw cookie/token values were exported.

#### Current local QtWebEngine profile

Under:

- `C:\Users\kurt\AppData\Local\Sony Interactive Entertainment Inc\PlayStationPlus\QtWebEngine\Default\`

Observed auth-like cookie names on `psnow.playstation.com`:

- `JSESSIONID`
- `WEBDUID`

Observed local storage keys for `https://psnow.playstation.com`:

- `DUID`
- `currentUser`
- `locale`

`currentUser` parses as JSON with top-level keys:

- `accountID`
- `profile`

The `WEBDUID` cookie path points at:

```text
/kamaji/api/pcnow/00_09_000/user
```

That is the first concrete current-PC-app clue in this repo that a **Kamaji-named** path still exists somewhere in the modern native-app stack.

#### Legacy-style roaming Chromium profile

Under:

- `C:\Users\kurt\AppData\Roaming\playstation-now\`

Observed auth/fraud/storage surfaces:

- cookie DB present
- IndexedDB origins present for:
  - `https://my.account.sony.com`
  - `https://h.online-metrix.net`
- cookies present for:
  - `my.account.sony.com`
  - `ca.account.sony.com`
  - `psnow.playstation.com`
  - `h.online-metrix.net`
  - `skw.eve.account.sony.com`

Interpretation:

- **Sony account auth state is clearly part of the PC app profile surface**
- the app also carries **fraud / device-risk** web state (`online-metrix`, `eve.account.sony.com`)
- the app is not just a thin wrapper around the public Store pages we had already inspected

### 5b. The roaming Chromium profile exposes additional PC-app-only surface clues

The roaming `playstation-now` profile also yields cache/storage evidence that is useful even without touching raw token material.

Observed network hint hosts from `Network Persistent State`:

- `https://redirector.gvt1.com`
- `https://smetrics.aem.playstation.com`
- `https://static.playstation.com`
- `https://web.np.playstation.com`

Observed code-cache asset URLs for the current app shell:

- `https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/apollo.js`
- `https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/js_ex.min.js`
- `https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/vendor.js`

Observed roaming local-storage origins:

- `https://psnow.playstation.com`
- `https://my.account.sony.com`
- `https://skw.eve.account.sony.com`

Observed roaming session-storage origins:

- `https://psnow.playstation.com`
- `https://my.account.sony.com`

Representative redacted key names recovered from the roaming profile:

- PS Now app origin:
  - `DUID`
  - `appVersion`
  - `isOfValidAge`
  - `privacyLevel-<hash>`
  - `modernizr`
- Sony account origin:
  - `!telemetry-web!identifier-session-id`
  - `!telemetry-web!identifier-short-term-id`
  - `__ls_config_flags`
  - `ak_bm_tab_id` (session storage)

This is the first strong local sign that the PC app still carries a hybrid of:
- PS Now app shell state
- Sony account web state
- telemetry / fraud / risk state
- browser-like cache state that can preserve auth handoff evidence

### 5c. Cached auth handoff redirects are directly observable, even when values are redacted

The roaming cache contains multiple cached `grc-response.html` redirect shapes under the live app URL.

Redacted redirect modes observed:

- **authorization-code style** redirect with query keys:
  - `cid`
  - `code`
- **access-token style** redirect with fragment keys:
  - `access_token`
  - `token_type`
  - `expires_in`
  - `cid`
- additional **error-mode** redirects with query keys such as:
  - `error`
  - `error_code`
  - `error_description`
  - `no_captcha`

Interpretation:

- the PC app auth flow is not just cookie-based; cached redirect handoff pages are part of the live auth/session bootstrap path
- the app surface preserves enough evidence to classify the handoff mode **without exporting the raw bearer material**
- the same cached redirect family also helps explain why the app can differ materially from the Store/browser session model

### 6. The updater still points at PS Now-branded metadata

`unidater.ini` contains:

```ini
URL=https://download-psnow.playstation.com/downloads/psnow/pc/meta
```

So even the updater metadata path still carries **PS Now** naming.

### 7. Build fingerprints tie the current payload back to Gaikai-era naming

Observed embedded build-path / PDB clues include:

- `gaikai-player-build`
- `gkp-electron`
- `GkQTKit`
- `pspluslauncher.pdb`

This is not proof of transport behavior by itself, but it strongly supports the current interpretation that the modern PC app is an evolved PS Now / Gaikai line rather than a completely replaced client family.

## Practical takeaway

The Windows PC app surface is now much clearer:

1. **UI shell**: Electron 9.0.4 + ASAR (`playstation-now` package)
2. **Frontend URL**: `https://psnow.playstation.com/app/...`
3. **Native broker**: `pspluslauncher.exe` on `ws://localhost:1235/`
4. **Auth substrate**: local Chromium/QtWebEngine cookies, local storage, IndexedDB, and Sony-account / risk-orchestration web state
5. **Cached auth handoff**: both authorization-code and access-token style `grc-response.html` redirects are observable in the local cache when summarized redacted
6. **Asset/control hints**: the current shell caches `apollo.js`, `vendor.js`, `js_ex.min.js`, and remembers hosts such as `web.np.playstation.com`, `static.playstation.com`, and `smetrics.aem.playstation.com`
7. **Session/stream control hooks**: exposed through the preload bridge, not through the public Store GraphQL surface alone

## What this rules in / rules out

### Ruled in

- the PC client auth/session surface is materially different from the Store-only browser path
- native-client work should focus on:
  - the `psnow.playstation.com/app/...` frontend
  - localhost broker IPC (`1235`)
  - sanctioned metadata capture during launch / queue / stream transitions

### Ruled out

- treating the PC client as only a Store GraphQL problem
- assuming the installed app is no longer Electron-based

## Next best steps

1. Run a short metadata-only capture while launching the logged-in PC app and, if available, starting a real cloud-streaming session.
2. Compare capture hostnames against:
   - `psnow.playstation.com`
   - Sony account hosts
   - any Kamaji-named or allocator-like hosts
3. Use the new redacted summary tooling to track auth/profile state changes over time without exporting raw bearer material.
4. Map which preload commands are actually exercised during:
   - idle shell startup
   - sign-in completion
   - queue entry
   - stream start
   - stream stop / reconnect
