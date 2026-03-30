# Local mock broker emulator — 2026-03-30

## Summary

Added a local PlayStation Plus broker emulator that listens on the same loopback
endpoint observed in the Windows client:

- `ws://localhost:1235/`

This does **not** replace the real native streaming/plugin runtime, but it does
remove the need for the official app when the goal is to:

- verify WebSocket broker connectivity
- capture exact outbound broker envelopes from our tooling
- exercise `broker send` against a controlled target
- iterate on likely command/reply shapes without needing a live Windows runtime

## New command

```bash
npm run broker:emulator
```

Optional flags:

```bash
npm run broker:emulator -- --host localhost --port 1235
npm run broker:emulator -- --out artifacts/broker/mock-broker-session.jsonl \
  --state-out artifacts/broker/mock-broker-state.json
npm run broker:emulator -- --gk-client-id <id> --ps3-client-id <id> --stream-client-id <id>
```

## Artifacts

Default outputs:

- `artifacts/broker/mock-broker-session.jsonl`
- `artifacts/broker/mock-broker-state.json`

The JSONL file records inbound/outbound frames and lifecycle events.
The JSON state file stores the latest mocked broker state, including:

- mock client IDs
- command counts
- last `setSettings` payload
- last `setAuthCodes` payload
- last `setTitleInfo` payload
- last `requestGame` payload

## Mocked command coverage

The emulator currently accepts and responds to at least:

- `testConnection`
- `requestClientId`
- `setSettings`
- `setAuthCodes`
- `setTitleInfo`
- `requestGame`
- `startGame`
- `stop`
- `isStreaming`
- `isQueued`
- `getVersion`

Unknown commands currently receive a generic mocked success envelope so the
caller can keep progressing while we learn more.

## Mocked events / reply style

The emulator currently emits plausible JSON text frames such as:

- `GOT_CLIENT_ID`
- `PROCESS_END`
- `launchResponse`
- `sessionStart`

For `requestClientId`, it emits mocked values for:

- `gkClientId`
- `ps3GKClientID`
- `streamServerClientId`

This is intentionally evidence-led rather than arbitrary: these field names come
from the current public `apollo.js` PC-client path.

## Probe fix

While validating the emulator, the older reachability probe turned out to be too
optimistic about using `fetch()` for WebSocket upgrade detection. A valid
`101 Switching Protocols` can surface there as a network error.

That probe is now implemented with a raw TCP HTTP-upgrade check instead, so:

```bash
npm run api:psn-direct -- broker
```

correctly reports the local mock broker as reachable.

## Verified smoke

Confirmed locally:

```bash
npm run broker:emulator
npm run api:psn-direct -- broker
npm run api:psn-direct -- broker send requestClientId --wait-ms 500 --json
npm run api:psn-direct -- broker send setSettings '{"apolloSessionId":"mock-session","entitlementID":"UP9000-CUSA08966_00-DAYSGONECOMPLETE","platform":"PC","model":"WINDOWS"}' --wait-ms 500 --json
npm run api:psn-direct -- broker send testConnection --wait-ms 500 --json
```

Observed:

- reachability probe succeeds
- `requestClientId` returns mocked `GOT_CLIENT_ID` + `PROCESS_END`
- `setSettings` returns mocked success + `PROCESS_END`
- `testConnection` returns mocked success + `PROCESS_END`
- state/log artifacts are written as expected

## Practical value

This emulator does **not** prove the real broker protocol is solved.

What it *does* provide is a concrete no-official-app loop for:

1. iterating on our own broker client tooling
2. collecting exact outbound envelopes from future shell experiments
3. narrowing command/reply assumptions before the next live Windows-runtime pass

## Remaining limitation

Actual cloud-stream launch still requires the missing native contract details,
most importantly:

- real `requestClientId` event payloads from the official runtime
- confirmation of whether auth staging is direct `setAuthCodes` or folded into `setSettings`
- the real `requestGame` / `startGame` orchestration boundary
- anything behind the actual streaming plugin/runtime that the mock cannot emulate
