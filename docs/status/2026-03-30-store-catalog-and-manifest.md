# Kamaji store catalog and app manifest — 2026-03-30

## Summary

With a guest Kamaji session (recognizedSession=false) established from the
NPSSO alone, the following APIs return live data:

- **App manifest** — version info, all env URLs, PS Plus deep-link category IDs
- **Store catalog** — full game category tree, browseable without auth
- **PS Plus subscription store** — product metadata, age-gating containers
- **PS Plus deals** — 497 games, 113 bundles, 72 add-ons, 1 avatar (live count)

---

## App manifest

```
GET https://psnow.playstation.com/exp-manifest/ms/pc/1.0/apollo/application/json/manifest
→ 200 (no auth required)
```

Response:
```json
{
  "version": "2.5.0",
  "app": {
    "apollo": {
      "default": "https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/",
      "np":      "https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/",
      "e1-np":   "https://psnow.e1-np.playstation.com/develop/",
      "mgmt":    "https://psnow.mgmt.playstation.com/release/"
    }
  },
  "region": {
    "SIEA": { "autorenewPSPlus": {
      "OnlineMultiplayer": "plusdestination:browse?categoryId=807a2c62-9e7f-471d-9c7a-71e682199c8b",
      "FreeMonthlyGames":  "plusdestination:browse?categoryId=ce915d22-2f07-429d-8f66-346f609d04d1",
      "Discounts":         "plusdestination:browse?categoryId=8514ed18-7d3d-47d6-9a3c-b619931721c8",
      "ExclusivePacks":    "plusdestination:browse?categoryId=2d90df11-7d17-4879-9ec0-2e1233c68c84"
    }},
    "SIEE": { "autorenewPSPlus": { ... } },
    "SIEJA": { "autorenewPSPlus": { ... } }
  },
  "platform": [ { "type": "ps4", "regions": [...all supported locales...] } ]
}
```

Notable: manifest version `2.5.0` vs. running app version `2.2.0` — there is a
newer version of the app available.

---

## Store catalog API

Base path: `https://psnow.playstation.com/store/api/pcnow/00_09_000/container/US/en/19/`

### Auth required

No `Authorization` header is needed.  The JSESSIONID cookie is sufficient.
Even a guest session works.

### Root catalog — APOLLOROOT

```
GET .../container/US/en/19/STORE-MSF192018-APOLLOROOT
→ 200
```

Returns all top-level game categories:

| Container ID | Name |
|---|---|
| STORE-MSF192018-APOLLOMUSTPLAY | Must Play |
| STORE-MSF192018-APOLLO_ACTION | Action |
| STORE-MSF192018-APOLLOSPORTS000G | Sports |
| STORE-MSF192018-APOLLO_ADVENTURE | Adventure |
| STORE-MSF192018-APOLLO_SHOOTERS | Shooter |
| STORE-MSF192018-APOLLORACING000G | Driving & Racing |
| STORE-MSF192018-APOLLO_RPG | RPG |
| STORE-MSF192018-APOLLOPUZZLEGAME | Puzzle |
| STORE-MSF192018-APOLLOKIDSFAMILY | Kids & Family |
| STORE-MSF192018-APOLLOFIGHTING0G | Fighting |
| STORE-MSF192018-APOLLOSIMULATION | Simulation |
| STORE-MSF192018-APOLLOSTRATEGY0G | Strategy |
| STORE-MSF192018-APOLLOREMASTERS | Remasters |
| STORE-MSF192018-APOLLOPLAYSTATN | PSP, PlayStation and PS2 |
| STORE-MSF192018-APOLLOPS3GAMES | PS3 |
| STORE-MSF192018-APOLLOAB | A - B (alphabetical) |
| STORE-MSF192018-APOLLOCD | C - D |
| STORE-MSF192018-APOLLOEG | E - G |
| STORE-MSF192018-APOLLOHL | H - L |
| STORE-MSF192018-APOLLOMO | M - O |
| ... | (P-Z ranges) |

Each category link contains `id`, `name`, `revision`, `timestamp`, `url` fields.

### PS Plus deals

```
GET .../container/US/en/19/STORE-MSF192018-PLUSDEALS
→ 200
```

Live content counts (2026-03-30):

| Type | Count |
|---|---|
| Games | **497** |
| Bundles | 113 |
| Add-Ons | 72 |
| Avatars | 1 |

### PS Plus subscription store

```
GET .../container/US/en/19/IP9101-NPIA90005_01--STORE
→ 200
```

Returns product metadata including CDN image URLs on
`apollo2.dl.playstation.net` and age-gating containers
(`IP9101-NPIA90005_01-OVERAGE`, `IP9101-NPIA90005_01-UNDERAGE`).

### Welcome Mat

```
GET .../container/US/en/19/STORE-MSF192018-WELCOMEMAT
→ 200
```

Contains `STORE-MSF192018-OPTIMUS` — the "PS Plus Welcome Mat Horizontal"
template container (template id 4401).

### Search

```
GET .../search/US/en/19/?searchTerm=<term>&size=<n>
```

The search endpoint returns 404 "Missing search term" for both `?q=` and
`?searchTerm=` parameter names.  Correct param name not yet confirmed.
Alternatively, search may require a POST or the session to be recognized.

---

## GrandCentral SDK — session recognition blocker

The broader Playwright intercept (16 requests total) revealed the full SDK
startup sequence:

### Sequence

1. `GET /app/2.2.0/133/5cdcc037d/` — app HTML, seeds initial `_abck`
2. `GET /ELdff8h5I1y7/...` — loads GC SDK (534KB) from `psnow.playstation.com`
3. `POST /ELdff8h5I1y7/...` (×3) — Akamai Bot Manager sensor data  
   Body: `{"sensor_data":"3;0;1;<seqnum>;<pageId>;<fingerprint>;<events>..."}`  
   Response: `{"success": true}` (201) — each POST upgrades `_abck` validity
4. `GET /exp-manifest/ms/pc/1.0/apollo/application/json/manifest` — app manifest
5. `GET ca.account.sony.com/api/v1/oauth/authorize?...bc6b0777...` — get auth code
6. `GET ca.account.sony.com/ELdff8h5I1y7/...` → **403** ← **recognition blocker**
7. `POST /kamaji/api/pcnow/00_09_000/user/session` → 200 (guest JSESSIONID)
8. Steps 5–7 repeated once more (second init cycle)

### Why recognition fails in browser

Step 6 — the GC SDK tries to load itself from `ca.account.sony.com/ELdff8h5I1y7/...`
This is a cross-domain iframe pattern: the GC SDK on `psnow.playstation.com`
opens an iframe pointing to `ca.account.sony.com` which loads the GC SDK in
the Sony auth domain context.  This allows the grc-response.html page's
postMessage to be received by a trusted origin.

On `ca.account.sony.com`, Akamai returns 403 — the GC SDK URL is only served
from `psnow.playstation.com`.  In the native Electron app, the WebView has
special allowlist rules that permit this cross-domain load (confirmed in
`main.js` allowlist patterns).

**Result:** The recognition step (`recognizedSession=true`, `accountId` populated)
requires the native Electron WebView context.  It cannot be completed in a plain
browser via Playwright.

### The guest session boundary

| Needs recognized session | Works with guest session |
|---|---|
| `/user` | `/user/stores` |
| `/user/entitlements` | `/user/session` (creates it) |
| `/user/subscription` | `/geo` |
| `/user/config` | `/exp-manifest/...` (no session) |
| `/user/recommendations` | All `store/api/pcnow/...` catalog endpoints |

---

## Akamai Bot Manager — sensor POST pattern

The GC SDK URL (`/ELdff8h5I1y7/...`) is **dual-purpose**:
- `GET /ELdff8h5I1y7/...` from `psnow.playstation.com` → GC SDK JavaScript
- `POST /ELdff8h5I1y7/...` with `{"sensor_data":"..."}` → Akamai BM sensor

The sensor data format: `"<version>;<flags>;<pageFlags>;<seqNum>;<pageId>;<challenge>;<eventCounts>;<obfuscatedEvents>"`

Each POST returns `{"success": true}` (201) and updates the `_abck` cookie with
an incremented validity score.  Two to three POSTs are needed before the cookie
is accepted by the Kamaji session endpoint.

In our standalone session flow, the `_abck` from a 403 response (without the
full sensor upgrade cycle) is still accepted.  This is likely because the
Kamaji session endpoint has a lower bot-protection threshold than other Sony
endpoints.

---

## New artifacts

- `artifacts/api/kamaji-store-probe.json` — store catalog probe results
- `artifacts/auth/kamaji-session-intercept.json` — full 16-request intercept log

---

## What to do next

### Highest value (no new tooling needed)

1. **Fetch individual game category** — e.g. `STORE-MSF192018-APOLLOMUSTPLAY`
   to get the actual streaming game list with title IDs, images, descriptions.
2. **Search endpoint** — enumerate param names (`term`, `query`, `q`, `name`) to
   find the working search format.
3. **PS Plus category deep-links** — the category IDs from the manifest
   (`807a2c62-...`, `ce915d22-...`) may be browseable via the store container
   API as `categoryId` query params.

### Needs additional work

1. **Session recognition** — requires Electron WebView context or reverse
   engineering the `ca.account.sony.com/ELdff8h5I1y7/...` 403 blocker.
   Fastest path: launch the PS Plus app, wait for it to log in, then
   `session-probe` will show `session-active` and all `/user/*` endpoints open.
2. **Akamai full sensor upgrade** — implement the sensor_data POST sequence in
   Node.js to get a fully-validated `_abck`.  Required if the Kamaji session
   endpoint ever raises its bot-protection threshold.
