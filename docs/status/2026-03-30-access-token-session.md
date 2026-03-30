# Access-token Kamaji session — 2026-03-30

## Breakthrough

The missing authenticated session path is **not** `createAuthCodeSession()`.
That path times out in plain Chromium because the hidden auth iframe tries to
load the GrandCentral SDK from `ca.account.sony.com/ELdff...` and fails.

The working path is the lower-level GrandCentral method:

```js
GrandCentral.UserSessionService.prototype.createAccessTokenSession = function () {
  var url = this._hostUrl + 'user/session';
  return N.fetchAccessToken().then(function (token) {
    var headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    var body = g.createPostBody({ token: encodeURIComponent(token) });
    return new m('POST', url).open(headers, body);
  }).then(function (resp) {
    this.isActive = true;
    this.isGuest = false;
    this._setData(resp.response.data);
    return resp.response.header;
  });
}
```

Recovered directly from the live `GrandCentral.UserSessionService` prototype in
browser memory.

## Exact request

```
POST https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/user/session
Content-Type: application/x-www-form-urlencoded
Cookie: bm_sz=...; _abck=...; akacd_psnow-manifest=...

body: token=<urlencoded_access_token>
```

### Requirements

- NPSSO cookie (from `%APPDATA%\playstation-now\Cookies`)
- a freshly-minted bearer token from the `entitlements` client
- Akamai cookies seeded by any request to `ca.account.sony.com`

### No requirements

- no `Authorization: Bearer` header on the session POST
- no `code` in the body
- no `X-Alt-Referer` header
- no running Windows app

## Response

A successful access-token session returns:

- `JSESSIONID=<...>`
- `WEBDUID=<...>`
- body with non-null account identity fields

Observed response shape:

```json
{
  "header": { "status_code": "0x0000", "message_key": "success" },
  "data": {
    "country": "US",
    "language": "en",
    "account_type": 1,
    "age": 29,
    "recognizedSession": false,
    "contentRatingFlag": true,
    "accountId": "<non-null>",
    "onlineId": "<non-null>",
    "signInId": "<non-null>",
    "sessionUrl": "https://psnow.playstation.com/kamaji/api/pcnow/00_09_000/"
  }
}
```

## Important nuance

`recognizedSession` remains `false`, **but the session is still authenticated enough**
for the endpoints that matter:

| Endpoint | Result |
|---|---|
| `GET /kamaji/api/pcnow/00_09_000/user/profile` | ✅ 200 |
| `GET /kamaji/api/psnow/00_09_000/user/entitlements` | ✅ 200 |
| `GET /kamaji/api/psnow/00_09_000/user/stores` | ✅ 200 |
| `GET /kamaji/api/psnow/00_09_000/geo` | ✅ 200 |
| `GET /kamaji/api/pcnow/00_09_000/user` | 404 No Data Found |
| `GET /kamaji/api/psnow/00_09_000/user/subscription` | 404 No Data Found |
| `GET /kamaji/api/pcnow/00_09_000/user/recommendations` | 404 No Data Found |

So the meaningful auth problem is solved even though the session's internal
`recognizedSession` flag does not flip to true.

## Live validated CLI commands

```bash
npm run api:psn-direct -- session
npm run api:psn-direct -- profile
npm run api:psn-direct -- entitlements --limit 5
npm run api:psn-direct -- session-probe
```

Observed outputs:

- `session` → non-null accountId + onlineId + JSESSIONID + WEBDUID
- `profile` → onlineId, display name, avatar URLs
- `entitlements` → `597` total entitlements in the current account
- `session-probe` → `session-active`

## What changed in code

### `scripts/lib/psn-auth.ts`

Added:
- `seedAkamaiCookies(npsso)`
- `establishKamajiAccessTokenSession(npsso, accessToken)`
- `queryKamajiUserProfile(accessToken, jsessionId, webduid)`
- `queryKamajiUserEntitlements(accessToken, jsessionId, webduid)`

### `scripts/api/psn-direct-cli.ts`

Updated:
- `session` now defaults to `--mode token`
- `stores` supports `--mode token|guest`
- new `profile` command
- new `entitlements` command
- `session-probe` now tests the actual authenticated path (`profile` + `entitlements`)
  instead of the old stale-cookie `/user` probe

## What this means

The standalone CLI can now do all of the following **without the Windows app**:

1. Read NPSSO from disk
2. Exchange NPSSO for a fresh bearer token
3. Convert the bearer token into a live JSESSIONID/WEBDUID pair
4. Read the authenticated profile
5. Read the full entitlement inventory
6. Browse the catalog/store tree

That is the core auth/session hurdle for the OSS thin client's control-plane
side.  The remaining unknowns are now mostly around:

- subscription-specific endpoint shape (`/user/subscription` still 404)
- recommendations / personalization
- stream/session allocation requests
- broker commands and transport

## Next

1. Add artifact-writing for `profile` and `entitlements`
2. Sweep entitlement records into normalized product/title maps
3. Correlate entitlement IDs with store catalog product IDs
4. Probe for the real subscription endpoint path using the authenticated token session
5. Move on to stream/session allocation with the now-working auth/session base
