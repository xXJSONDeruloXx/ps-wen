# Gaikai stream bootstrap probe — 2026-03-30

## Summary

With the already-solved NPSSO → bearer token → Kamaji session flow, we pushed the
current authenticated state as far as possible toward a real cloud-stream launch.

Result:

- **Kamaji auth/session remains fully usable**
- **Store/catalog/product lookup remains fully usable**
- **Gaikai preflight endpoints are live and callable from our standalone tooling**
- **PSN stream auth codes can be minted for `gaikai://local` redirects**
- **The final launch boundary is now clearly the native broker/plugin path**

In other words: browser/HTTP-only access can now reach nearly all of the
**control-plane bootstrap** but still cannot start a playable stream without the
native PlayStation Plus runtime.

---

## Goal

Determine how far the current authenticated state can progress toward a real
cloud-stream launch without relying on the official Windows app runtime.

Specifically:

1. Re-use the working NPSSO + Kamaji session flow
2. Probe likely Gaikai control-plane endpoints
3. Confirm whether any remaining HTTP endpoint could allocate/start a stream
4. Separate browser-accessible preflight from native-only launch work

---

## Inputs already available

These were already confirmed before this probe:

- NPSSO from Safari
- PSNow entitlements bearer token (`dc523cc2` client)
- Kamaji `JSESSIONID` + `WEBDUID`
- `onlineId = MetalCrabDip`
- `/user/profile` works
- `/user/entitlements` works (`597` entitlements)
- Safari/system-browser silent auth path for additional PSN clients

---

## What was tested

### 1. Re-established a fresh standalone Kamaji session

The same known-good path still works:

```http
POST https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/user/session
Content-Type: application/x-www-form-urlencoded
body: token=<urlencoded_access_token>
```

Result:

- `recognizedSession: false`
- `onlineId: MetalCrabDip`
- fresh `JSESSIONID`
- fresh `WEBDUID`

This remains sufficient for `/user/profile` and `/user/entitlements`.

---

### 2. Probed additional Kamaji and Swordfish user paths

Already-known working endpoints still worked:

- `GET /kamaji/api/pcnow/00_09_000/user/profile`
- `GET /kamaji/api/psnow/00_09_000/user/entitlements`
- `GET /kamaji/api/psnow/00_09_000/user/stores`
- `GET /kamaji/api/psnow/00_09_000/geo`
- `GET /kamaji/api/swordfish/00_09_000/user/stores`
- `GET /kamaji/api/swordfish/00_09_000/user/entitlements`
- `GET /kamaji/api/swordfish/00_09_000/geo`

Still 404 / not exposed at the guessed paths:

- `/user/subscription`
- `/user/config`
- `/user/queue`
- `/user/launch`
- `/user/game`
- `/user/recommendations`

Interpretation:

- Kamaji/Swordfish are real and live
- but blind sibling-path guessing is not surfacing a browser-callable stream allocator

---

### 3. Confirmed `config.cc.prod.gaikai.com` is real

The key breakthrough was method discovery:

```http
POST https://config.cc.prod.gaikai.com/v1/config
Content-Type: application/json
body: {}
```

Response: **200**

Returned JSON contained a base64-encoded config blob. Decoding it yielded:

```json
{
  "coreParams": {},
  "productConfigs": {
    "logEndpoint": "https://client.cc.prod.gaikai.com/v1/logs",
    "crashEndpoint": "https://client.cc.prod.gaikai.com/v1/dump",
    "eventEndpoint": "https://client.cc.prod.gaikai.com/v1/events"
  },
  "pixelClockConfigs": {}
}
```

Important conclusion:

- `config.cc` is real, but the currently recovered config is **telemetry/control metadata only**
- it did **not** reveal a stream allocator or queue endpoint

---

### 4. Confirmed Gaikai client-session minting

The current app bundle computes a `gkClientSessionIdUrl` pointing at:

```http
GET  https://cc.prod.gaikai.com/v1/apollo/id
POST https://cc.prod.gaikai.com/v1/apollo/id
```

Both were tested and returned **200**.

Representative response shape:

```json
{
  "apolloId": "1774876133...",
  "clientSessionId": "1774876133..."
}
```

This proves the standalone flow can mint the same Gaikai-side app/session ID that
Apollo expects.

---

### 5. Confirmed Gaikai event/log endpoints accept authenticated traffic

From the bundle, Apollo dispatches Gaikai events to:

- `POST https://client.cc.prod.gaikai.com/v1/events`
- `POST https://client.cc.prod.gaikai.com/v1/logs`

It uses these headers:

- `X-Gaikai-ClientSessionId: <clientSessionId>`
- `X-Access-Token: <bearer>`
- `X-NP-Env: np`
- `Content-Type: application/json`
- `Accept: application/json`

Replaying that pattern worked:

- `/v1/events` → **200**
- `/v1/logs` → **200**

Without a session ID, those endpoints return:

```json
{"description":"require sessionID or apolloID"}
```

So the Gaikai side is definitely active and expects Apollo-issued session context.

---

### 6. Confirmed PSN stream auth-code minting for `gaikai://local`

The bundle shows the launcher asks PSN for auth codes before calling the plugin.

Using the recovered parameters, we confirmed these `authorize` requests work in
standalone HTTP replay:

#### Cloud/Gaikai auth code

```text
client_id    = 7bdba4ee-43dc-47e9-b3de-f72c95cb5010
response_type= code
redirect_uri = gaikai://local
scope        = kamaji:commerce_native versa:user_update_entitlements_first_play versa:user_get_devices
```

Also worked with the slightly broader PS4-style scope including `kamaji:lists`.

#### PS3 auth code

```text
client_id    = 95505df0-0bd8-444a-81b8-8f420c990ca6
response_type= code
redirect_uri = gaikai://local
scope        = kamaji:commerce_native
```

Response pattern:

```text
302 -> https://auth.api.sonyentertainmentnetwork.com/mobile-success.jsp?targetUrl=gaikai://local?code=...
```

Meaning:

- the PSN side will mint the expected launch auth codes for the Gaikai/local-client path
- the browser/HTTP side is not blocked from obtaining them

---

### 7. Confirmed real title/product resolution for launch candidates

The store container API still resolves real playable products.

Example:

- category: `STORE-MSF192018-APOLLOMUSTPLAY`
- product: `UP9000-CUSA08966_00-DAYSGONECOMPLETE`
- title: **Days Gone**

Product detail payload exposed enough information to build most of Apollo's
`setTitleInfo()` object:

- `id`
- `name`
- `title_name`
- image/icon URL
- entitlement ID via `default_sku.entitlements[0].id`

Example derived values:

```json
{
  "id": "UP9000-CUSA08966_00-DAYSGONECOMPLETE",
  "titleName": "Days Gone",
  "entitlementId": "UP9000-CUSA08966_00-DAYSGONECOMPLETE",
  "iconUri": "https://vulcan.dl.playstation.net/...png"
}
```

The bundle's `buildTitleInfoData()` additionally expects/derives:

- `titleId` (parsed from product ID)
- `titleType` (`PS4` / `PS3`)
- `storeScheme` (`pscloudsubs`)
- optional `gamebootparam`
- optional `postPlayUri`

So we can now reconstruct most of the title-info envelope for a launchable title.

---

## What the bundle reveals about the real launch sequence

The current `apollo.js` bundle makes the remaining boundary much clearer.

PC/native launch sequence:

1. `setSettings(...)`
2. `requestClientId()`
3. `setTitleInfo(...)`
4. `getCloudAuthCode()`
5. `getPS3AuthCode()`
6. `getStreamServerAuthCode()`
7. `setAuthCodes(...)`
8. `requestGame(...)`
9. `startGame()`

Important details from the bundle:

- `requestGame()` is a **plugin call**, not a browser HTTP fetch
- `startGame()` is a **plugin call**, not a browser HTTP fetch
- PC flow requires a third auth path:
  - `getStreamServerAuthCode(this.streamServerClientId, "streamServer")`
- `streamServerClientId` is populated by the native `requestClientId()` event path

That means the last missing launch pieces are not just “one more hidden HTTP route”.
They are tied to the **native PlayStation Plus plugin/broker runtime**.

---

## New concrete boundary

### What works without the native app

Standalone/browser/HTTP flow can now do all of the following:

- get NPSSO
- mint bearer tokens
- establish Kamaji authenticated sessions
- query profile and entitlements
- browse/store-resolve real cloud titles
- mint Gaikai `clientSessionId` / `apolloId`
- post Gaikai events/logs with valid session headers
- mint PSN auth codes for `gaikai://local`

### What still requires the native app

Standalone flow still cannot do these final launch actions:

- obtain the plugin-provided `streamServerClientId`
- invoke native `requestClientId`
- invoke native `setSettings`
- invoke native `setAuthCodes`
- invoke native `requestGame`
- invoke native `startGame`

So the current hard boundary is now:

> **Gaikai/Kamaji/PSN browser-accessible preflight is largely solved; actual stream launch remains native broker/plugin mediated.**

---

## Practical conclusion

We are no longer blocked on auth, store lookup, or Gaikai session bootstrap.

We are now blocked on the **native launch contract**:

- broker/plugin commands
- `requestClientId` payloads
- `streamServerClientId`
- native `requestGame` / `startGame` execution path

That is a much narrower and better-defined problem than before.

---

## Best next step

Highest-value next implementation work is now:

1. add `broker send <command> [payload]` to `psn-direct-cli.ts`
2. observe/replay:
   - `requestClientId`
   - `setSettings`
   - `setAuthCodes`
   - `requestGame`
   - `startGame`
3. capture the event payload that contains `streamServerClientId`

If that succeeds on a machine with the official app runtime available, the next
remaining gap should be small enough to test a genuine launch attempt.
