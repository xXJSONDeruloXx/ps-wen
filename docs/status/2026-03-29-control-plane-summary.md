# Browser control-plane summary and provider prototype — 2026-03-29

## Commands

```bash
npm run research:control-plane
npm run api:playstation-web -- probe --ids io.user.details,io.user.segments --delay-ms 4000
```

## Artifacts

- `artifacts/observations/playstation-web-control-plane.json`
- existing inputs under `artifacts/auth/`, `artifacts/api/`, and `artifacts/public/`

## What this adds

### 1. A synthesized control-plane snapshot
The new summary script combines:
- Safari signed-in session evidence
- browser-session probe results
- public web bundle inventory

into one machine-readable view of what is currently known about the PlayStation web control plane.

### 2. Capability-state framing
The snapshot now explicitly classifies these browser-side control-plane areas:
- identity bootstrap
- profile bootstrap
- query surface
- entitlements
- session bootstrap redirects
- session allocation

This helps keep implementation planning grounded in evidence instead of broad speculation.

### 3. A read-only provider prototype
`src/providers/playstation-web-observation-provider.ts` now implements provider interfaces against cached local artifacts.

That means we can:
- detect a signed-in browser session from captured Safari evidence
- read cached profile bootstrap data from successful `io.playstation.com` probes
- replay observed query outcomes from cached local probe artifacts without creating new account traffic

## Practical takeaway

A low-touch validation run using only two paced requests also worked as expected:
- `io.user.details` → `200`
- `session.redirect.session` → `opaque-redirect`

The browser-side control plane is now concrete enough to prototype around **offline artifacts first**:
- identity/profile bootstrap is observed
- session redirects are observed
- GraphQL/query reuse is only partial
- entitlement-style queries are present but gated
- stream allocation remains unknown

## Account-safety note

For future live work, the probe CLI should stay low-touch:
- prefer subset runs via `--ids`
- keep several seconds between requests
- avoid broad re-probing when existing artifacts already answer the question
