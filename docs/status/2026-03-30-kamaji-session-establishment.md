# Kamaji session establishment investigation — 2026-03-30

## Goal

Determine whether a fresh Kamaji JSESSIONID can be established from scratch
using only the on-disk NPSSO, without launching the PlayStation Plus app.

## Result

**Yes — confirmed working.**  A guest Kamaji session can be established
standalone.  The fully authenticated (recognized) session still requires one
additional step we have not yet traced.

---

## What we tried before finding the answer

### Failed attempts (all returned `0x0005 Session Expired`)

| Endpoint | Body variants tried |
|---|---|
| `POST /kamaji/api/psnow/00_09_000/user` | JSON `{code, redirect_uri}`, form-encoded, `{access_token}`, `{npsso}`, empty |
| `POST /kamaji/api/pcnow/00_09_000/user` | Same |
| `GET /kamaji/api/psnow/00_09_000/user?npsso=...` | Query param variants |
| `POST /kamaji/api/psnow/00_09_000/session` | → 404 |

Tried with every combination of:
- Bearer token in `Authorization` header
- `KP_uIDz` cookie
- `WEBDUID` cookie
- `npsso` cookie
- Akamai cookies
- Auth code in body
- Access token in body

All returned `0x0005 Session Expired`.

### Key wrong assumption

We were posting to `/kamaji/api/psnow/00_09_000/user` (or `/pcnow/...user`).
The actual session endpoint is `/kamaji/api/pcnow/00_09_000/user/**session**`.
The `/user` path is for reading an already-established session; `/user/session`
is for creating one.

---

## How we found it — Playwright intercept

Since the GrandCentral SDK (`grandcentral.js`, 534KB, fully obfuscated) makes
the session call and we couldn't find the endpoint from static analysis, we
used a Playwright browser (`scripts/auth/intercept-kamaji-session.ts`) to:

1. Inject the NPSSO cookie into a Chromium context
2. Navigate to the live PSNow app URL
3. Route-intercept every request matching `playstation|sony|gaikai`
4. Let the GrandCentral SDK run its normal startup flow

The interceptor captured exactly 4 requests:

| # | Method | URL | Status |
|---|---|---|---|
| 1 | GET | `ca.account.sony.com/api/v1/oauth/authorize?...client_id=bc6b0777...` | 200 |
| 2 | GET | `ca.account.sony.com/api/v1/oauth/authorize?...` (second call) | 200 |
| 3 | **POST** | `psnow.playstation.com/kamaji/api/pcnow/00_09_000/user/session` | **200** |
| 4 | GET | `ca.account.sony.com/api/v1/oauth/authorize?...` (from manual `createAuthCodeSession()` call) | 200 |

---

## The session endpoint — full spec

### Request

```
POST https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/user/session
Content-Type: application/x-www-form-urlencoded
Accept: */*
Origin: https://psnow.playstation.com
Referer: https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/

country_code=US&language_code=en&date_of_birth=1981-01-01
```

**No `Authorization` header.**  
**No auth code in the body.**  
Auth rides the Akamai bot-management cookies (`_abck`, `bm_sz`) seeded by any
prior request to `ca.account.sony.com`.

### Akamai seeding

Any GET to the OAuth authorize endpoint seeds the Akamai cookies even on a 403
response.  Our flow:

```
GET https://ca.account.sony.com/api/v1/oauth/authorize?...
Cookie: npsso=<NPSSO>
→ 403 (rate-limited direct fetch)  BUT  Set-Cookie: bm_sz=...  _abck=...
```

The `_abck` and `bm_sz` values from the 403 are accepted by the `/user/session`
endpoint.

### Response

```json
HTTP 200
Set-Cookie: JSESSIONID=<32-hex>-n3; Path=/; HttpOnly
Set-Cookie: WEBDUID=<80-hex>; Path=/kamaji/api/pcnow/00_09_000/user; Expires=...

{
  "header": { "status_code": "0x0000", "message_key": "success" },
  "data": {
    "timestamp": "2026-03-30T02:13:47Z",
    "country": "US",
    "language": "en",
    "account_type": 0,
    "age": 45,
    "entitlement_revision_id": 0,
    "currencies": [{ "code": "USD", "symbol": "$", ... }],
    "recognizedSession": false,
    "accountId": null,
    "onlineId": null,
    "sessionUrl": "https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/"
  }
}
```

### Key fields

| Field | Value | Notes |
|---|---|---|
| `sessionUrl` | `https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/` | Base for all subsequent Kamaji calls |
| `recognizedSession` | `false` | Guest session — no account linkage yet |
| `age` | `45` | Derived server-side from the `date_of_birth` we sent |
| `accountId` | `null` | Not populated until session is recognized |
| `onlineId` | `null` | Not populated until session is recognized |
| JSESSIONID | Set-Cookie | The session token for subsequent requests |
| WEBDUID | Set-Cookie | Device-unique session identifier |

---

## date_of_birth source

The POST body requires a real date of birth matching the Sony account.  In the
Playwright intercept the value `1981-01-01` was observed — this is the account
holder's actual DOB yielding `age: 45` at 2026-03-30.

The GrandCentral SDK obtains the DOB from somewhere before making the POST.
Likely sources (not yet confirmed):

1. The OAuth `grc-response.html` page embeds it in the postMessage payload
2. An IAS aggregation API call (`ias.api.playstation.com/api/accountsAggregation`)
3. IndexedDB at `my.account.sony.com` (observed in the app profile)

The `--dob` flag on `npm run api:psn-direct -- session` accepts any DOB.  If
the wrong value is supplied, the session still creates (the server does not
validate it against the account for the guest session), but the `age` field
will be wrong and recognition may fail.

---

## What works with a guest session (recognizedSession=false)

| Endpoint | Works? | Notes |
|---|---|---|
| `GET /kamaji/api/psnow/00_09_000/geo` | ✓ | Region, timezone, postal range |
| `GET /kamaji/api/psnow/00_09_000/user/stores` | ✓ | Full store/catalog URL map |
| `GET /kamaji/api/psnow/00_09_000/user` | ✗ 401 | Needs recognized session |
| `GET /kamaji/api/psnow/00_09_000/user/entitlements` | ✗ 401 | Needs recognized session |
| `GET /kamaji/api/psnow/00_09_000/user/subscription` | ✗ 401 | Needs recognized session |

---

## /user/stores — full response

Live data returned from a guest session (2026-03-30):

```json
{
  "base_url":   "https://psnow.playstation.com/store/api/pcnow/00_09_000/container/US/en/19/STORE-MSF192018-APOLLOROOT",
  "search_url": "https://psnow.playstation.com/store/api/pcnow/00_09_000/search/US/en/19/",
  "root_url":   "https://psnow.playstation.com/store/api/pcnow/00_09_000/container/US/en/19/",
  "tumbler_url":"https://psnow.playstation.com/store/api/pcnow/00_09_000/tumbler/US/en/19/",
  "external_signin_url": "https://account.sonyentertainmentnetwork.com/external/auth/login.action?request_locale=en_US",
  "psplus_url": "https://psnow.playstation.com/store/api/pcnow/00_09_000/container/US/en/19/IP9101-NPIA90005_01--STORE",
  "events_env": "https://psnow.playstation.com/",
  "rec_url":    "https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/user/recommendations",
  "psPlusWelcomeMatUrl": "https://psnow.playstation.com/store/api/pcnow/00_09_000/container/US/en/19/STORE-MSF192018-WELCOMEMAT",
  "psPlusDealsUrl":      "https://psnow.playstation.com/store/api/pcnow/00_09_000/container/US/en/19/STORE-MSF192018-PLUSDEALS"
}
```

New endpoints discovered:

- `store/api/pcnow/00_09_000/container/US/en/19/<ID>` — catalog container browser
- `store/api/pcnow/00_09_000/search/US/en/19/` — game search
- `store/api/pcnow/00_09_000/tumbler/US/en/19/` — unknown (likely featured/tumbler carousel)
- `kamaji/api/pcnow/00_09_000/user/recommendations` — personalized recs

---

## App config — complete clientIDMap

Extracted from the live `<meta name="apollo/config/environment">` tag at the
app URL `https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/`:

| Code name   | client_id                            | Notes |
|-------------|--------------------------------------|-------|
| gaikai      | 7bdba4ee-43dc-47e9-b3de-f72c95cb5010 | Gaikai PS5 cloud stream |
| pichu       | 95505df0-0bd8-444a-81b8-8f420c990ca6 | PS3/legacy Gaikai stream |
| pikachu     | 52b0e92a-e131-4940-86f5-5d4447c73dd1 | SSO-only |
| browser     | df10acc0-0a9c-4854-96c9-59b669bbd3bf | Browser/pachirisu/luxray — **new** |
| thundurus   | bc6b0777-abb5-40da-92ca-e133cf18e989 | Commerce (pcClientParams) |
| kratos      | bc6b0777-abb5-40da-92ca-e133cf18e989 | Same as thundurus |
| charmander  | dc523cc2-b51b-4190-bff0-3397c06871b3 | Implicit grant / entitlements |
| pachirisu   | df10acc0-0a9c-4854-96c9-59b669bbd3bf | Same as browser |
| luxray      | df10acc0-0a9c-4854-96c9-59b669bbd3bf | Same as browser |
| dedenne     | (empty)                              | — |
| zapdos      | 1045850d-ecb6-4169-a0bb-7ceec86dd74c | **new** |
| jolteon     | 1045850d-ecb6-4169-a0bb-7ceec86dd74c | Same as zapdos |

Two new client IDs not previously seen in the browser cache:
- `df10acc0` (browser/pachirisu/luxray)
- `1045850d` (zapdos/jolteon)

---

## GrandCentral SDK

The session establishment logic lives in the GrandCentral SDK loaded at:
`https://psnow.playstation.com/ELdff8h5I1y7/PcdO1O/lpRglg/OOEmtSVNV7Jzrz/exMUAS0/C00Gcx/stYyoB`

Saved to `artifacts/public/psnow-app/grandcentral.js` (533,960 bytes).

The file is fully obfuscated with no plaintext API paths or method names
surviving — confirmed by systematic scan.  All string literals are encoded in
the obfuscator's string array.  Reverse engineering would require running a
de-obfuscator pass.

The `getSessionWithAccessToken` method name was found in the V8 bytecode cache
(`%APPDATA%\playstation-now\Code Cache\js\e29f9427e5992b4a_0`) alongside
`authService.getInstance().getSSO()`, `apiQueryParams.duid`, `npsso`, and
`dateOfBirth` — confirming the SDK has a path that uses the NPSSO + DOB to
establish a session, consistent with what we observed.

---

## Session recognition — what's still missing

The Playwright interceptor captured only 3 GrandCentral-driven requests (2x
OAuth GETs + 1x session POST).  All returned `recognizedSession: false`.
Additional recognition calls were either:

- Not captured (our route filter missed them)
- Made to a hostname not covered by the intercept regex
- Made after the 8-second wait window closed

**Next step:** re-run the interceptor with a wider net (all Sony/PlayStation
hostnames, no regex filter) and a longer wait window to catch the recognition
calls.  The broad intercept script is already updated in
`scripts/auth/intercept-kamaji-session.ts`.

The likely recognition endpoint based on the code cache context:
- `POST /kamaji/api/pcnow/00_09_000/user` with the auth code — but this
  returned 401 in direct testing, suggesting the recognition POST requires
  the browser cookies set by the grc-response.html page execution context.

---

## New files and commands

### `scripts/lib/psn-auth.ts` additions

- `establishKamajiSession(npsso, dateOfBirth, countryCode, languageCode)`  
  → `KamajiSessionResult` with JSESSIONID, WEBDUID, sessionUrl, age, etc.
- `queryKamajiUserStores(token, jsessionId, webduid)`  
  → `KamajiStoresResult` with all store/catalog/search/recs URLs

### `scripts/api/psn-direct-cli.ts` new commands

```bash
npm run api:psn-direct -- session [--dob YYYY-MM-DD] [--country US] [--lang en] [--json]
  # Establish a fresh Kamaji JSESSIONID from NPSSO alone
  # Writes artifacts/auth/psn-kamaji-session.json

npm run api:psn-direct -- stores [--dob YYYY-MM-DD] [--json]
  # Fetch live store/catalog URL map (works with guest session)
```

### `scripts/auth/intercept-kamaji-session.ts`

Playwright-based network interceptor.  Injects NPSSO cookie into Chromium,
navigates to the PSNow app, captures all outgoing requests.  This is how the
`/user/session` endpoint was discovered.

```bash
npm run auth:intercept-session
```

---

## What the CLI can now do without the app running

| Command | What it returns |
|---|---|
| `token` | Fresh bearer token from NPSSO (20 min validity) |
| `geo` | Live region, timezone, postal range |
| `session` | Fresh JSESSIONID + WEBDUID + sessionUrl + country + age |
| `stores` | Full store/catalog/search/PS-Plus URL map |
| `session-probe` | Kamaji session health with guidance |
| `broker` | localhost:1235 reachability |
| `status` | All of the above in one shot |

---

## Next

1. **Wider Playwright intercept** — re-run `auth:intercept-session` with the
   broader route filter to catch the session recognition calls the SDK makes
   after the initial POST.

2. **DOB source** — determine how the GrandCentral SDK gets the DOB (IAS API,
   OAuth payload, IndexedDB).  Once known, remove the `--dob` flag requirement.

3. **Probe store catalog** — the `root_url` and `base_url` from `/user/stores`
   are next natural targets.  They may return the game catalog without a
   recognized session.

4. **Recommendations endpoint** — `kamaji/api/pcnow/00_09_000/user/recommendations`
   — try with the guest JSESSIONID.
