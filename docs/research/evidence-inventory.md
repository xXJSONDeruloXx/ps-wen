# Evidence inventory

This inventory converts the user-provided preliminary research into repo-local tracking categories.

## Directly relevant artifacts

| Artifact | Type | Why it matters | Confidence |
|---|---|---|---|
| PlayStation Portal system software notes | Official | Confirms first-party cloud streaming on a thin client surface | High |
| PS Plus / PS Plus PC support pages | Official | Baseline for bandwidth, surface support, and claim wording | High |
| Asobi / Portal app listings and release notes | Community / proprietary | Third-party claims suggest non-wrapper implementations may exist | Medium |
| Historical PS Now measurement paper | Academic | Best packet-level public clue for Sony-era cloud gaming behavior | Medium |
| Community PSN OAuth docs and libraries | Community | Strong hint for account/session plumbing patterns | Medium |
| Historical PS Now PC Electron/ASAR findings | Community | Makes bundle archaeology a productive path | Medium |

## Evidence to collect next

1. Raw HTML snapshots for current official support/product pages.
2. A successful official-login browser state capture using local credentials.
3. Static inventory output for any current official PC app bundle available locally.
4. A metadata-only pcap taken during owned-account use of an official surface.

## Confidence rules

- **High**: official first-party page or directly generated local artifact.
- **Medium**: multiple community sources point to the same conclusion, but there is no fresh local confirmation.
- **Low**: plausible hypothesis that still needs a local or official source.

## Promotion rule

An item should move from Medium to High only when this repo captures either:
- a first-party source snapshot, or
- a reproducible local artifact that can be regenerated with the included scripts.
