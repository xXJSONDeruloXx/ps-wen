# Mac shell harness against local broker emulator — 2026-03-30

## Summary

On macOS, without the official Windows app installed, we were still able to run
Sony's real `psnow.playstation.com/app/...` bundle under Playwright and drive its
own cloud-player launch logic against a local broker emulator.

This now covers **two** real bundle paths:

- the in-page **BrowserAPI** path
- the require-able **PCClientAPI** path (`apollo/bridge/cloud-player/api/pc`)

This does **not** start a real stream or render frames, but it does prove that we
can execute and observe a meaningful part of Sony's real launch orchestration on
this machine.

It also gives a useful interpretation for the earlier `orbis` values: `Orbis`
was Sony's internal PS4 codename, which matches the browser/console-flavored
`model/platform = orbis` path we observe here.

A saved screenshot artifact exists, but it is still only the PlayStation Plus
shell/splash UI — **not** a real game frame:

- `artifacts/broker/shell-harness.png`

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
- the require-able PC module `apollo/bridge/cloud-player/api/pc`

with a broker-bridged plugin shim and minimal core shim.

That means the captured sequences below reflect real Sony bundle logic, not a
repo-invented fake call order.

## Verified sequences captured on macOS

### BrowserAPI path

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

### PCClientAPI path

The same harness can now also instantiate the require-able PC module and drive a
PC-native sequence on macOS.

Observed PC-side command flow included:

1. `setSettings` (PC/WINDOWS settings, no entitlement during `testConnection` mode)
2. `requestClientId`
3. `setSettings` again with staged auth codes during `testConnection`
4. `testConnection`
5. `setSettings` (PC/WINDOWS settings for launch mode)
6. `requestClientId`
7. `setSettings` again with staged auth codes, `streamServerAuthCode`, `apolloSessionId`, and `entitlementID`
8. `requestGame`
9. synthetic `GotLaunchSpec` from the emulator causes the real PC bundle to call `startGame`
10. emulator returns `sessionStart`, `VIDEO_START`, and `IS_STREAMING`
11. post-launch controller-routing hooks can now be exercised too:
    - `routeInputToClient`
    - `routeInputToPlayer`

So the PC path materially differs from BrowserAPI in several major ways:

- it uses **`WINDOWS` / `PC`** settings values
- it appears to fold auth staging back into **`setSettings`**, not a standalone
  broker `setAuthCodes` command
- it will escalate to a broker `startGame` call when the expected launch-spec
  event arrives
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

### 5. PCClientAPI path requests a third auth code: `streamServerAuthCode`

The PC harness directly exercised:

- `getCloudAuthCode()`
- `getPS3AuthCode()`
- `getStreamServerAuthCode()`

and then observed the PC path push those values back into a later
`setSettings` payload.

In the mock harness this appeared as nested auth-code objects such as:

```json
{
  "gkCloudAuthCode": { "auth_code": "bMoIAu" },
  "gkPs3AuthCode": { "auth_code": "FVCR7y" },
  "streamServerAuthCode": { "auth_code": "mock-stream-..." }
}
```

That is the clearest app-free confirmation so far that the PC-native path really
wants a third stream-server auth stage.

### 6. Browser-path `requestGame` currently reduces to `forceLogout`

Observed broker payload:

```json
{
  "forceLogout": false
}
```

### 7. PCClientAPI can now be driven through `startGame()` on macOS

After teaching the emulator to emit synthetic:

- `GotLaunchSpec`
- `VIDEO_START`
- `IS_STREAMING`

we observed the real PC bundle issue a broker:

```json
{"command":"startGame","params":{}}
```

This is the first Mac-side app-free confirmation that the require-able PC bundle
path can be driven all the way through the **`startGame` broker boundary**.

Important limitation: this is still against the emulator, so it does **not**
prove real stream allocation or real rendered media.

### 8. Post-launch controller routing can also be exercised

After the synthetic PC `startGame` step, the harness can now call the real
PCClientAPI methods:

- `captureGamepad()` -> broker `routeInputToClient`
- `releaseGamepad()` -> broker `routeInputToPlayer`

Observed broker frames:

```json
{"command":"routeInputToClient","params":{}}
{"command":"routeInputToPlayer","params":{}}
```

This still does **not** mean actual controller input is reaching a real game.
It only proves that the real bundle's post-launch controller-routing control
commands can be exercised on macOS against the local broker boundary.

### 9. Browser-path and PC-path `setSettings` are clearly different

The observed **browser** `setSettings` payload used:

- `model: "orbis"`
- `platform: "orbis"`

The observed **PC** `setSettings` payload used:

- `model: "WINDOWS"`
- `platform: "PC"`

So the harness now directly confirms that Sony's bundle really carries two
meaningfully different launch contracts, not just one path with cosmetic naming.

### 10. `requestGame` evidence still needs careful wording

The PC path calls `plugin.requestGame(n)` where `n` is a boolean derived from
`forceLogout`.

Our bridge currently serializes that as:

```json
{ "forceLogout": false }
```

for broker logging convenience.

So this harness **does prove** that the PC bundle reduces the call to a boolean
at the plugin boundary, but it does **not yet prove** that the real localhost
broker wire format uses an object rather than a raw boolean.

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
- real media/frame decode
- real controller-to-game input

The harness **does** now prove the PC-native bundle can be driven through the
broker-visible `startGame()` boundary, but the screenshot and DOM evidence still
show no actual game frame.

## Remaining gap

The biggest remaining difference is now narrower than before.

The harness can exercise:

- **BrowserAPI** path end-to-end through `requestGame`
- **PCClientAPI** path through repeated `setSettings`, `requestClientId`,
  `getStreamServerAuthCode()`, and `requestGame`

The missing Windows-native pieces remain:

- a real `streamServerClientId` from the official runtime rather than our mock
- confirmation of the real wire format around PC `requestGame`
- confirmation that the real runtime emits the same post-`requestGame` launch-spec / start sequence we synthesized here
- real controller input propagation beyond routing commands
- any true player/media runtime behavior

Additional evidence pointing at a native-only media boundary:

- the saved screenshot remains the Plus splash/UI rather than a rendered game frame
- app-level `gkPlayer` handling on PC reacts to `VideoStart` primarily by flipping
  `isStreaming` state rather than revealing a browser `<video>`/`<canvas>` stream surface
- `PCClientAPI.showPlayer()` is implemented as:
  - dispatch `PSN_Event_StartGame`
  - call `plugin.startGame()`

Together, that strongly suggests the actual pixels are expected to come from a
native player/runtime rather than from a browser DOM media element on macOS.

## Best next step

Use the same harness idea to push closer to the PC-native path:

1. tighten the PC harness around the remaining native-only edge cases:
   - whether `requestGame` is really raw boolean on the broker wire
   - whether the real runtime's post-`requestGame` event sequence matches our synthetic `GotLaunchSpec -> startGame -> VIDEO_START -> IS_STREAMING` path
2. add explicit logging/serialization of the pre-broker plugin-call arguments so
   wire-format derivations are separated from actual observed broker frames
3. extend post-launch probing beyond routing to determine whether any further
   broker-visible input/control commands follow `routeInputToClient` / `routeInputToPlayer`
4. if a Windows runtime becomes available later, compare the real PC broker
   replies against these Mac-side PCClientAPI traces

Even without Windows, this already narrows the native-only gap substantially.
