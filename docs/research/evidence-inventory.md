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
| Historical PS Now PC Electron/ASAR findings | Community | Made bundle archaeology a productive path and are now locally confirmed by the installed Windows payload | High |
| Installed PlayStation Plus 12.5.0 Windows payload summary | Local / generated | Directly confirms Electron/ASAR shell, localhost broker, PS Now app URL, updater URL, redacted auth-storage surfaces, cached asset URLs, and redacted auth-handoff redirect modes | High |
| Public PS Plus PC app asset inventory | Public / generated | Fetches the live JS assets for the current app URL and extracts Kamaji, PC Now, Chihiro, account API, and telemetry namespace clues without using private session material | High |
| Public PS Plus PC Apollo summary | Public / generated | Extracts structured Kamaji config keys, PC user/account endpoint templates, and auth-flow hints from the live `apollo.js` asset | High |
| Windows pktmon PC-app metadata capture summary | Local / generated | Summarizes sanctioned `pktmon` captures from startup and real stream-phase runs, including on-wire confirmation of `psnow.playstation.com`, `client.cc.prod.gaikai.com`, `config.cc.prod.gaikai.com`, `web.np.playstation.com`, `commerce.api.np.km.playstation.net`, and high-volume UDP/2053 transport candidates inside a Sony-owned `104.142.128.0/17` block | High |
| PlayStation Plus observation-backed MVP prototype | Local / generated | Wraps current browser/native/capture findings into a safe CLI/provider for official login handoff, persisted browser-login flow state, bootstrap inspection, gated entitlement records, and placeholder allocation seams | High |
| Segmented stream lifecycle captures | Local / generated | Shorter all-port launch, quit-game, and save-action captures narrow which hosts appear during bootstrap vs running-session vs save-management behavior | High |

## Evidence to collect next

1. Raw HTML snapshots for current official support/product pages.
2. A successful official-login browser state capture using local credentials.
3. Metadata-only capture while the current official PC app is idle and while it enters any real stream/queue path available on the account.
4. A hostname/timing comparison between browser-only evidence and native-client evidence.

## Confidence rules

- **High**: official first-party page or directly generated local artifact.
- **Medium**: multiple community sources point to the same conclusion, but there is no fresh local confirmation.
- **Low**: plausible hypothesis that still needs a local or official source.

## Promotion rule

An item should move from Medium to High only when this repo captures either:
- a first-party source snapshot, or
- a reproducible local artifact that can be regenerated with the included scripts.
