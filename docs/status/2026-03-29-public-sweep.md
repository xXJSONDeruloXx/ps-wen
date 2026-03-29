# Public capability sweep — 2026-03-29

## Commands

```bash
npm run research:public
npm run test:public
```

## Artifacts

- `artifacts/official-capabilities.json`
- `artifacts/raw/ps-plus-pc-support.html`
- `artifacts/raw/ps-portal-support.html`
- `artifacts/raw/ps-portal-system-software.html`
- `artifacts/raw/ps-plus-landing.html`

## Direct observations

### PS Plus on PC support
- current official support page is live
- wording confirms a dedicated PC app exists for streaming PS Plus games
- page text includes a **minimum 5 Mbps** requirement

### PlayStation Portal support
- generic Portal support page is live at the `psportal/` support path
- useful mostly as a canonical hardware support surface; deeper cloud-specific detail lives in the system software notes

### PS Portal system software notes
- current notes explicitly mention **cloud streaming**
- wording explicitly ties cloud streaming availability to **PlayStation Plus Premium members**
- notes mention a **1080p** quality option for cloud streaming / remote play contexts

### PS Plus landing page
- marketing page still mentions cloud streaming on the subscription surface
- text sample includes references to **1080p**, **4K**, **HDR**, **PC**, **Portal**, and **Remote Play**
- this page is useful for current claim collection, but it is less trustworthy than support docs for exact technical ceilings

## What this sweep changed

Raised confidence in:
- current first-party support for cloud streaming on PlayStation Portal
- the presence of a current PS Plus PC streaming surface
- public first-party wording around minimum bandwidth and quality claims

Did not resolve:
- modern transport choice
- entitlement/session allocation details
- whether current PC/client bundles still expose Electron/ASAR packaging
- token lifetime and re-auth behavior

## Next best actions

1. identify a stable `PSN_LOGIN_URL` for the official-login harness
2. run the login harness with local credentials once `.env` is filled
3. obtain a current official PC app bundle for static inventory
4. collect a metadata-only pcap during owned-account use of an official client surface
