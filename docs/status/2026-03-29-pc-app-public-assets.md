# PlayStation Plus PC app public asset inventory — 2026-03-29

## Commands

```bash
npm run research:pc-app-assets
```

## Artifact

- `artifacts/public/playstation-plus-pc-app-asset-inventory.json`

## What this does

This script uses the current installed PC-app surface summary to fetch the **public JS assets** referenced by the live app URL discovered from the running Windows client:

- `https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/apollo.js`
- `https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/vendor.js`
- `https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/js_ex.min.js`

These assets are public static files, so they can be analyzed without exporting app cookies or replaying authenticated requests.

## Direct findings

### 1. Current public PC-app assets still embed Kamaji / PS Now API naming

Observed in the live public asset set:

- `kamaji/api/`
- `kamaji/api/psnow/00_09_000/`
- `kamaji/api/swordfish/00_09_000/`
- `psnow.playstation.com/kamaji/api/`

This materially raises confidence that **Kamaji-named control-plane code paths still exist in the current PC app generation**.

### 2. Current public assets expose PC Now / Chihiro / account API path families

Observed path families include:

- `psnow.e1-np.playstation.com/store/api/pcnow/00_09_000/container/...`
- `store.playstation.com/store/api/chihiro/00_09_000/container/...`
- `api.playstation.com/v1/users/me/lists`
- `api.playstation.com/api/v2/accounts/me/attributes`
- `psnow.playstation.com/psnow/view-2.0/category`

Interpretation:

- the PC app frontend still carries a mix of:
  - PS Now-specific content APIs
  - Store/Chihiro paths
  - generic account/user API paths
- this is a broader surface than the Store GraphQL workstream alone

### 3. Current public assets expose stream / queue / session telemetry vocabulary

Observed terms include:

- `clientSessionId`
- `streamSessionId`
- `queuePosition`
- `waitTimeEstimate`
- `closeStream`
- `accessToken`
- `subscriptionSku`
- `isMember`

Interpretation:

- even without executing a stream, the public frontend bundle already tells us the app is built around explicit stream-session and queue state
- this gives us better names for future metadata-capture correlation

### 4. Current public assets expose telemetry/event namespaces used by the PC app shell

Observed namespaces/signals include:

- `apollo2`
- `blackbird`
- `kamaji`
- `monaco`
- `titan`
- `Click`
- `Impression`
- `PageView`
- `UserFacingError`
- `VideoStream`

This strongly suggests the PC app frontend was built with a rich internal telemetry/event schema rather than a minimal static launcher.

### 5. Current public assets also expose more first-party hosts than the browser-only Store workstream

Representative hostnames found in the live public asset set include:

- `psnow.playstation.com`
- `psnow.e1-np.playstation.com`
- `psnow.mgmt.playstation.com`
- `api.playstation.com`
- `store.playstation.com`
- `apollo.dl.playstation.net`
- `apollo.e1-np.ac.playstation.net`
- `apollo2.e1-np.ac.playstation.net`
- `image.api.e1-np.km.playstation.net`
- `smetrics.aem.playstation.com`
- `theia.dl.playstation.net`
- `theia.e1-np.dl.playstation.net`

## Practical takeaway

We now have three complementary native-PC evidence layers:

1. **Installed app shell**
   - Electron/ASAR
   - localhost broker on `1235`
   - app URL on `psnow.playstation.com/app/...`
2. **Local profile/cache evidence**
   - QtWebEngine + Chromium auth state
   - redacted `grc-response.html` handoff modes
   - Sony account / risk / telemetry origins
3. **Current public JS assets**
   - Kamaji API naming
   - PC Now container paths
   - Chihiro/store paths
   - queue/stream/session telemetry vocabulary

That is enough to say the native-PC workstream is now clearly centered on the **PS Now / Kamaji / PC Now** app lineage rather than the Store web shell alone.

## Best next step

The next high-value experiment is still metadata capture during a real native flow, because we now know what to look for:

- Kamaji-like hosts or paths
- queue/session terms
- `api.playstation.com` account/user calls
- `psnow.e1-np.playstation.com` / `psnow.mgmt.playstation.com`
- localhost broker activity around `requestGame`, `startGame`, and `closeStream`
