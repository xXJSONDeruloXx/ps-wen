# Unknowns tracker

| Area | Question | Current confidence | Evidence today | Best next method | Blocking factor |
|---|---|---:|---|---|---|
| Auth | Which official login surface is most stable for automation? | Low | Preliminary research only | Run Playwright harness with local credentials | CAPTCHA / MFA / regional variations |
| Tokens | What token lifetime and refresh behavior show up during official use? | Low | Community references to re-auth prompts | Capture browser storage state and timestamps | Requires successful sign-in |
| Entitlements | Where are cloud-streaming entitlements exposed, if anywhere? | Low | Public marketing and support pages | Inspect post-login web traffic / official client bundle strings | Service surface may be app-only |
| Session allocation | Is there still a Kamaji-named control plane in modern clients? | Low | Community historical clues | Static bundle inventory + metadata capture | Need official app bundle or capture |
| Transport | Is modern cloud streaming WebRTC-like, custom UDP, or something else? | Low | Historical PS Now paper suggests non-WebRTC | Local pcap metadata capture while exercising an official client | Need supported client surface + capture |
| Video | What resolution / fps / HDR tiers are truly available by surface? | Medium | Public claims exist but need validation | Public-source collection + real session telemetry | Requires working official session |
| Input | Which controller features are mandatory? | Low | Community anecdotes | Controlled user-journey notes while launching titles | Requires real client access |
| PC app | Is the official PC app still Electron/ASAR based? | Low | Historical evidence only | Static bundle inventory on current installer | Need local installer/app files |
| Portal | Does Portal's cloud mode expose clues via software notes or captured metadata? | Medium | Official software notes confirm feature exists | Public page collection, then local observation if hardware is available | Requires hardware for deeper validation |
| Reconnect | How do sessions behave across network loss and region change? | Low | No direct evidence in repo yet | Future impairment lab after baseline session works | Requires successful baseline session |
