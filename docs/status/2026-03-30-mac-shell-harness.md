# Mac shell harness against local broker emulator — 2026-03-30

## Summary

On macOS, without the official Windows app installed, we were still able to run
Sony's real `psnow.playstation.com/app/...` bundle under Playwright and drive its
own cloud-player launch logic against a local broker emulator.

This does **not** start a real stream or render frames, but it does prove that we
can execute and observe a meaningful part of Sony's real launch orchestration on
this machine.

## Command

```bash
npm run broker:shell-harness -- --headless true
```

The harness will:

1. ensure a broker is reachable on `ws://localhost:1235/`
   - auto-spawns `broker:emulator` if needed
2. load the real app URL:
   - `https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/`
3. inject a minimal `window.gaikai.ipc` / `window.sce` shim
4. instantiate Sony's own `apollo/bridge/cloud-player/cloudPlayer` service in-page
5. bridge its plugin calls over WebSocket to the local broker
6. write a report and screenshot

## Artifacts

- `artifacts/broker/shell-harness-report.json`
- `artifacts/broker/shell-harness.png`
- `artifacts/broker/mock-broker-harness.jsonl`
- `artifacts/broker/mock-broker-harness-state.json`

## What was actually executed

The harness did **not** call our own hand-written launch sequence directly.
Instead, it used the real in-page Sony bundle modules:

- `apollo/bridge/cloud-player/cloudPlayer`
- `apollo/bridge/cloud-player/events/pluginEventMap`

with a broker-bridged plugin shim and minimal core shim.

That means the sequence below reflects the real `BrowserAPI` path inside Sony's
current public app bundle.

## Verified sequence captured on macOS

The harness successfully exercised these broker/plugin-stage calls in order:

1. `testConnection`
2. `setSettings`
3. `requestClientId`
4. `setTitleInfo`
5. `setAuthCodes`
6. `requestGame`

Observed outbound WebSocket envelopes in `shell-harness-report.json`:

```json
{"command":"testConnection","params":{}}
{"command":"setSettings","params":{...}}
{"command":"requestClientId","params":{}}
{"command":"setTitleInfo","params":{...}}
{"command":"setAuthCodes","params":{"gkCloudAuthCode":"bMoIAu","gkPs3AuthCode":"FVCR7y"}}
{"command":"requestGame","params":{"forceLogout":false}}
```

## Important details learned

### 1. The browser-path launch contract is real enough to exercise on Mac

Even without the Windows runtime, we can run Sony's real bundle logic and watch
what it tries to send over the broker boundary.

That gives us a concrete app-free way to keep learning launch semantics.

### 2. Browser-path `requestClientId` handling works with normalized event names

The harness had to translate mock broker event names into Sony's actual
`pluginEventMap` string values:

- `GOT_CLIENT_ID` -> `GotClientId`
- `PROCESS_END` -> `ProcessEnd`

Once that was done, Sony's in-page `BrowserAPI.requestClientId()` path advanced
correctly.

### 3. Browser-path `setTitleInfo` shape is now directly observed

The real bundle built and sent a `setTitleInfo` payload shaped like:

```json
{
  "entitlementId": "UP9000-CUSA08966_00-DAYSGONECOMPLETE",
  "productId": "",
  "titleId": "CUSA08966",
  "titleName": "Days Gone",
  "titleType": "PS4",
  "iconUri": "https://example.invalid/days-gone.png",
  "storeScheme": "pscloudsubs"
}
```

### 4. Browser-path `setAuthCodes` currently sends two codes, not three

Observed browser-path payload:

```json
{
  "gkCloudAuthCode": "bMoIAu",
  "gkPs3AuthCode": "FVCR7y"
}
```

No `streamServerAuthCode` appeared in this browser-path harness.

### 5. Browser-path `requestGame` currently reduces to `forceLogout`

Observed broker payload:

```json
{
  "forceLogout": false
}
```

### 6. Browser-path `setSettings` still looks console/browser-oriented

The observed `setSettings` payload from this harness used:

- `model: "orbis"`
- `platform: "orbis"`

not the PC-native values (`WINDOWS`, `PC`) seen in the PC-client code path.

That is a key limitation of this harness: it is currently exercising Sony's
**browser API path**, not the full **PCClientAPI** path.

## What this proves

This harness proves we can, on macOS:

- load Sony's real app bundle
- execute real cloud-player bundle logic
- exercise a meaningful broker-bound launch sequence
- capture the exact outbound command order and payloads
- do all of the above without the official Windows app

## What this does *not* prove

This harness does **not** prove:

- real game launch
- real broker/plugin parity with the Windows runtime
- real `streamServerClientId`
- real `streamServerAuthCode`
- real `startGame()` on the PC-native path
- real media/frame decode
- real controller-to-game input

## Remaining gap

The biggest remaining difference is:

- this harness currently exercises the **BrowserAPI** path
- the Windows app's full launch path still requires the **PCClientAPI** path

The missing Windows-native pieces remain:

- `streamServerClientId`
- `getStreamServerAuthCode()`
- `startGame()` on the PC-native contract
- any true player/media runtime behavior

## Best next step

Use the same harness idea to push closer to the PC-native path:

1. determine whether the public bundle exposes a require-able PC-client API module
2. instantiate or patch that path directly in-page if possible
3. extend the bridge plugin for any extra PC-native methods
4. capture whether the PC path adds:
   - `streamServerAuthCode`
   - `startGame`
   - different `setSettings` values (`WINDOWS` / `PC`)

Even if that still falls short of real streaming, it would narrow the remaining
native-only gap substantially.
