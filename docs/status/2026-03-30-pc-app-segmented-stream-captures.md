# PlayStation Plus PC app segmented stream captures — 2026-03-30

## Purpose

After the first successful all-port live stream capture, the next goal was to separate:

- launch/bootstrap traffic
- long-lived stream traffic
- quit-game teardown traffic
- save-management traffic

These shorter captures were all taken with `CAPTURE_WINDOWS_PORTS=all` so non-443 UDP transport would not be filtered out.

## Commands used

```powershell
cd C:\Users\kurt\ps-wen
$env:CAPTURE_FILE_SIZE_MB='2048'
$env:CAPTURE_WINDOWS_PORTS='all'

# short launch/start slice
$env:CAPTURE_DURATION='60'
npm run capture:metadata:windows
npm run summarize:metadata -- artifacts/network/ps-cloud-metadata-20260329-201241.pcapng

# quit-game slice while the game was already streaming
$env:CAPTURE_DURATION='60'
npm run capture:metadata:windows
npm run summarize:metadata -- artifacts/network/ps-cloud-metadata-20260329-201841.pcapng

# copy-to-online-storage slice while the game was already streaming
$env:CAPTURE_DURATION='90'
npm run capture:metadata:windows
npm run summarize:metadata -- artifacts/network/ps-cloud-metadata-20260329-202615.pcapng

# click-from-list / waiting-for-server slice
$env:CAPTURE_DURATION='60'
npm run capture:metadata:windows
npm run summarize:metadata -- artifacts/network/ps-cloud-metadata-20260329-204138.pcapng
```

## Artifacts

Local-only generated artifacts:

- `artifacts/network/ps-cloud-metadata-20260329-201241.pcapng`
- `artifacts/network/ps-cloud-metadata-20260329-201241.summary.json`
- `artifacts/network/ps-cloud-metadata-20260329-201841.pcapng`
- `artifacts/network/ps-cloud-metadata-20260329-201841.summary.json`
- `artifacts/network/ps-cloud-metadata-20260329-202615.pcapng`
- `artifacts/network/ps-cloud-metadata-20260329-202615.summary.json`
- `artifacts/network/ps-cloud-metadata-20260329-204138.pcapng`
- `artifacts/network/ps-cloud-metadata-20260329-204138.summary.json`

## Capture A — `201241` launch/start slice

This short capture still showed the broad launch/control-plane family:

- `accounts.api.playstation.com`
- `ca.account.sony.com`
- `cc.prod.gaikai.com`
- `client.cc.prod.gaikai.com`
- `commerce.api.np.km.playstation.net`
- `config.cc.prod.gaikai.com`
- `download-psnow.playstation.com`
- `merchandise.api.playstation.com`
- `psnow.playstation.com`
- `theia.dl.playstation.net`
- `web.np.playstation.com`

It also showed session-specific high-volume UDP/2053 candidates inside the Sony-owned `104.142.128.0/17` block:

- `udp://104.142.161.22:2053`
- `udp://104.142.161.148:2053`

Interpretation:

- this is a good approximation of the **launch/bootstrap to stream-start** phase
- the HTTPS control-plane families are much more visible here than in later segmented captures
- the UDP transport endpoints vary per session but stay inside the same Sony-owned range and port family

## Capture B — `201841` quit-game slice

This capture started while the game was already streaming, then the overlay was opened and **Quit Game** was confirmed.

Visible families were much narrower:

- TLS SNI: `client.cc.prod.gaikai.com`
- TLS SNI: `psnow.playstation.com`
- high-volume UDP candidate: `udp://104.142.161.22:2053`

Interpretation:

- by the time the user is already in-game and quitting, most of the broader launch/bootstrap host family is gone
- the persistent pieces appear to be:
  - `client.cc.prod.gaikai.com`
  - `psnow.playstation.com`
  - the Sony-owned UDP/2053 channel
- that strongly suggests the bootstrap hosts are front-loaded, while `client.cc` + UDP stay alive deeper into the running session and teardown path

## Capture C — `202615` copy-to-online-storage slice

This capture started while the game was already streaming, then the user opened the save-management UI and performed **copy to online storage** only.

Visible traffic was again very narrow:

- TLS SNI: `client.cc.prod.gaikai.com`
- high-volume UDP candidate: `udp://104.142.161.16:2053`

No fresh obvious PlayStation save-specific hostname family surfaced during this action.

Interpretation:

- the save-copy action does **not** appear, at metadata level, to require a clearly separate save-service hostname family
- it likely rides one of:
  - an already-open stream/control connection
  - an already-open `client.cc.prod.gaikai.com` TLS channel
  - or the same long-lived session-side transport family
- this does **not** prove exact save-management semantics, but it narrows the possibilities considerably

## Capture D — `204138` click-from-list / waiting-for-server slice

This capture started when the user clicked **Days Gone** in the title list and then waited while the service appeared to be assigning a server. The user believes the capture may end before the first visible frame, but the network shape suggests that allocation/startup was already well underway.

Visible families included:

- `ca.account.sony.com`
- `cc.prod.gaikai.com`
- `client.cc.prod.gaikai.com`
- `commerce.api.np.km.playstation.net`
- `config.cc.prod.gaikai.com`
- `download-psnow.playstation.com`
- `merchandise.api.playstation.com`
- `psnow.playstation.com`
- `theia.dl.playstation.net`
- `web.np.playstation.com`
- Sony-owned UDP/2053 candidates:
  - `udp://104.142.161.27:2053`
  - `udp://104.142.161.133:2053`

Interpretation:

- this does **not** look like a pure pre-allocation idle wait
- `client.cc.prod.gaikai.com` + `config.cc.prod.gaikai.com` + active Sony-owned UDP/2053 strongly suggest the session had already moved into stream bootstrap or early media startup, even if the first picture was not yet visible on screen
- compared with the shorter launch/start slice, this capture omits `accounts.api.playstation.com` but retains most of the app/bootstrap/control family, which is consistent with a user that is already authenticated and is now entering the allocator/startup path for a selected title

## Cross-capture comparison

### 1. Bootstrap/setup hosts are front-loaded

The launch/start slice shows several hosts that do **not** remain prominent in the quit/save slices:

- `accounts.api.playstation.com`
- `commerce.api.np.km.playstation.net`
- `config.cc.prod.gaikai.com`
- `download-psnow.playstation.com`
- `theia.dl.playstation.net`
- `web.np.playstation.com`

That is consistent with a bootstrap/config phase rather than a steady-state stream phase.

The click-from-list / waiting-for-server slice sits between those extremes: it keeps most of the bootstrap/control family alive while also showing active Sony-owned UDP/2053. That makes it the strongest current candidate for a **post-click allocator / pre-picture** window.

### 2. `client.cc.prod.gaikai.com` looks like a persistent session-side control host

It appears in:

- long stream-phase capture
- quit-game slice
- save-copy slice

That makes it a much stronger candidate for a long-lived stream/session-control role than the broader one-shot setup hosts.

### 3. UDP/2053 persists across running-session actions

Observed across segmented captures:

- `udp://104.142.161.22:2053`
- `udp://104.142.161.148:2053`
- `udp://104.142.161.16:2053`

Interpretation:

- the endpoint IP changes by session/action window
- the port family remains stable
- the owning network remains Sony-owned
- this is consistent with a session-assigned custom UDP streaming path

## Current best model after segmentation

### Launch/bootstrap/config

Likely includes:

- `accounts.api.playstation.com`
- `ca.account.sony.com`
- `psnow.playstation.com`
- `commerce.api.np.km.playstation.net`
- `config.cc.prod.gaikai.com`
- `download-psnow.playstation.com`
- `theia.dl.playstation.net`
- `web.np.playstation.com`

### Running-session control

Likely includes:

- `client.cc.prod.gaikai.com`
- `psnow.playstation.com`

### Stream/media transport

Strongly indicated:

- Sony-owned UDP `:2053` endpoints in `104.142.128.0/17`

## What remains missing

These segmented captures still do **not** reveal:

- allocator request/response bodies
- exact message boundaries for quit/save actions
- whether save actions ride `client.cc`, a hidden existing channel, or the UDP transport directly
- codec/framing/encryption details of the UDP channel

## Best next follow-ups

1. **Delete-from-online-storage only** capture, matching the copy-only run.
2. **Overlay-only** capture (open overlay, toggle vibration once, close overlay).
3. Another short **click-from-list to picture-only** capture, but with explicit operator timing notes for:
   - click title
   - queue/server wait begins
   - first visible picture
4. Any future note-taking or broker correlation that can align user action timestamps against these segmented host/port families.
