# PlayStation Plus observation-backed MVP — 2026-03-29

## Commands

```bash
npm run prototype:psplus -- status
npm run prototype:psplus -- bootstrap
npm run prototype:psplus -- entitlements
npm run prototype:psplus -- allocate --title-id CUSA00001 --region us --quality 1080p
npm run prototype:psplus -- login
```

## What this is

This is **not** a working third-party streaming client.

It is an observation-backed MVP that turns the repo's current evidence into a usable prototype seam for:

- official browser login handoff
- signed-in state detection
- profile/bootstrap inspection
- entitlement placeholders
- session-allocation placeholders

The goal is to let clean-room implementation work start **before** a real Premium queue/start capture exists.

## Added pieces

### 1. A PlayStation Plus observation provider

New provider:

- `src/providers/playstation-plus-observation-provider.ts`

It composes current evidence from:

- browser auth summary if available
- PC-app auth summary
- PC-app surface summary
- public Apollo summary
- recent local network summary artifacts

### 2. A prototype CLI

New CLI:

- `scripts/prototype/playstation-plus-cli.ts`

New command:

- `npm run prototype:psplus -- ...`

## Current supported prototype actions

### `status`

Returns a consolidated view of:

- signed-in state
- current PC app URL/runtime
- localhost broker presence
- captured PlayStation/Sony host families
- capability states for:
  - login
  - native broker
  - profile bootstrap
  - entitlements
  - session allocation
  - streaming transport

### `login`

This launches the existing official-browser login helper:

- `npm run auth:psn-headed`

So the MVP can initiate login only through the already-allowed official flow.

### `bootstrap`

Returns an observation-backed bootstrap object containing:

- runtime/app URL
- localhost broker URL
- preload/notifier command lists
- local auth/storage shapes
- Kamaji path families
- account API templates
- captured PlayStation/Sony control-plane hosts

### `entitlements`

Returns placeholder/gated entitlement records rather than pretending we already have a direct entitlement API.

Current records cover:

- `playstation-plus-premium-streaming`
- `native-stream-session-bootstrap`

These records intentionally preserve uncertainty through `state: gated` or `state: unknown` style outputs.

### `allocate`

Returns a **placeholder** allocation result with:

- `state: "placeholder"`
- endpoint hints
- evidence strings
- blocker strings
- notes explaining why it is not a real allocator result yet

This is the key MVP seam that lets us start wiring control flow now without misrepresenting current evidence.

## Why this is useful now

With current evidence we can already prototype around:

- session-aware app state
- known host families
- native broker presence
- auth/bootstrap state
- future allocator/transport seams

What we still cannot honestly implement yet is:

- real title launch allocation
- real queue placement
- real stream transport bootstrap
- real stream teardown semantics

## Practical interpretation

This gives us a safe minimum viable implementation path:

1. **Use official login** through the headed helper.
2. **Load observation-backed state** from local artifacts.
3. **Expose placeholder entitlement/allocation seams** for the still-unconfirmed native streaming path.
4. **Swap placeholders for observed behavior later** when a real Premium queue/start capture exists.

## Next best implementation step

Build the next thin-client layer against this MVP instead of waiting for perfect evidence:

- app/session state machine
- diagnostics panel
- broker adapter interface
- title/entitlement UI models
- placeholder queue/launch UX

That work is now possible without crossing any repo guardrails.
