# ps-wen

Research repo for assessing the current state of PlayStation cloud streaming and mapping a clean-room path toward an open-source thin client.

## Scope

This repo is for:
- validating publicly documented PlayStation cloud streaming capabilities
- organizing unknowns around auth, session orchestration, transport, and device support
- building safe research harnesses for public-page collection, official sign-in testing, static client bundle inventory, and local traffic metadata capture
- documenting an implementation path for a generic low-latency streaming client that can stay clean-room and modular

This repo is **not** for:
- bypassing DRM, trust checks, certificate pinning, or access controls
- credential harvesting or unofficial password collection outside official Sony login surfaces
- redistributing Sony assets or proprietary binaries

## Current workstreams

1. **Evidence collection**: turn preliminary research into structured markdown and reproducible artifact capture.
2. **Capability validation**: collect official public claims, then verify what can be confirmed with official login flows and first-party surfaces.
3. **Client archaeology**: inventory official PC app bundles when provided locally.
4. **Implementation planning**: define a reusable media/input/control-plane architecture for a non-wrapper open-source client.

## Repo layout

- `docs/` — organized research, architecture notes, experiment plans, status logs
- `scripts/public/` — public-source collection and normalization
- `scripts/static/` — static inspection helpers for local official client artifacts
- `scripts/network/` — local metadata capture helpers for sanctioned experiments on your own device/account
- `tests/` — Playwright smoke tests for public pages and official-login harnesses
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

To use PSN credentials for official-login experiments, place them in `.env` after reviewing `docs/implementation/compliance-guardrails.md`.

## Key commands

```bash
npm run research:public        # fetch public capability pages and normalize findings
npm run test:public            # verify collected public evidence has expected capability signals
npm run env:check              # show readiness for login, bundle, and capture workflows
npm run test:psn-login         # official login smoke harness using Playwright
npm run auth:psn-headed        # headed/manual login helper that dumps cookies + storage locally
npm run auth:psn-summary       # create a redacted auth artifact summary from local captures
npm run auth:safari-summary    # summarize Safari PlayStation tabs when JS from Apple Events is enabled
npm run auth:safari-endpoints  # normalize Safari resource URLs into a redacted endpoint report
npm run inspect:bundle -- /path/to/app.asar
npm run inspect:installer -- ~/Downloads/PlayStationPlus-12.5.0.exe
npm run capture:metadata       # local tcpdump wrapper for sanctioned traffic metadata capture
npm run summarize:metadata -- artifacts/network/<capture>.pcap
```

## Initial deliverables in this commit series

- repo scaffold and guardrails
- research dossier seeded from the preliminary report
- test harnesses for public-source validation and official-login session capture
- static + network instrumentation helpers for later phases

## Notes

- `.env` is ignored. Use `.env.example` as the template.
- Generated captures, storage states, screenshots, and pcaps stay under `artifacts/` and are ignored.
- The implementation path documented here assumes clean-room interoperability research only.
