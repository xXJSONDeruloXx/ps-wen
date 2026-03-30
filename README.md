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
npm run research:public        # fetch public capability pages and normalize findings
npm run research:web-assets    # inspect first-party web JS/JSON assets referenced by Safari session summary
npm run research:graphql-docs  # extract embedded GraphQL docs from public first-party bundles and correlate them with probe outcomes
npm run research:pc-app-assets # fetch and summarize public JS assets referenced by the installed PS Plus PC app profile
npm run research:pc-app-apollo # extract structured Kamaji/account/API config hints from the live public apollo.js asset
npm run research:control-plane # synthesize a browser control-plane snapshot from local artifacts
npm run test:unit              # unit tests for auth/endpoint normalization logic
npm run test:public            # verify collected public evidence has expected capability signals
npm run env:check              # show readiness for login, bundle, and capture workflows
npm run test:psn-login         # official login smoke harness using Playwright
npm run auth:psn-headed        # headed/manual login helper that dumps cookies + storage locally
npm run auth:psn-summary       # create a redacted auth artifact summary from local captures
npm run auth:safari-summary    # summarize Safari PlayStation tabs when JS from Apple Events is enabled
npm run auth:safari-endpoints  # normalize Safari resource URLs into a redacted endpoint report
npm run api:playstation-web -- list
npm run api:playstation-web -- probe --ids io.user.details,session.redirect.session --delay-ms 4000
npm run api:playstation-web-summary
npm run research:graphql-docs
npm run research:control-plane
npm run inspect:bundle -- /path/to/app.asar
npm run inspect:installer -- ~/Downloads/PlayStationPlus-12.5.0.exe
npm run inspect:pc-app         # summarize the installed Windows PlayStation Plus shell + broker surface
npm run auth:pc-app-summary    # write a redacted PC-app auth/storage summary from local Windows artifacts
npm run prototype:psplus -- status       # observation-backed MVP CLI for system-browser login, confirm-login flow state, bootstrap, entitlement, and placeholder allocation seams
npm run capture:metadata       # macOS/Linux tcpdump wrapper for traffic metadata capture
npm run capture:metadata:windows # Windows pktmon-based metadata capture (run from elevated PowerShell; set CAPTURE_WINDOWS_PORTS=all for stream-phase captures)
npm run summarize:metadata -- artifacts/network/<capture>.pcapng # uses tshark when available, otherwise falls back to the built-in DNS/TLS metadata summarizer
```

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
