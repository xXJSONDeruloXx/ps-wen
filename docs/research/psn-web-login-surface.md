# PSN web login surface

This note captures the current browser-oriented PlayStation sign-in surface the user provided for manual testing.

## Current entry surface

Observed host and path:

- `https://my.account.sony.com/sonyacct/signin/`

Observed stable-looking parameters in the provided example:

- `response_type=code`
- `client_id=e4a62faf-4b87-4fea-8565-caaabb3ac918`
- `scope=web:core`
- `access_type=offline`
- `service_entity=urn:service-entity:psn`
- `ui=pr`
- `auth_ver=v3`
- `no_captcha=true`

Observed redirect chain structure:

1. browser opens `my.account.sony.com/sonyacct/signin/`
2. successful auth should redirect through:
   - `https://web.np.playstation.com/api/session/v1/session`
3. the nested `redirect_uri` in the user-provided example points onward to:
   - `https://io.playstation.com/central/auth/login?...`
4. that page carries a final `postSignInURL` back to:
   - `https://www.playstation.com/en-us/playstation-network/`

## Important dynamic parameters

The following fields appeared in the example but should be treated as **ephemeral per run** and not hardcoded in docs or tests:

- `duid`
- `state`
- `cid`

## Why this matters

This is useful evidence for the **web control plane** because it confirms:

- Sony is using an **authorization-code style** browser flow.
- The current web entry surface is anchored on `my.account.sony.com`, not just `web.np.playstation.com`.
- The flow explicitly requests **offline** access in the browser context.
- A nested redirect chain exists between Sony account login, `web.np.playstation.com` session materialization, and a PlayStation web surface.

## What this does not prove

- It does **not** prove the cloud-streaming client uses the same exact OAuth client or scopes.
- It does **not** reveal media-plane transport details.
- It does **not** prove the web sign-in artifacts are sufficient for native-client cloud session startup.

## Immediate repo implications

- The headed manual auth helper should accept this full URL directly.
- The auth summary tooling should record **host/path and key names only**, not raw token-like values.
- Future native-client comparisons should check whether the same `client_id`, scopes, or redirect hosts appear in PC client artifacts.
