# PlayStation Plus clean-room roadmap

This is the living done/todo tracker for turning current evidence into a clean-room OSS thin-client MVP without overstating what has been proven.

## Status legend

- **Done** — captured locally or implemented in the repo
- **In progress** — partially proven / partially implemented
- **Next** — highest-value follow-up work
- **Blocked** — needs evidence we still do not have

## Done

### Evidence and archaeology

- **Done**: installed Windows PlayStation Plus payload summarized
  - Electron/ASAR shell confirmed
  - package lineage `playstation-now`
  - runtime `9.0.4`
  - app URL `https://psnow.playstation.com/app/...`
- **Done**: localhost broker confirmed
  - `ws://localhost:1235/`
  - preload/notifier command inventory captured
- **Done**: redacted PC-app auth/storage surface summarized
  - QtWebEngine + roaming Chromium-style profile evidence
  - redacted `grc-response.html` handoff modes
- **Done**: public PC-app bundles inventoried
  - `apollo.js`, `vendor.js`, `js_ex.min.js`
  - Kamaji / PC Now / account API hints extracted
- **Done**: sanctioned Windows metadata captures performed
  - startup/control-plane captures
  - full stream-phase all-port capture
  - segmented launch/quit/save-action captures
- **Done**: strong stream transport clue established
  - high-volume UDP/2053 to Sony-owned `104.142.128.0/17`

### Prototype implementation

- **Done**: observation-backed PlayStation Plus provider
- **Done**: prototype CLI
  - `status`
  - `bootstrap`
  - `entitlements`
  - `allocate`
  - `login`
- **Done**: system-browser login flow by default
- **Done**: persisted browser-login flow state machine
  - `confirm-login`
  - `reset-flow`
- **Done**: built-in pcapng summarizer with transport-candidate detection

## In progress

### Control plane

- **In progress**: distinguishing bootstrap hosts from long-lived session-control hosts
  - launch/start slice suggests `accounts.api.playstation.com`, `commerce.api.np.km.playstation.net`, `config.cc.prod.gaikai.com`, `download-psnow.playstation.com`, `theia.dl.playstation.net`, and `web.np.playstation.com` are more bootstrap-heavy
  - quit/save slices suggest `client.cc.prod.gaikai.com` and `psnow.playstation.com` persist later in the session

### Transport

- **In progress**: transport family identification
  - custom UDP is now strongly indicated
  - exact framing, multiplexing, and codec semantics remain unknown

### Save/overlay semantics

- **In progress**: save-management mapping
  - copy-to-online-storage did not surface a distinct obvious save-only PlayStation hostname family
  - still need the delete-only comparison run
- **In progress**: overlay-action mapping
  - still need a cleaner overlay-only capture

### MVP shell

- **In progress**: the repo can model login/bootstrap/gated entitlements/placeholder allocation, but it does not yet have a dedicated broker adapter or placeholder launch/quit UX layer

## Next

### Highest-value evidence collection

1. **Delete-from-online-storage only** segmented capture
   - compare directly against the copy-only run
2. **Overlay-only** segmented capture
   - open overlay, toggle vibration once, close overlay
3. **Cleaner launch-to-picture-only** segmented capture
   - minimize all post-picture interactions
4. **Action timestamp correlation**
   - note approximate user action times during capture windows so host/port shifts can be matched to UI actions more precisely

### Highest-value implementation work

1. **Broker adapter seam**
   - model known localhost commands and state transitions cleanly
2. **Placeholder launch/quit UX**
   - use current placeholder allocation results + flow state machine
3. **Diagnostics panel / capture comparison view**
   - compare launch vs quit vs save-action captures side by side
4. **Session lifecycle model**
   - bootstrap -> running -> overlay -> save action -> quit -> post-session

## Blocked / missing for a true Sony-app replacement

These are the pieces that still prevent a full standalone replacement of the official app:

### Auth/session ownership

- a sanctioned standalone native auth completion model
- confirmed post-browser callback/session ownership flow for a third-party app

### Entitlements

- exact Premium streaming entitlement semantics
- exact device/region/subscription gating behavior

### Session allocation

- allocator request/response message shapes
- exact relationship between:
  - `psnow.playstation.com`
  - `client.cc.prod.gaikai.com`
  - `config.cc.prod.gaikai.com`
  - the session-assigned UDP/2053 endpoints

### Media/control transport

- framing and channel layout
- codec/bitstream details
- encryption/session keying
- whether media/input/control are multiplexed or split
- reconnect behavior

### Save-management semantics

- whether save actions ride an existing TLS control channel, the UDP session transport, or both

## What the OSS MVP can honestly do now

A clean-room MVP can already:

- open official browser login
- track login confirmation state
- inspect known bootstrap/runtime/auth observations
- expose gated entitlement placeholders
- expose placeholder allocation results
- hint that stream transport is likely custom UDP
- provide strong diagnostics and capture comparison tooling

It cannot yet honestly claim to:

- allocate real cloud-stream sessions independently
- decode or drive the live media transport
- fully replace the official Sony app for gameplay

## Exit condition for the next phase

The next phase is ready when we have:

1. the delete-only and overlay-only segmented captures documented
2. a broker adapter seam in the prototype
3. a clearer launch/bootstrap vs running-session vs quit teardown map
4. enough confidence to keep transport labeled as `custom-udp` with tighter lifecycle correlation, even if protocol semantics remain unknown
