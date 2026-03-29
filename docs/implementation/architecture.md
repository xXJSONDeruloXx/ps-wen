# Clean-room architecture sketch

## Design target

Build a reusable thin-client stack whose generic parts can be developed and tested independently of Sony-specific service integration.

## Layers

### 1. UX layer
- game/session launcher UI
- diagnostics dashboard
- account/session status surface
- controller mapping and capability prompts

### 2. Control-plane abstractions
- OAuth-capable auth module
- web identity bootstrap provider
- entitlement/catalog provider interface
- session allocator interface
- region / quality preference model
- token lifecycle manager

### 3. Data-plane abstractions
- transport adapter interface
  - WebRTC/RTP candidate
  - custom UDP candidate
  - QUIC-like candidate
- control/input uplink adapter
- encryption/trust boundary placeholder

### 4. Media pipeline
- depacketizer / frame reassembly
- jitter buffer
- pacing and playout control
- decoder abstraction
- render backend
- telemetry hooks for RTT, loss, bitrate, stalls, recovered frames

### 5. Input pipeline
- SDL-style controller abstraction
- touchpad / gyro / haptics feature flags
- deterministic input trace recorder for regression tests

## Current assumption set

- The best open-source investment is in layers 2–5 above, not in hardcoding a Sony-specific client.
- Service-specific glue should remain behind provider interfaces until there is official or clearly authorized documentation for a given surface.
- Browser evidence now suggests that the web control plane itself separates into at least:
  - identity/bootstrap (`session`, `userinfo`, `pdcws2`, `pdcsi`, `gpdcUser`, `userId`)
  - query/data (`web.np.playstation.com/api/graphql/v1/op` persisted queries)
  - telemetry (`telemetry.api.playstation.com`, `smetrics.aem.playstation.com`)
- Capability validation should produce concrete requirements for each layer: max resolution, input features, token refresh timing, reconnect behavior, and adaptation strategy.

## Generic components to prototype first

1. decoder + renderer shell
2. jitter and pacing model
3. transport abstraction interface
4. controller capability matrix
5. telemetry schema and artifact format
6. provider contracts (`src/architecture/provider-types.ts`) and machine-readable web observations (`src/observations/playstation-web.ts`)

## Open architecture questions

- Is the eventual service-facing transport closer to WebRTC/RTP, custom UDP, or something mixed?
- Are PS5-title streams materially different from legacy PS Now sessions?
- Which client surfaces require device identity beyond ordinary OAuth context?
- How much controller feature parity is required to launch and navigate cloud titles reliably?
