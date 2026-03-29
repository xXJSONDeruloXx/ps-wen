# PlayStation Plus PC app metadata capture — 2026-03-29

## Commands used

```powershell
npm run capture:metadata:windows
npm run summarize:metadata -- artifacts/network/ps-cloud-metadata-20260329-164212.pcapng
npm run summarize:metadata -- artifacts/network/ps-cloud-metadata-20260329-165742.pcapng
```

## What changed

Two sanctioned Windows `pktmon` captures were completed from an elevated PowerShell session and summarized locally.

The repo now also has a built-in pcapng metadata summarizer, so capture summaries no longer hard-stop when `tshark` is missing.

## Artifacts

Local-only generated artifacts:

- `artifacts/network/ps-cloud-metadata-20260329-164212.pcapng`
- `artifacts/network/ps-cloud-metadata-20260329-164212.summary.json`
- `artifacts/network/ps-cloud-metadata-20260329-165742.pcapng`
- `artifacts/network/ps-cloud-metadata-20260329-165742.summary.json`

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

## Net result

We now have a better-grounded model:

1. **Static/runtime evidence** says the app launches an Electron shell on `https://psnow.playstation.com/app/...`.
2. **Public JS assets** still expose Kamaji / PC Now / account API structure.
3. **Live metadata capture** now confirms that `psnow.playstation.com` appears on the wire during actual local app activity.

That materially strengthens the claim that the installed PC client is still anchored to the PS Now / Kamaji-era control-plane family.

## Best next capture

To get from "startup/control-surface confirmed" to "queue/allocator/transport mapped," the next capture should be cleaner:

1. close the PlayStation Plus app completely
2. close or reduce unrelated noisy apps if possible
3. start `npm run capture:metadata:windows` from elevated PowerShell
4. relaunch the PlayStation Plus app normally
5. if available, proceed far enough to hit:
   - login completion
   - queue placement
   - stream start / launch attempt
6. summarize again with `npm run summarize:metadata -- artifacts/network/<capture>.pcapng`

The highest-value missing evidence is still a real queue/start path, not another idle-only capture.
