# PlayStation Plus PC app metadata capture — 2026-03-29

## Commands used

```powershell
npm run capture:metadata:windows
npm run summarize:metadata -- artifacts/network/ps-cloud-metadata-20260329-164212.pcapng
npm run summarize:metadata -- artifacts/network/ps-cloud-metadata-20260329-165742.pcapng
$env:CAPTURE_DURATION='1200'
$env:CAPTURE_FILE_SIZE_MB='1024'
npm run capture:metadata:windows
npm run summarize:metadata -- artifacts/network/ps-cloud-metadata-20260329-171205.pcapng
$env:CAPTURE_DURATION='420'
$env:CAPTURE_FILE_SIZE_MB='2048'
$env:CAPTURE_WINDOWS_PORTS='all'
npm run capture:metadata:windows
npm run summarize:metadata -- artifacts/network/ps-cloud-metadata-20260329-194536.pcapng
```

## What changed

Four sanctioned Windows `pktmon` captures were completed from an elevated PowerShell session and summarized locally.

The repo now also has a built-in pcapng metadata summarizer, so capture summaries no longer hard-stop when `tshark` is missing.

## Artifacts

Local-only generated artifacts:

- `artifacts/network/ps-cloud-metadata-20260329-164212.pcapng`
- `artifacts/network/ps-cloud-metadata-20260329-164212.summary.json`
- `artifacts/network/ps-cloud-metadata-20260329-165742.pcapng`
- `artifacts/network/ps-cloud-metadata-20260329-165742.summary.json`
- `artifacts/network/ps-cloud-metadata-20260329-171205.pcapng`
- `artifacts/network/ps-cloud-metadata-20260329-171205.summary.json`
- `artifacts/network/ps-cloud-metadata-20260329-194536.pcapng`
- `artifacts/network/ps-cloud-metadata-20260329-194536.summary.json`

## Capture 1: `ps-cloud-metadata-20260329-164212`

### Strong signal

The first successful capture included both:

- DNS query for `psnow.playstation.com`
- TLS SNI `psnow.playstation.com`

Observed mapping in the local summary:

- `psnow.playstation.com` -> `23.213.71.109`

This is the first actual on-wire confirmation in this repo that the installed Windows client still reaches the `psnow.playstation.com` control surface during a sanctioned live capture window.

### What it did **not** show

This capture did **not** yet show explicit hostname evidence for:

- `api.playstation.com`
- `psnow.e1-np.playstation.com`
- `psnow.mgmt.playstation.com`
- a Kamaji-named host
- a distinct allocator / queue / stream transport host

So the capture supports the already-known PS Now lineage, but it does **not** yet close the session-allocation or transport questions.

### Noise level

The capture also included unrelated traffic from other local activity, including domains such as:

- `api.github.com`
- `api.individual.githubcopilot.com`
- `login.live.com`
- `assets.msn.com`
- `catalog.gamepass.com`
- other Akamai / Microsoft / Google / Steam discovery hostnames

Interpretation:

- the capture window was valid
- but it was **not isolated** to the PlayStation Plus app
- result quality is still good enough to confirm `psnow.playstation.com`, but not clean enough to infer a full native control-plane graph

## Capture 2: `ps-cloud-metadata-20260329-165742`

The second shorter capture did **not** produce an explicit PlayStation hostname in DNS or TLS SNI.

It did include a small unlabeled HTTPS conversation to the same IP seen in capture 1:

- `23.213.71.109`

But because there was no matching DNS/SNI evidence in that run, it is treated only as a weak correlation, not a confirmed PlayStation hostname hit for that second capture.

## Capture 3: `ps-cloud-metadata-20260329-171205`

A wider capture window produced a materially richer PlayStation/Sony surface even without a live Premium stream session.

### Strong signals newly observed on the wire

This run again confirmed:

- `psnow.playstation.com` DNS + TLS SNI

But it also added first local metadata hits for several additional PlayStation/Sony families, including:

- `ca.account.sony.com`
- `commerce.api.np.km.playstation.net`
- `download-psnow.playstation.com`
- `merchandise.api.playstation.com`
- `web.np.playstation.com`
- `theia.dl.playstation.net`
- `cc.prod.gaikai.com`
- `cdn-a.sonyentertainmentnetwork.com`

The most important new clues are:

- `commerce.api.np.km.playstation.net`
  - shows a live `km.playstation.net` family on the wire, which matches the broader PS Now / Kamaji-style lineage already inferred from the public app assets
- `cc.prod.gaikai.com`
  - gives a fresh local on-wire Gaikai-era hostname hit from the current Windows client
- `web.np.playstation.com`
  - confirms the browser/control-plane host seen in cached profile state also appears in sanctioned native-app metadata capture

### What this still does not prove

Even with the wider capture window, this still does **not** prove a real entitled stream path because we still lack:

- queue placement evidence
- allocator-specific hostnames
- session bootstrap identifiers from a successful launch
- live media/transport channel evidence

So the capture improves the control-plane map substantially, but it does not replace a real queue/start observation.

## Capture 4: `ps-cloud-metadata-20260329-194536`

This is the first sanctioned **all-port** Windows capture taken during a real stream-capable session after Premium was purchased and while the user actually:

- re-entered the app
- started a game
- opened the stream overlay
- toggled vibration
- copied save data to online storage
- deleted save data from online storage
- quit the game from the overlay

### New host families observed on the wire

This run added first local hits for additional PlayStation/Gaikai families, including:

- `accounts.api.playstation.com`
- `client.cc.prod.gaikai.com`
- `config.cc.prod.gaikai.com`
- `vulcan.dl.playstation.net`

It also re-confirmed:

- `psnow.playstation.com`
- `commerce.api.np.km.playstation.net`
- `cc.prod.gaikai.com`
- `web.np.playstation.com`
- `ca.account.sony.com`
- `download-psnow.playstation.com`
- `theia.dl.playstation.net`

### Strongest new transport clue

The updated built-in summarizer now surfaces high-volume non-standard transport candidates. This run showed:

- `UDP 104.142.165.13:2053`
  - `bytesOut=1459790`
  - `bytesIn=383127222`
  - `packetsOut=20043`
  - `packetsIn=501144`
- `UDP 104.142.165.134:2053`
  - `bytesOut=629706`
  - `bytesIn=9504176`
  - `packetsOut=526`
  - `packetsIn=6562`

Those are the first repo-local observations that look like actual **live stream transport**, not just HTTPS control plane.

### Ownership clue for the UDP transport block

A manual RDAP lookup for `104.142.165.13` placed it inside:

- `104.142.128.0/17`
- network name: `SBS-V4-3`
- registrant: `Sony Interactive Entertainment LLC`

Interpretation:

- the large UDP/2053 traffic is not random CDN noise
- it is consistent with a Sony-owned streaming/media transport path

### What this means

This is the strongest evidence so far that the modern PC client still uses a **Gaikai/PS Now-descended control plane plus a custom UDP streaming path**.

It does **not** yet fully answer:

- exact session-allocation request/response shapes
- exact mapping between `client.cc` / `config.cc` / UDP endpoints
- whether the UDP channel multiplexes media/control/input or separates them further
- codec/framing/encryption details

But it moves the project from "transport unknown" to "custom UDP strongly indicated by live stream-phase capture."

## Net result

We now have a much better-grounded model:

1. **Static/runtime evidence** says the app launches an Electron shell on `https://psnow.playstation.com/app/...`.
2. **Public JS assets** still expose Kamaji / PC Now / account API structure.
3. **Live metadata capture** confirms on-wire activity for `psnow.playstation.com`, `accounts.api.playstation.com`, `commerce.api.np.km.playstation.net`, `client.cc.prod.gaikai.com`, `config.cc.prod.gaikai.com`, `web.np.playstation.com`, `download-psnow.playstation.com`, `theia.dl.playstation.net`, and `vulcan.dl.playstation.net`.
4. **A real stream-phase all-port capture** now shows large non-443 UDP traffic to Sony-owned `104.142.128.0/17` endpoints on port `2053`.

That materially strengthens the claim that the installed PC client is still anchored to the PS Now / Kamaji / Gaikai-era control-plane family and likely uses a custom UDP transport during live streaming.

## Best next capture

The next highest-value follow-up is no longer a generic startup capture. It is a **shorter segmented all-port capture** that isolates one stream lifecycle edge at a time:

1. start capture just before game launch
2. stop soon after picture appears
3. repeat separately for:
   - opening overlay
   - save sync actions
   - quit-game flow
4. compare host/port deltas across the shorter captures

That should help separate allocator/bootstrap traffic from the long-lived media transport channel.
