# NPSSO acquisition without the Sony PC app — 2026-03-30

## Conclusion

NPSSO is **not generated locally** by the client. It is issued by Sony after a
real account login. That means the viable app-free path is:

1. open an official Sony/PlayStation web login surface
2. complete real user sign-in (and MFA if required)
3. capture the resulting browser cookie jar
4. extract the `npsso` cookie from that browser state

So the solution is **retrieval from an official browser login session**, not
local generation.

## What was added

### `scripts/auth/manual-psn-login.ts`

The headed Playwright login helper now explicitly reports whether NPSSO was
captured in the resulting browser context.

It writes:

- `artifacts/auth/playstation-storage-state.json`
- `artifacts/auth/manual-login-dump.json`
- `artifacts/auth/playstation-auth-summary.json`
- `artifacts/auth/manual-login-final.png`

The dump now includes:

- `npssoPresent`
- `npssoLength`
- `npssoDomain`

### `scripts/auth/extract-npsso.ts`

New helper that reads a Playwright storage-state JSON file and reports whether
an `npsso` cookie exists.

Command:

```bash
npm run auth:extract-npsso
npm run auth:extract-npsso -- --storage-state artifacts/auth/playstation-storage-state.json
npm run auth:extract-npsso -- --show
```

Default behavior only prints a masked preview.

### `scripts/lib/psn-auth.ts`

Added:

- `readNpssoFromStorageState(storageStatePath)`
- `resolveNpsso({ explicitNpsso, storageStatePath, ... })`

Resolution order:

1. explicit `--npsso`
2. Playwright `--storage-state`
3. legacy Sony app cookie DB fallback

### `scripts/api/psn-direct-cli.ts`

All direct auth/session commands can now source NPSSO from Playwright
storage-state using:

```bash
npm run api:psn-direct -- token --storage-state artifacts/auth/playstation-storage-state.json
npm run api:psn-direct -- profile --storage-state artifacts/auth/playstation-storage-state.json
npm run api:psn-direct -- session --storage-state artifacts/auth/playstation-storage-state.json
```

## Positive proof

A synthetic Playwright-style storage-state file containing the current NPSSO was
used to verify both:

1. `auth:extract-npsso` correctly finds and reports the cookie
2. `api:psn-direct -- token --storage-state <file>` successfully exchanges that
   NPSSO for a live bearer token

So the repo now supports the exact data shape produced by Playwright browser
login capture.

## Practical app-free flow

```bash
npm run auth:psn-headed
# log in manually in browser

npm run auth:extract-npsso

npm run api:psn-direct -- status --storage-state artifacts/auth/playstation-storage-state.json
npm run api:psn-direct -- profile --storage-state artifacts/auth/playstation-storage-state.json
npm run api:psn-direct -- entitlements --storage-state artifacts/auth/playstation-storage-state.json
```

## Important constraint

This is app-free relative to the **Sony PC app**, but not login-free:

- the user still must authenticate to Sony
- NPSSO still comes from Sony's official identity system
- MFA / CAPTCHA / risk checks may affect the login flow

## Bottom line

We now have a credible app-free NPSSO acquisition path:

- official browser login
- Playwright storage-state capture
- NPSSO extraction
- direct Kamaji/API use from that NPSSO

That removes the Sony PC app as a dependency for the auth/session bootstrap
layer.
