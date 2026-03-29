# Auth summary baseline — 2026-03-29

## Artifacts summarized

- `artifacts/auth/playstation-storage-state.json`
- `artifacts/auth/manual-login-dump.json`
- generated summary: `artifacts/auth/playstation-auth-summary.json`

## Direct observations

- The captured browser state was **not** a successful signed-in state.
- The summary classified the capture as:
  - `currentUrl`: `https://my.account.sony.com/sonyacct/signin/`
  - `onSigninSurface`: `true`
  - `likelySignedIn`: `false`
- Even on the sign-in surface, Sony sets several cookies and storage keys that look security- or session-related. That means raw cookie presence alone is **not** a sufficient completion signal.

## Useful low-level findings without exposing values

### Cookie domains observed
- `.playstation.com`
- `.sony.com`
- `my.account.sony.com`
- `.my.account.sony.com`

### Auth-like cookie names observed on the sign-in surface
- `KP_uIDz`
- `KP_uIDz-ssn`
- `akacd_darksaber_PRC`
- `bm_lso`

### Storage keys observed on `https://my.account.sony.com`
Local storage:
- `!telemetry-web!identifier-session-id`
- `!telemetry-web!identifier-short-term-id`
- `__ls_config_flags`
- `ak_a`
- `ak_ax`
- two opaque-looking app keys

Session storage:
- `TAB_ID`
- `ak_bm_tab_id`

## What changed

- The repo now has a redacted auth summary path that is safe to inspect and document.
- The headed capture helper now needs to stay alive until the browser lands off the sign-in surface on a known post-login host.

## Next step

Run the headed helper again using the user-provided `my.account.sony.com/sonyacct/signin/...` entry URL and complete login manually.
