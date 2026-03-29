# Browser API pacing guidance

Authenticated browser-session probes should stay intentionally low volume.

## Principles

- Prefer cached artifact analysis before any new live request.
- Probe only observed, allowlisted endpoints.
- Use small subsets instead of full sweeps when validating one hypothesis.
- Keep several seconds between authenticated requests.
- Reuse prior artifacts whenever the question is already answered locally.

## Suggested usage

```bash
npm run api:playstation-web -- probe --ids io.user.details,session.redirect.session --delay-ms 4000
npm run api:playstation-web-summary artifacts/api/playstation-web-low-touch-report.json artifacts/api/playstation-web-low-touch-summary.json
```

## Why

The goal of this repo is evidence collection and clean-room planning, not aggressive endpoint exercise.
Low-touch pacing reduces unnecessary account activity while still letting us validate specific browser-side hypotheses.
