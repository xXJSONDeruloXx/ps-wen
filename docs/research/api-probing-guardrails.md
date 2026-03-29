# API probing guardrails

This repo now includes a browser-session API probe path for first-party PlayStation web surfaces.

## Allowed shape

- Use an already authenticated first-party browser session.
- Execute requests **inside Safari** via Apple Events JavaScript.
- Restrict probes to a small allowlist of **observed** first-party endpoints and persisted GraphQL operations.
- Keep raw responses local under `artifacts/`.
- Write only redacted summaries to tracked docs.

## Not allowed

- Exporting or printing raw cookie/token values into tracked files.
- Generalized fuzzing or broad endpoint discovery against authenticated surfaces.
- Blind mutation attempts.
- Replaying browser credentials outside the user-controlled browser session when a same-browser path exists.

## Current probe style

- read-only
- allowlisted
- evidence-backed
- local-artifact-first
