# Project overview

## Goal

Figure out what is publicly confirmable about modern PlayStation cloud streaming, reduce the unknowns that block an open-source thin client, and document a clean-room implementation path.

## Primary questions

1. What capabilities are officially claimed today across PS Plus on PC, PlayStation Portal, and related first-party surfaces?
2. Which parts of the stack appear reusable for a generic open-source client regardless of Sony-specific details?
3. Which unknowns remain service-specific: auth context, entitlements, session allocation, transport, encryption, trust, controller feature mapping, and quality adaptation?
4. What evidence can be collected safely through public docs, official login flows, static client inspection, and local metadata capture?

## Evidence tiers

- **Tier 1 — official/public**: PlayStation support pages, system software notes, official product pages.
- **Tier 2 — user-provided / community**: preliminary research dossier, app store claims, community posts, repo archaeology.
- **Tier 3 — local measurements**: artifacts gathered through this repo's scripts while exercising official surfaces on your own account/device.
- **Tier 4 — implementation hypotheses**: clean-room architecture and planned work based on Tier 1–3 evidence.

## Near-term outputs

- structured research docs under `docs/research/`
- repeatable artifact generation under `scripts/`
- testable public capability checks under `tests/`
- baseline implementation plan under `docs/implementation/`

## Success criteria for the current phase

- public claims are normalized into machine-readable artifacts
- experiments are tracked with explicit blockers and exit criteria
- official-login automation is possible without hardcoding secrets into the repo
- static and network instrumentation paths exist for sanctioned follow-up testing
- the implementation roadmap clearly separates generic OSS work from Sony-specific unknowns
