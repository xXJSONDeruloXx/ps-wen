# Experiment matrix

## Phase 0 — desk validation

| Experiment | Command | Output | Status |
|---|---|---|---|
| Collect official public pages | `npm run research:public` | `artifacts/official-capabilities.json` + raw HTML | Ready |
| Public page smoke test | `npm run test:public` | Playwright report / console output | Ready |

## Phase 1 — official-login validation

| Experiment | Command | Output | Status |
|---|---|---|---|
| Official login smoke | `npm run test:psn-login` | local storage state + screenshots on failure | Ready once `.env` is filled |
| Post-login page reachability | `PSN_POST_LOGIN_URL=... npm run test:psn-login` | page title, screenshot, storage state | Ready once login surface is known |

## Phase 2 — official client archaeology

| Experiment | Command | Output | Status |
|---|---|---|---|
| Scan `.asar` bundle | `npm run inspect:bundle -- /path/to/app.asar` | inventory JSON under `artifacts/static/` | Ready |
| Scan extracted app directory | `npm run inspect:bundle -- /path/to/extracted-client` | inventory JSON under `artifacts/static/` | Ready |

## Phase 3 — local metadata capture

| Experiment | Command | Output | Status |
|---|---|---|---|
| Capture local metadata | `CAPTURE_INTERFACE=en0 npm run capture:metadata` | pcap under `artifacts/network/` | Ready |
| Summarize pcap | `npm run summarize:metadata -- artifacts/network/<file>.pcap` | stdout summary | Ready if `tshark` is installed |

## Phase 4 — synthesis

| Experiment | Output | Exit condition |
|---|---|---|
| Update unknowns tracker | markdown diff | each completed experiment closes or narrows a specific question |
| Promote evidence into architecture plan | docs updates | generic client requirements become more concrete |
| Create implementation backlog | issue list / markdown | work splits cleanly between generic OSS modules and service-specific unknowns |
