# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-077** OAuth 2.0 Flow (M4)
  - Full authorization code flow - not just static token storage
  - New `AuthType.OAUTH2 = 'oauth2'` in `src/types/auth.ts`
  - `AuthProfile.credentials` for oauth2: `{ clientId, clientSecret, authUrl, tokenUrl, redirectUri, scope, accessToken?, refreshToken?, expiresAt? }`
  - `AuthManager` gains `refreshOAuth2Token(profileId)` - POSTs to `tokenUrl` with `grant_type: refresh_token`, updates stored credentials in `~/.reqly/config.json`
  - `http-executor.ts`: before firing, if auth type is oauth2, check `expiresAt` - if expired or within 60s, call `refreshOAuth2Token` automatically
  - Authorization code flow initiation: `POST /api/auth/oauth2/start` opens the authUrl in the system browser (`open` / `xdg-open`), starts a temporary local callback server on a free port, captures the code, exchanges it for tokens, stores in the profile
  - UI Settings panel: OAuth2 profile editor with fields for clientId, clientSecret, authUrl, tokenUrl, scope; "Authorize" button that triggers the flow via `POST /api/auth/oauth2/start`
  - TDD: `auth-manager.test.ts` for token refresh logic (mock fetch); no TDD required for the browser-open step
