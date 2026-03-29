# Test and model baseline — 2026-03-29

## Added in this step

### Unit tests
- `tests/unit/auth-summary.test.ts`
- `tests/unit/safari-endpoints.test.ts`

Covered logic:
- auth summary correctly treats `my.account.sony.com/sonyacct/signin/...` as **not** signed in even if cookies are present
- auth summary can classify a post-login store page as likely signed in
- Safari endpoint normalization extracts origin/path/query keys and GraphQL operation names
- hostname classification distinguishes control-plane, telemetry, content, and third-party hosts

### Machine-readable model files
- `src/observations/playstation-web.ts`
- `src/architecture/provider-types.ts`

These codify the current evidence into reusable constants and provider contracts so later implementation work does not have to be reconstructed from prose docs.

## Commands validated

```bash
npm run build
npm run test:unit
```

## Result

- compile passes
- unit tests pass
- repo now contains both narrative docs and code-level abstractions for the current evidence
