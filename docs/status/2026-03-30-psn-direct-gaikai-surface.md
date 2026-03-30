# `psn-direct` Gaikai + broker surface expansion — 2026-03-30

## Summary

The direct CLI now covers nearly all of the browser/HTTP-side stream preflight
surface plus a generic localhost broker replay path.

New verified command families:

- `broker send`
- `gaikai id`
- `gaikai config`
- `gaikai auth-code`
- `gaikai event`
- `gaikai log`
- `gaikai preflight`

This does **not** cross the final native launch boundary, but it makes the
remaining unknowns much narrower and more testable.

---

## Auth refresh needed first

The stored NPSSO had expired during this work.

Playwright could still log into the Store/web shell, but that did not leave a
usable `npsso` in the Playwright storage-state.

A fresh NPSSO was recovered via real Safari automation:

1. Open the standard PlayStation sign-in URL in Safari
2. Use `steer` to fill email / advance to password / submit
3. Verify Safari lands on the signed-in Store page
4. Open the PSNow OAuth URL with `prompt=none`
5. Safari redirects to `grc-response.html#access_token=...`
6. Navigate Safari to `https://ca.account.sony.com/`
7. Extract `document.cookie` via AppleScript
8. Parse out `npsso=...`
9. Patch `artifacts/auth/playstation-storage-state.json`

Verification after patch:

```text
npm run auth:extract-npsso
found: true
length: 64
```

---

## New CLI surface

### 1. Broker replay

`psn-direct-cli.ts` now supports:

```bash
npm run api:psn-direct -- broker send requestClientId --wait-ms 1500
npm run api:psn-direct -- broker send setSettings '{"apolloSessionId":"...","entitlementID":"..."}'
npm run api:psn-direct -- broker send --raw '{"command":"requestClientId","params":{}}'
```

Features:

- shorthand `{ command, params }` envelopes
- exact `--raw` frame replay
- optional `--target`
- inbound message capture
- close code / close reason reporting

Smoke-tested locally with no live broker:

- cleanly reports non-101 / connection failure
- no crash

---

### 2. Gaikai session / config / auth-code coverage

The CLI now exposes:

```bash
npm run api:psn-direct -- gaikai id
npm run api:psn-direct -- gaikai config
npm run api:psn-direct -- gaikai auth-code --kind cloud
npm run api:psn-direct -- gaikai auth-code --kind cloud-ps4
npm run api:psn-direct -- gaikai auth-code --kind ps3
npm run api:psn-direct -- gaikai auth-code --kind sso
npm run api:psn-direct -- gaikai event --preset app-load
npm run api:psn-direct -- gaikai log --message 'ps-wen gaikai smoke'
npm run api:psn-direct -- gaikai preflight --json
```

---

## Verified outputs

### `gaikai preflight`

Confirmed live output after auth refresh:

- fresh Kamaji token session
- `recognizedSession: false`
- `onlineId: MetalCrabDip`
- Gaikai `apolloId` / `clientSessionId`
- decoded config from `config.cc.prod.gaikai.com/v1/config`
- all four known `gaikai://local` auth-code variants:
  - `cloud`
  - `cloud-ps4`
  - `ps3`
  - `sso`

Representative output fields:

```json
{
  "kamajiSession": {
    "recognizedSession": false,
    "accountId": "0189c42a3cfbc4fa16a5ff4ae1621c03287b26daf3dac37ff233782a79c5482e",
    "onlineId": "MetalCrabDip"
  },
  "gaikai": {
    "apolloId": "17748782325VOJ7D...",
    "clientSessionId": "17748782325VOJ7D...",
    "configKeys": ["coreParams", "productConfigs", "pixelClockConfigs"]
  },
  "authCodes": {
    "cloud": { "code": "U3SScL" },
    "cloudPs4": { "code": "EssnhV" },
    "ps3": { "code": "ikPidE" },
    "sso": { "code": "vROS54" }
  }
}
```

### `gaikai event`

Verified:

- preset `app-load` event
- `POST https://client.cc.prod.gaikai.com/v1/events`
- status **200**

### `gaikai log`

Verified:

- simple info log payload
- `POST https://client.cc.prod.gaikai.com/v1/logs`
- status **200**

---

## What this means

The CLI now covers the following preflight stack end to end:

1. NPSSO
2. entitlements bearer token
3. authenticated Kamaji session
4. Gaikai `clientSessionId` / `apolloId`
5. Gaikai config fetch/decode
6. Gaikai event/log dispatch
7. PSN `gaikai://local` auth-code minting

That is effectively the full **browser/HTTP-side launch preflight**.

---

## Remaining boundary

Still not solved:

- live `requestClientId` broker reply
- `streamServerClientId`
- native `setSettings`
- native `setAuthCodes`
- native `requestGame`
- native `startGame`

So the remaining work is now very clearly:

> capture and replay the **native broker/plugin contract** against a live running PlayStation Plus app.

---

## Best next step

Use the new broker surface against a live app instance:

```bash
npm run api:psn-direct -- broker send requestClientId --wait-ms 3000 --json
npm run api:psn-direct -- broker send testConnection --wait-ms 3000 --json
```

Then move on to:

- `setSettings`
- `setAuthCodes`
- `requestGame`
- `startGame`

once the actual reply envelopes are captured.
