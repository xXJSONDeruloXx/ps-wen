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

## What the deeper pass shows

1. This file is still clearly an **installer/bootstrapper**, not the runtime app itself.
2. The stub is **32-bit PE/COFF** even though the eventual installed app may or may not be 32-bit.
3. Multiple packaging fingerprints are present at once:
   - **WiX Burn** indicators such as:
     - `WixBundleOriginalSource`
     - `WixBundleName`
     - `BootstrapperApplicationCreate`
     - `WiX Toolset Bootstrapper`
     - `.wixburn`
   - **Advanced Installer / Caphyon** indicators such as:
     - `Advanced Installer Enhanced UI`
     - `Software\Caphyon\Advanced Installer\`
     - `AI_BOOTSTRAPPERLANGS`
     - `Advinst_Extract_`
   - a weak **NSIS**-looking raw magic clue (`+nsiS`) that is now lower-confidence than the WiX/Advanced Installer evidence
4. Embedded payload-name strings strongly suggest internal bundled artifacts such as:
   - `49F2978\FILES.7z`
   - `49F2978\PlayStationPlus.7z`
   - `PlayStationPlus-12.5.0.ini`
   - `vcredist_x86.exe`
   - language/resource DLLs such as `1033`-style / `20xx` / `30xx` DLL names
5. A 7z signature is present in the installer image at offset `3075240`, but carving it directly on macOS did not yield a trivially openable archive. That implies either additional wrapper/container logic or a nontrivial extraction layout.
6. The installer stub still did **not** immediately surface high-value runtime strings like `kamaji`, `psnow`, `auth.api.sony...`, `web.np.playstation...`, `electron`, or `app.asar`.

## Updated interpretation

- The best current read is that this is a **WiX Burn bootstrapper with Advanced Installer-branded/custom UX components** rather than a simple NSIS wrapper.
- The installer almost certainly carries additional payload archives/executables internally.
- The presence of a previously extracted Chromium **Media Internals** HTML resource suggests Chromium-related assets are somewhere in the broader installation chain, but the stub still does **not** prove the final app is Electron.

## Immediate next steps

1. Extract or observe the **installed app contents** rather than relying only on the installer stub.
2. Inspect installation behavior in a Windows VM or Wine/Proton-style environment and capture the unpacked directory tree.
3. Identify whether `PlayStationPlus.7z` / `FILES.7z` can be recovered directly with a more PE-aware extraction path.
4. Search the installed app, not just the installer, for:
   - `kamaji`
   - `oauth`
   - `psnow`
   - `playstation.com`
   - `auth.api.sonyentertainmentnetwork.com`
   - `webrtc`, `stun`, `turn`, `quic`
   - `app.asar`, `electron`, `chrome_elf`

## Evidence quality

These notes are still **bootstrapper-level** rather than runtime-app-level, but they are now strong enough to characterize the installer technology with moderate confidence.
