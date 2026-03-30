# ps-wen

Research repo for mapping the PlayStation Plus PC app, its control plane, native broker, and streaming transport surface toward an open-source thin-client implementation.

## Scope

This repo is for:
- mapping the PlayStation Plus PC app runtime, native broker, auth surface, and network behavior
- inventorying public JS assets, static bundles, and locally observed network metadata
- building tooling and an observation-backed prototype toward an OSS thin-client implementation
- documenting the streaming control-plane and transport surface as discovered through direct observation

## Current workstreams

1. **Evidence collection**: direct observation of installed app, network captures, auth surfaces, and public assets.
2. **Capability mapping**: confirm what the running client actually does on the wire during launch, stream, save, overlay, and quit flows.
3. **Client archaeology**: inventory official PC app bundles and public JS assets.
4. **Implementation**: build an OSS prototype against the observed surface.

## Repo layout

- `docs/` — organized research, architecture notes, experiment plans, status logs, and the living implementation roadmap (`docs/implementation/roadmap.md`)
- `src/` — machine-readable observations and provider contracts
- `scripts/public/` — public-source collection and normalization
- `scripts/static/` — static inspection helpers for local official client artifacts
- `scripts/network/` — local metadata capture helpers for experiments on your device
- `tests/` — Playwright smoke tests and unit tests
- `artifacts/` — generated outputs kept local and ignored by git

## Quick start

```bash
git clone <repo-url>
cd ps-wen
cp .env.example .env
npm install
npx playwright install chromium
npm run research:public
npm run test:public
```

To use PSN credentials, place them in `.env` using `.env.example` as the template.

## Key commands

```bash
# ── Direct PSN API (no app running required) ──────────────────────────────────
npm run api:psn-direct -- status                  # full snapshot: NPSSO, token, geo, session, broker
npm run api:psn-direct -- token                   # NPSSO → fresh bearer token (entitlements scope)
npm run api:psn-direct -- token --client commerce # NPSSO → auth code (commerce/lists scope)
npm run api:psn-direct -- geo                     # live Kamaji geo: region, timezone, postal range
npm run api:psn-direct -- session                 # establish authenticated access-token session (default mode)
npm run api:psn-direct -- session --mode guest    # force guest demographic session
npm run api:psn-direct -- session --dob 1990-06-15 # supply DOB if using guest mode and default doesn't match your account
npm run api:psn-direct -- profile                 # authenticated Kamaji profile (onlineId, display name, avatars)
npm run api:psn-direct -- entitlements --limit 20 # authenticated entitlement inventory (597 confirmed live)
npm run api:psn-direct -- stores                  # live store/catalog/PS-Plus URL map
npm run api:psn-direct -- manifest                # live exp-manifest fetch (env URLs, deep-link category IDs)
npm run api:psn-direct -- catalog --size 20       # browse a store container (default: APOLLOROOT)
npm run api:psn-direct -- catalog --cat STORE-MSF192018-APOLLOMUSTPLAY --size 10
  # examples confirmed: Days Gone, God of War, Assassin's Creed Odyssey
npm run api:psn-direct -- catalog --cat STORE-MSF192018-APOLLO_ACTION --size 10
  # examples confirmed: Guardians of the Galaxy, Far Cry 6, Deus Ex, Killing Floor 2
npm run api:psn-direct -- session-probe           # verifies token session by hitting profile + entitlements
npm run api:psn-direct -- broker                  # localhost:1235 broker reachability + command list
npm run api:psn-direct -- <cmd> --json            # machine-readable output for any command

# ── Session intercept (Playwright) ─────────────────────────────────────────────
npm run auth:intercept-session    # inject NPSSO into browser, intercept GrandCentral SDK + session flow

# ── Prototype CLI ─────────────────────────────────────────────────────────────
npm run prototype:psplus -- status       # observation-backed flow state + capability map
npm run prototype:psplus -- login        # open official PSN sign-in URL in system browser
npm run prototype:psplus -- confirm-login --note "ready"
npm run prototype:psplus -- reset-flow
npm run prototype:psplus -- bootstrap
npm run prototype:psplus -- entitlements
npm run prototype:psplus -- allocate --title-id CUSA00001

# ── Research / public source ──────────────────────────────────────────────────
npm run research:public        # fetch public capability pages and normalize findings
npm run research:web-assets    # inspect first-party web JS/JSON assets
npm run research:graphql-docs  # extract embedded GraphQL docs from public bundles
npm run research:pc-app-assets # fetch and summarize public JS assets from the PS Plus app profile
npm run research:pc-app-apollo # extract Kamaji/account/API config hints from live apollo.js
npm run research:control-plane # synthesize a browser control-plane snapshot from local artifacts

# ── Auth / session capture ────────────────────────────────────────────────────
npm run auth:psn-headed        # headed/manual Sony login helper; writes Playwright storage-state
npm run auth:extract-npsso     # confirm/extract NPSSO from Playwright storage-state
npm run auth:psn-summary       # create a redacted auth artifact summary from local captures
npm run auth:safari-summary    # summarize Safari PlayStation tabs (macOS, JS from Apple Events)
npm run auth:safari-endpoints  # normalize Safari resource URLs into a redacted endpoint report
npm run auth:pc-app-summary    # write a redacted PC-app auth/storage summary from Windows artifacts

# ── Browser API probes (Safari/macOS) ────────────────────────────────────────
npm run api:playstation-web -- list
npm run api:playstation-web -- probe --ids io.user.details,session.redirect.session --delay-ms 4000
npm run api:playstation-web-summary

# ── Static inspection ─────────────────────────────────────────────────────────
npm run inspect:bundle -- /path/to/app.asar
npm run inspect:installer -- ~/Downloads/PlayStationPlus-12.5.0.exe
npm run inspect:pc-app         # summarize the installed Windows PS Plus shell + broker surface

# ── Network capture ───────────────────────────────────────────────────────────
npm run capture:metadata                 # macOS/Linux tcpdump wrapper
npm run capture:metadata:windows         # Windows pktmon (run from elevated PowerShell)
  # Set CAPTURE_WINDOWS_PORTS=all for stream-phase captures
npm run summarize:metadata -- artifacts/network/<capture>.pcapng

# ── Tests ─────────────────────────────────────────────────────────────────────
npm run test:unit              # unit tests for auth/endpoint normalization logic
npm run test:public            # verify collected public evidence has expected signals
npm run test:psn-login         # official login smoke harness using Playwright
npm run env:check              # show readiness for login, bundle, and capture workflows
```

## App-free NPSSO acquisition

NPSSO is not generated locally by this repo. It is minted by Sony after a real
account login. The app-free retrieval path is:

```bash
npm run auth:psn-headed
# complete sign-in in the opened browser window

npm run auth:extract-npsso
# confirms NPSSO was captured in artifacts/auth/playstation-storage-state.json

npm run api:psn-direct -- profile --storage-state artifacts/auth/playstation-storage-state.json
```

That path uses the official Sony web login plus Playwright storage-state, not
Sony's proprietary PC app.


## Initial deliverables in this commit series

- repo scaffold and notes
- research dossier seeded from the preliminary report
- test harnesses for public-source validation and official-login session capture
- static + network instrumentation helpers for later phases

## Notes

- `.env` is ignored. Use `.env.example` as the template.
- Generated captures, storage states, screenshots, and pcaps stay under `artifacts/` and are ignored.
- For authenticated browser-session probes, prefer subset runs via `--ids` and keep several seconds between requests.
- The implementation path documented here targets a working OSS thin-client for PlayStation cloud streaming.
