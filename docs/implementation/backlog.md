# Research backlog

Prioritized next steps based on current evidence.

## Priority 1 — native PC app follow-up

1. **Done**: install and summarize the real Windows payload with:
   - `npm run inspect:pc-app`
   - `npm run auth:pc-app-summary`
2. Use the installed-app summary to track cache/profile drift after updates:
   - code-cache asset URLs (`apollo.js`, `vendor.js`, `js_ex.min.js`)
   - redacted `grc-response.html` handoff modes
   - roaming local/session-storage origin-key maps
3. Keep `npm run research:pc-app-assets` current when the app URL/build changes so the repo tracks the live public JS bundle surface.
4. Run a short metadata-only capture while the logged-in PC app is idle, then again during any real cloud-stream launch path that is available.
5. Compare capture hostnames against the newly observed native-client surfaces:
   - `psnow.playstation.com`
   - Sony account / risk hosts (`my.account.sony.com`, `ca.account.sony.com`, `h.online-metrix.net`, `skw.eve.account.sony.com`)
   - any Kamaji-like allocator paths hinted by the current `WEBDUID` cookie scope
6. Correlate localhost broker activity (`ws://localhost:1235/`) with the preload command surface:
   - `requestGame`
   - `startGame`
   - `isStreaming`
   - `isQueued`
   - controller/audio/mic commands
7. Keep further auth inspection redacted; summarize names, shapes, and lifetimes rather than exporting raw bearer material.

## Priority 2 — metadata capture on official surfaces

1. Run a short metadata-only capture while using:
   - signed-in Safari on Store / PSN pages
   - official PC app if installed
   - any supported cloud-streaming surface available to the user
2. Summarize DNS/TLS/QUIC hostnames with `npm run summarize:metadata -- <pcap>`.
3. Compare the hostnames against the browser-only list already collected.

## Priority 3 — account / control-plane mapping

1. Compare browser-observed web session markers with the PC app's QtWebEngine / Chromium storage surfaces.
2. Separate what is clearly reused web identity state (`my.account.sony.com`, Sony cookies, IndexedDB, fraud/risk origins) from what appears native-broker-specific (`localhost:1235`, preload command surface).
3. Determine whether any browser-observed control-plane hosts also appear during native launch / queue / stream allocation.
4. Treat the Store GraphQL surface and the PS Now / PS Plus PC shell as related but distinct research tracks.

## Priority 4 — generic OSS implementation prep

1. Expand the provider interfaces already started in `src/architecture/provider-types.ts` for:
   - identity bootstrap
   - profile/catalog queries
   - entitlements
   - session allocation
2. Start a minimal thin-client telemetry schema.
3. Build controller capability and session diagnostics matrices.
4. Keep machine-readable observations in `src/observations/playstation-web.ts` and `src/observations/playstation-plus-pc.ts` aligned with new evidence.
5. Extend the observation-backed provider prototype so more clean-room logic can develop against cached artifacts instead of live account traffic.
6. If further live GraphQL probing is needed, derive or otherwise confirm persisted hashes only for the small set of currently unprobed read-only bundle queries (`getExperienceId`, `getResolvedProduct`, `wcaRetrieveWishlist`) before issuing spaced requests.

## Priority 5 — cloud-stream specific validation

1. Validate actual cloud-streaming availability on owned/supported surfaces.
2. Record observed quality ladders, controller requirements, reconnect behavior, and error handling.
3. Only then narrow transport and media-pipeline assumptions.
