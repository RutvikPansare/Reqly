# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-088** Collection-level variables - engine + MCP
  - Add optional `variables: Record<string, string>` to the collection metadata YAML (alongside existing `name`, `description` fields in the collection folder's `collection.yaml` or equivalent top-level file)
  - Update `CollectionManager` to read/write collection variables: `getCollectionVariables(collection)`, `setCollectionVariable(collection, key, value)`, `deleteCollectionVariable(collection, key)`
  - Update the variable resolver in `http-executor.ts` so substitution order is: collection vars > active env vars (collection wins on collision)
  - Add MCP tools: `get_variables` already exists for env vars - either extend it with an optional `collection` param or add `get_collection_variables` / `set_collection_variable` / `delete_collection_variable` tools (check existing tool names in `src/mcp/tools/` before deciding - avoid naming collisions)
  - Add Express routes: `GET /api/collections/:name/variables`, `PUT /api/collections/:name/variables/:key`, `DELETE /api/collections/:name/variables/:key`
  - TDD: write failing tests first for the resolver merge order and CollectionManager CRUD before touching the engine
  - Do NOT build the UI in this task - that is T-089

- [ ] **T-089** Collection-level variables - UI
  - Prerequisite: T-088 must be done first
  - Add a "Variables" section in the collection right-click context menu (or a "Collection Settings" modal triggered from the context menu) - same pattern as the existing environment variable editor
  - Show collection variables as an editable key-value table (same `KeyValueEditor` component used elsewhere)
  - Frame them as "Collection Variables - always available to requests in this collection, regardless of active environment" (not "env overrides")
  - The inherited headers / Variables tab in the request editor already shows active env vars - extend it to also show collection vars with source column = collection name so the developer sees exactly where each resolved value comes from

- [ ] **T-090** Collection-level auth - engine + MCP
  - Prerequisite: T-088 (collection YAML metadata store) should be done first so auth can share the same `collection.yaml` top-level file
  - Add optional `auth` field to collection metadata YAML: same shape as `RequestConfig.auth` (type, profileId or inline credentials)
  - Auth precedence at execution time: request-level auth (including explicit `type: none`) > collection auth > nothing. Explicit `type: none` on a request suppresses collection auth entirely
  - Update `http-executor.ts` to accept and apply collection auth as a fallback when the request has no auth configured
  - Update `run_request` and `run_collection` MCP tools to pass collection auth context through to the executor
  - Add MCP tools: `get_collection_auth`, `set_collection_auth`, `delete_collection_auth` - agents must be able to configure collection auth without touching the UI
  - Add Express routes: `GET /api/collections/:name/auth`, `PUT /api/collections/:name/auth`, `DELETE /api/collections/:name/auth`
  - TDD: failing tests first for the precedence logic (request none suppresses, request unset inherits, collection auth injects correct header)
  - Do NOT build UI in this task - that is T-091

- [ ] **T-091** Collection-level auth - UI
  - Prerequisite: T-090 must be done first
  - Add auth config to the "Collection Settings" modal introduced in T-089 (same modal, new "Auth" tab alongside "Variables")
  - Auth editor mirrors the request-level Auth tab: type selector (None / Bearer / API Key / Basic / OAuth2), inline credential fields or profile picker
  - Distinguish clearly in copy: "Auth set here applies to all requests in this collection unless a request overrides it"
  - Inherited headers panel (already built) reads collection auth as a source - extend it to show collection-auth-injected headers with source = "collection" instead of "profile"

- [ ] **T-086** Publish Reqly to npm
  - _in progress: full pre-publish checklist done. `npm test` (308/308 pass), root build verified (dist/ + shebang), `npm pack --dry-run` checked. Fixed a packaging bug: `.npmignore`'s `src/` rule wasn't excluding `src/ui/node_modules` (8516 files, 149.7MB unpacked) - replaced with a `files` allowlist in package.json (`dist`, `packages/reqly-middleware/src/{core,index,next}.ts`, `packages/reqly-middleware/package.json`, `README.md`, `llms.txt`), fixed `main` to point at `dist/server/index.js` (was `src/server/index.ts`), moved `tsx`/`typescript`/`vitest` to `devDependencies`. Tarball: 368.7kB / 155 files. Smoke test done via the existing global `reqly` link (already symlinked into this repo's `dist/`): `reqly --version` -> `1.0.5` matches package.json; `reqly start --project-dir <dir>` correctly binds 4242 and serves that dir's collections (verified against a temp empty dir); `reqly setup cursor` writes `~/.cursor/mcp.json` with `args: ["start", "--project-dir", "${workspaceFolder}"]` - correct. Noted separately (not fixed): `reqly status` reports `activeProject` from config.json rather than the live instance's actual served project dir - cosmetic, doesn't affect the MCP config or server behavior. Still needed: `npm login` + `npm publish --access public` - deferred, needs Rutvik's npm credentials and explicit go-ahead._
  - **Pre-publish checklist (do all before `npm publish`):**
    - Run `npm test` - all tests must pass
    - Run `npm run build` from the root - verify `dist/` is populated and `dist/server/index.js` has the `#!/usr/bin/env node` shebang
    - Run `cd src/ui && npm run build` - verify `dist/ui/` exists and is copied/referenced correctly by Express
    - Run `npm pack --dry-run` - inspect the file list. Must include `dist/`, `packages/reqly-middleware/`, `README.md`, `llms.txt`. Must NOT include `src/`, `example/`, `docs/`, `*.test.*`
    - Smoke test the packed binary: `npm install -g .` then `reqly --version`, `reqly status`, `reqly start` in a temp project dir
    - Verify `reqly setup cursor` writes the correct config with `--project-dir ${workspaceFolder}`
  - **Publish:**
    - `npm login` (as the reqly npm account)
    - `npm publish --access public`
    - Verify on `npmjs.com/package/reqly` that the page looks correct and version is right
  - **Post-publish:**
    - Test cold install on a clean machine or temp dir: `npm install -g reqly && reqly --version`
    - Tag the git commit: `git tag v<version> && git push --tags`
    - Note: `packages/reqly-middleware` is a separate npm package - publish it separately with `cd packages/reqly-middleware && npm publish --access public` after the main package

- [ ] **T-087** Homebrew tap for `brew install reqly`
  - **What:** a Homebrew tap lets Mac developers install Reqly without needing Node.js pre-installed, using the familiar `brew install` command. Requires the npm package (T-086) to be published first.
  - **Step 1 - Create the tap repo:**
    - Create a new GitHub repo named `homebrew-reqly` under the RutvikPansare account (must be named exactly `homebrew-reqly` for the tap to work)
    - Repo must be public
  - **Step 2 - Write the formula:**
    - Create `Formula/reqly.rb` in the repo:
      ```ruby
      class Reqly < Formula
        desc "Prompt-first, agent-native API client with MCP interface"
        homepage "https://github.com/RutvikPansare/reqly"
        url "https://registry.npmjs.org/reqly/-/reqly-<VERSION>.tgz"
        sha256 "<SHA256_OF_TARBALL>"
        license "MIT"

        depends_on "node"

        def install
          system "npm", "install", *Language::Node.std_npm_install_args(libexec)
          bin.install_symlink Dir["#{libexec}/bin/*"]
        end

        test do
          assert_match version.to_s, shell_output("#{bin}/reqly --version")
        end
      end
      ```
    - Get the tarball URL and SHA256: `npm pack` produces a `.tgz` - upload it to the GitHub release and get the SHA256 with `shasum -a 256 reqly-<version>.tgz`
    - Replace `<VERSION>` and `<SHA256_OF_TARBALL>` in the formula
  - **Step 3 - Test the formula locally before pushing:**
    - `brew install --build-from-source ./Formula/reqly.rb`
    - `brew test reqly`
    - `reqly --version`
  - **Step 4 - Push and verify:**
    - Push `Formula/reqly.rb` to the `homebrew-reqly` repo
    - Test the tap end-to-end: `brew tap RutvikPansare/reqly && brew install reqly`
    - Verify `reqly --version` and `reqly setup` work after brew install
  - **Install command for users after this is done:** `brew tap RutvikPansare/reqly && brew install reqly`
  - **Update README and llms.txt** to add the Homebrew install option alongside `npm install -g reqly`
  - **Prerequisite:** T-086 (npm publish) must be done first - the formula points at the npm tarball

