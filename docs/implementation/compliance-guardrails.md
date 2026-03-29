# Compliance guardrails

This repo is intentionally scoped to interoperability research that stays on the safe side of public evidence and authorized use.

## Allowed

- Collecting and archiving public product/support claims.
- Automating official login pages with credentials that the repo owner places in a local `.env` file.
- Saving local browser storage state created through official sign-in flows.
- Static inspection of local copies of official PC client bundles that you already possess.
- Capturing local traffic metadata from your own device/account for hostname, timing, protocol-family, and certificate observations.
- Building generic media/input/control abstractions that do not depend on bypassing proprietary protections.

## Out of scope

- DRM bypass or attempts to remove content protection.
- Certificate pinning bypass, app tampering meant to defeat trust checks, or instructions for evading service controls.
- Unauthorized access to Sony endpoints or use of stolen/reused session material.
- Credential harvesting outside official Sony-controlled login surfaces.
- Redistribution of Sony binaries, decrypted payloads, or proprietary assets.

## Working rule of thumb

If an experiment requires breaking a security boundary rather than observing an officially reachable surface, it does not belong in this repo.

## Data handling

- `.env` is ignored by git.
- `artifacts/` is ignored by git.
- Screenshots, storage states, pcaps, and raw HTML stay local unless explicitly scrubbed and promoted into docs.
