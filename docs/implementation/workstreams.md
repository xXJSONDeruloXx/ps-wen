# Workstreams

## WS1 — public capability validation

**Objective:** turn first-party claims into versioned artifacts.

Deliverables:
- saved raw HTML snapshots in `artifacts/raw/`
- normalized JSON capability report
- markdown summary of confirmed claims and gaps

Exit criteria:
- at least one official source is captured for each surface: PS Plus PC, Portal, general PS Plus
- bandwidth, resolution, and cloud-streaming wording are extracted when present

## WS2 — official-login harness

**Objective:** prove we can use official Sony login flows without embedding secrets in code.

Deliverables:
- `.env` template
- Playwright smoke test that stores a browser session state locally
- notes on MFA/CAPTCHA/manual intervention points

Exit criteria:
- successful local sign-in artifact on the repo owner's machine
- documented blockers if full automation is not stable

## WS3 — static client archaeology

**Objective:** inventory official PC client artifacts when they are available locally.

Deliverables:
- bundle inventory JSON
- extracted endpoint/string list
- keyword hit report for auth/session/transport terms

Exit criteria:
- repeatable scan of `.asar` or extracted bundle directory
- no proprietary payloads committed to the repo

## WS4 — local metadata capture

**Objective:** collect non-invasive traffic observations while official clients are used on owned devices/accounts.

Deliverables:
- pcap capture wrapper
- summary helper for DNS/TLS/QUIC metadata
- session note template and artifact naming rules

Exit criteria:
- at least one successful local capture file and summary
- clear documentation of interface/filter assumptions

## WS5 — implementation roadmap

**Objective:** translate the evidence into an engineering plan for a generic OSS thin client.

Deliverables:
- architecture document
- unknowns tracker
- prioritized experiment matrix

Exit criteria:
- blockers are explicit
- next experiments are tied to concrete unknowns rather than broad speculation
