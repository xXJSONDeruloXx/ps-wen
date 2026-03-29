# Research backlog

Prioritized next steps based on current evidence.

## Priority 1 — obtain the real PC app payload

1. Install `PlayStationPlus-12.5.0.exe` in a Windows VM or compatible environment.
2. Capture the installed directory tree and hashes.
3. Run `npm run inspect:bundle` against any `.asar` or extracted app directory that appears.
4. Search the installed app for:
   - `kamaji`
   - `oauth`
   - `psnow`
   - `web.np.playstation.com`
   - `auth.api.sonyentertainmentnetwork.com`
   - `app.asar`, `electron`, `chrome_elf`
   - transport hints: `webrtc`, `stun`, `turn`, `quic`, `srtp`

## Priority 2 — metadata capture on official surfaces

1. Run a short metadata-only capture while using:
   - signed-in Safari on Store / PSN pages
   - official PC app if installed
   - any supported cloud-streaming surface available to the user
2. Summarize DNS/TLS/QUIC hostnames with `npm run summarize:metadata -- <pcap>`.
3. Compare the hostnames against the browser-only list already collected.

## Priority 3 — account / control-plane mapping

1. Compare browser-observed web session markers with installed PC client strings.
2. Determine whether browser control-plane hosts appear in the native client.
3. Separate likely reusable web identity flows from likely native-only session allocators.

## Priority 4 — generic OSS implementation prep

1. Expand the provider interfaces already started in `src/architecture/provider-types.ts` for:
   - identity bootstrap
   - profile/catalog queries
   - entitlements
   - session allocation
2. Start a minimal thin-client telemetry schema.
3. Build controller capability and session diagnostics matrices.
4. Keep machine-readable observations in `src/observations/playstation-web.ts` aligned with new evidence.
5. Extend the observation-backed provider prototype so more clean-room logic can develop against cached artifacts instead of live account traffic.

## Priority 5 — cloud-stream specific validation

1. Validate actual cloud-streaming availability on owned/supported surfaces.
2. Record observed quality ladders, controller requirements, reconnect behavior, and error handling.
3. Only then narrow transport and media-pipeline assumptions.
