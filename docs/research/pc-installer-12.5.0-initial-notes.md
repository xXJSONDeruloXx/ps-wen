# PlayStation Plus PC installer 12.5.0 — initial notes

**Artifact**: `~/Downloads/PlayStationPlus-12.5.0.exe`

## Hash and file identity

- SHA-256: `f7a7589b60c84ad5e32757bf4207c85af136c0e9acf68a92a9433abd47384f18`
- `file`: `PE32 executable (GUI) Intel 80386, for MS Windows`
- Version metadata from `7z l`:
  - Company: `Sony Interactive Entertainment Inc.`
  - Product: `PlayStation Plus`
  - File description: `PlayStation Plus Installer`
  - File version: `12.5.0.0`
  - Copyright year in metadata: `2025`

## What the first pass shows

1. This file is an **installer stub**, not obviously the main app payload itself.
2. The stub is **32-bit PE/COFF** even though the eventual installed app may or may not be 32-bit.
3. Archive tooling sees:
   - a PE image with an overlay/payload region
   - a strong **NSIS** clue from embedded string `+nsiS`
   - a nested resource that extracts to Chromium's **Media Internals** HTML page (`[0]~`), which implies Chromium-related assets are present somewhere in the installer resource set
4. A simple ASCII/UTF-16 string sweep did **not** immediately surface high-value service strings like `kamaji`, `psnow`, `auth.api.sony...`, `web.np.playstation...`, `electron`, or `app.asar` in the installer stub itself.

## Low-confidence interpretation

- The installer may be NSIS or NSIS-like and could be downloading or unpacking the actual app payload later.
- The presence of Chromium media internals content is consistent with a Chromium/Electron/WebView-style component somewhere in the overall app chain, but the installer stub alone does not prove the shipped client is Electron.

## Immediate next steps

1. Extract or observe the **installed app contents** rather than relying only on the installer stub.
2. Run a dedicated metadata script over the installer and save structured JSON.
3. If available, inspect installation behavior in a Windows VM or Wine/Proton-style environment and capture the unpacked directory tree.
4. Search the installed app, not just the installer, for:
   - `kamaji`
   - `oauth`
   - `psnow`
   - `playstation.com`
   - `auth.api.sonyentertainmentnetwork.com`
   - `webrtc`, `stun`, `turn`, `quic`
   - `app.asar`, `electron`, `chrome_elf`

## Evidence quality

These notes are strictly **first-pass installer metadata**. They are useful for triage, but not yet enough to characterize the actual runtime app stack.
