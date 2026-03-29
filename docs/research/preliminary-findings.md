# Preliminary findings

Seeded from the user-provided research dossier dated 2026-03-29.

## Baseline conclusion

There is still no well-known, fully open-source, end-to-end client for current PlayStation Plus Premium cloud streaming. The strongest evidence that third-party access is technically possible appears to come from:

- closed-source apps claiming PS cloud streaming support on Apple platforms
- Sony's own PlayStation Portal cloud streaming rollout
- historical PS Now traffic research suggesting Sony previously used a non-WebRTC, undocumented transport
- community-authored PSN OAuth references and PC client archaeology around Electron/ASAR packaging

## Strong evidence buckets

### Official
- PlayStation Portal system software updates confirm cloud streaming exists on a dedicated thin client surface.
- PlayStation support docs describe minimum and recommended bandwidth guidance for PC / remote-play-adjacent surfaces.

### Community but plausible
- Asobi and Portal app listings claim PS cloud-streaming support and expose settings that look like a real low-latency streaming stack.
- Community reports reference token expiry, server selection, bitrate choices, and controller limitations consistent with real integrations.
- Historical PS Now PC work indicates the official desktop client was at least partly Electron/ASAR-based, which makes static bundle archaeology practical.

### Historical measurement
- Published PS Now traffic analysis observed undocumented protocols and comparatively modest peak downstream bitrate.
- This is useful for framing hypotheses, but it is not proof that modern PS5-title cloud streaming uses the same transport.

## Most important unknowns

1. **Current transport family** — custom UDP vs WebRTC-like vs another stack.
2. **Session allocation API** — what device identity, entitlement, and region hints are required.
3. **Trust model** — whether certain surfaces depend on device attestation or additional client identity signals.
4. **Codec / quality ladder** — actual resolution, frame rate, HDR, and bitrate limits per client surface.
5. **Input parity** — touchpad, gyro, haptics, and launch-flow requirements.
6. **Token lifecycle** — refresh cadence, re-auth prompts, and session renewal behavior.

## Practical read on feasibility

A clean-room open-source effort looks most feasible if it starts as a generic cloud-gaming thin client with:
- a modular auth/session layer
- pluggable transport adapters
- a strong low-latency media pipeline
- controller-first input handling
- measurement-driven telemetry

The least feasible piece to assume in advance is the proprietary Sony integration boundary. That must remain a research stub until gathered evidence justifies a safe next step.
