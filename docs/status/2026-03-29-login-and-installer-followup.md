# Login + installer follow-up — 2026-03-29

## Official login harness findings

### Commands tried

```bash
HEADLESS=true PSN_LOGIN_URL='https://web.np.playstation.com/api/session/v1/signin?redirect_uri=https%3A%2F%2Fstore.playstation.com%2F' npm run test:psn-login
```

### Direct observations

- The Sony-hosted sign-in flow is reachable and can be driven at least through the basic email/password screens.
- The first automated version was brittle because the password-page submit button remained disabled until the page accepted the input sequence.
- After adjusting typing behavior, the flow reached the PlayStation Store successfully enough to load the signed-in store shell, but the prior assertion (`Sign In` button must disappear) was too strict because the store keeps a top-level sign-in control visible even when session cookies are present.

### What changed

- Confidence increased that a **user-assisted headed flow** is the best near-term path for capturing cookies and storage cleanly.
- A dedicated headed helper (`npm run auth:psn-headed`) is now the preferred next step.
- The first helper heuristic produced a false positive on a public PlayStation Network page, so the helper was tightened to wait for stronger auth signals or a longer manual window before capture.
- The user later supplied a more precise manual entry URL on `my.account.sony.com/sonyacct/signin/...`; this is now documented as the preferred web auth entry surface for manual capture.

## PC installer first pass

### Artifact

- `~/Downloads/PlayStationPlus-12.5.0.exe`

### Commands tried

```bash
file ~/Downloads/PlayStationPlus-12.5.0.exe
shasum -a 256 ~/Downloads/PlayStationPlus-12.5.0.exe
7z l ~/Downloads/PlayStationPlus-12.5.0.exe
objdump -x ~/Downloads/PlayStationPlus-12.5.0.exe
```

### Direct observations

- The download is a **32-bit Windows PE installer** labeled `PlayStation Plus Installer` version `12.5.0.0`.
- A first-pass string and archive sweep suggests an **installer stub** rather than the full runtime app.
- Embedded clues include:
  - `+nsiS` → consistent with **NSIS-style** packaging signals
  - a Chromium **Media Internals** HTML resource extracted during a partial archive pass
- The installer stub itself did **not** immediately expose high-value runtime strings like `kamaji`, `psnow`, `auth.api.sony...`, or `app.asar`.

### What changed

- We now have a concrete official PC installer artifact and hash.
- Next best target is the **installed payload or unpacked app directory**, not the stub alone.
