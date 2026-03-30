# PlayStation Plus observation-backed MVP — 2026-03-29

## Commands

```bash
npm run prototype:psplus -- status
npm run prototype:psplus -- bootstrap
npm run prototype:psplus -- entitlements
npm run prototype:psplus -- allocate --title-id CUSA00001 --region us --quality 1080p
npm run prototype:psplus -- login --wait-seconds 600
npm run prototype:psplus -- confirm-login --note "browser session ready"
npm run prototype:psplus -- reset-flow
npm run prototype:psplus -- login --capture-artifacts --wait-seconds 600
```

## What this is

This is **not** a working third-party streaming client.

It is an observation-backed MVP that turns the repo's current evidence into a usable prototype seam for:

- official browser login handoff
- signed-in state detection
- profile/bootstrap inspection
- entitlement placeholders
- session-allocation placeholders

The goal is to let  implementation work start **before** a real Premium queue/start capture exists.

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
- persisted flow-state phase if a login flow has been started
- capability states for:
  - login
  - native broker
  - profile bootstrap
  - entitlements
  - session allocation
  - streaming transport

### `login`

By default, this now opens the official sign-in URL in the user's **system browser** and records a persisted flow-state artifact.

That is the more sensible MVP/auth shape for a real client because it:

- uses the user's normal browser profile
- reuses password manager / passkey / MFA flows
- avoids making Playwright look like a permanent dependency of the product shape

This default mode intentionally does **not** capture cookies or browser storage.

Instead, it creates a manual confirmation flow:

1. open system-browser login
2. wait for the user to finish in the browser
3. run `confirm-login`
4. advance the prototype state machine using the current observation-backed provider status

If local auth artifacts are needed for research, use:

- `npm run prototype:psplus -- login --capture-artifacts`

That path launches the existing Playwright-based headed helper:

- `npm run auth:psn-headed`

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

### `confirm-login`

This is the manual success event for the system-browser auth flow.

It:

- updates the persisted flow-state artifact
- records an optional operator note
- synchronizes the flow state with the current observation-backed provider status

### `reset-flow`

Resets the persisted flow-state artifact back to `signed-out`.

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

1. **Open official login** in the user's system browser.
2. **Confirm login completion manually** through the persisted flow-state artifact.
3. **Load observation-backed state** from local artifacts.
4. **Expose placeholder entitlement/allocation seams** for the still-unconfirmed native streaming path.
5. **Swap placeholders for observed behavior later** when a real Premium queue/start capture exists.

## State-machine artifact

Local-only artifact:

- `artifacts/prototype/playstation-plus-flow-state.json`

Current phase families:

- `signed-out`
- `browser-login-opened`
- `browser-login-confirmed`
- `signed-in-observed`
- `entitlements-gated`
- `allocation-placeholder`

## Observed local run

During the first live use of this flow, the official browser login URL reused an already-signed-in browser session.

The flow was then manually confirmed with a note equivalent to:

- `browser session reused existing login`

That is exactly the kind of UX this MVP should support: the user may already be authenticated in the official browser, and the prototype should treat that as a successful login handoff rather than forcing another credential entry.

## Next best implementation step

Build the next thin-client layer against this MVP instead of waiting for perfect evidence:

- diagnostics panel
- broker adapter interface
- title/entitlement UI models
- placeholder queue/launch UX

That work is now possible without crossing any repo notes.
