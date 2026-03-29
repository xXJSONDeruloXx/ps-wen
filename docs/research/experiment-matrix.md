# Experiment matrix

## Phase 0 — desk validation

| Experiment | Command | Output | Status |
|---|---|---|---|
| Collect official public pages | `npm run research:public` | `artifacts/official-capabilities.json` + raw HTML | Ready |
| Inspect referenced first-party web assets | `npm run research:web-assets` | `artifacts/public/playstation-web-asset-inventory.json` | Ready |
| Unit tests for normalization/model logic | `npm run test:unit` | node test output | Ready |
| Public page smoke test | `npm run test:public` | Playwright report / console output | Ready |

## Phase 1 — official-login validation

| Experiment | Command | Output | Status |
|---|---|---|---|
| Official login smoke | `npm run test:psn-login` | local storage state + screenshots on failure | Partially validated; still brittle |
| Headed/manual login capture | `npm run auth:psn-headed` | local auth artifacts under `artifacts/auth/` | Ready |
| Safari signed-in session summary | `npm run auth:safari-summary` | redacted signed-in web session summary | Ready when Safari dev JS is enabled |
| Safari normalized endpoint report | `npm run auth:safari-endpoints` | redacted host/path/query-key inventory | Ready when Safari summary exists |
| Browser-session API probe | `npm run api:playstation-web -- probe` | local API probe report under `artifacts/api/` | Ready |
| Browser-session API probe summary | `npm run api:playstation-web-summary` | classification summary under `artifacts/api/` | Ready after probe run |
| Bundle GraphQL document extraction | `npm run research:graphql-docs` | extracted GraphQL docs + probe correlation under `artifacts/public/` | Ready |
| Post-login page reachability | `PSN_POST_LOGIN_URL=... npm run test:psn-login` | page title, screenshot, storage state | Login surface known; assertion still evolving |

## Phase 2 — official client archaeology

| Experiment | Command | Output | Status |
|---|---|---|---|
| Inspect Windows installer stub | `npm run inspect:installer -- ~/Downloads/PlayStationPlus-12.5.0.exe` | installer JSON under `artifacts/static/` | Completed on current installer |
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
