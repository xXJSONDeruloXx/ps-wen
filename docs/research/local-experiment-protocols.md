# Local experiment protocols

## 1. Public capability collection

Purpose:
- refresh first-party support/product snapshots
- confirm which official claims are still live

Steps:
1. `npm run research:public`
2. inspect `artifacts/official-capabilities.json`
3. run `npm run test:public`
4. promote meaningful changes into `docs/status/`

## 2. Official-login harness

Purpose:
- confirm an official Sony-controlled login flow can be automated locally without storing secrets in git
- preserve browser storage state for later allowed experiments

Prep:
1. copy `.env.example` to `.env`
2. fill `PSN_LOGIN_URL`, `PSN_EMAIL`, and `PSN_PASSWORD`
3. optionally set `PSN_POST_LOGIN_URL` to a page you expect to load after auth
4. run `npm run env:check`

Execution:
1. try the automated smoke first: `npm run test:psn-login`
2. if automation is brittle, use the headed/manual helper: `npm run auth:psn-headed`
   - optional: set `MANUAL_AUTH_WAIT_SECONDS=300` (or longer) to give yourself more time in the browser
3. watch for CAPTCHA / MFA / consent screens
4. if the run succeeds, inspect:
   - `artifacts/auth/playstation-storage-state.json`
   - `artifacts/auth/manual-login-dump.json`
   - `artifacts/auth/manual-login-final.png`
5. never commit the storage state or raw auth artifacts

Notes:
- this harness is intentionally conservative; it does not try to defeat anti-automation measures
- the headed helper is meant for user-assisted completion in an official browser flow
- if full login is not stable, record the exact blocker in a status note rather than hacking around it

## 3. Static client bundle inventory

Purpose:
- identify current client packaging, endpoint strings, and keyword hits without modifying the app

Steps:
1. obtain an official client bundle locally
2. run `npm run inspect:bundle -- /path/to/app.asar`
   or `npm run inspect:installer -- ~/Downloads/PlayStationPlus-12.5.0.exe` for a first-pass Windows installer metadata sweep
3. inspect JSON output under `artifacts/static/`
4. summarize any meaningful findings in docs, never commit the proprietary bundle itself

## 4. Network metadata capture

Purpose:
- capture local DNS/TLS/QUIC timing and endpoint clues while you use an official surface on your own account/device

Steps:
1. confirm the network interface (`ifconfig` if needed)
2. start capture: `CAPTURE_INTERFACE=en0 npm run capture:metadata`
3. exercise the official client during the capture window
4. summarize with `npm run summarize:metadata -- artifacts/network/<file>.pcap`
5. document observations at the metadata level only

## 5. Status note rule

Every experiment that changes our confidence should result in a markdown note under `docs/status/` with:
- date
- command(s) run
- artifact paths
- direct observations
- updated unknowns
