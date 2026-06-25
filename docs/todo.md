# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-068** Update README and llms.txt: Middleware SDK section
  - Part 1 (AI-writes-collection headline workflow) shipped - see docs/done.md.
  - Remaining: add once `reqly-middleware` (M5) ships. Document: `npm install reqly-middleware`, one-line setup per framework (Express, Fastify, Next.js), note that it works locally only (production requires the webhook tunnel), link to the tunnel docs
  - Blocked until the middleware SDK is built - docs-only, no code changes

- [ ] **T-067** `reqly exec` command + `exec_with_proxy` MCP tool
  - **Goal:** eliminate the manual `HTTP_PROXY=...` step. User replaces `npm run dev` with `reqly exec npm run dev` and everything is configured automatically.

  ### CLI: `reqly exec <command> [args...]`
  - Add `exec` as a new sub-command in `src/server/cli-parser.ts`
  - Flags:
    - `--port <number>` - proxy port, default 8080
    - `--collection <name>` - collection name to save captured requests into, default "Captured"
    - `--project-dir <path>` - same as other commands
  - Implementation in `src/server/exec-command.ts`:
    1. Start the proxy: instantiate `ProxyServer` and call `proxy.start(port, collectionName)`
    2. Spawn the user's command as a child process with `HTTP_PROXY` and `HTTPS_PROXY` injected into its env:
       ```ts
       const child = spawn(command, args, {
         env: { ...process.env, HTTP_PROXY: `http://localhost:${port}`, HTTPS_PROXY: `http://localhost:${port}` },
         stdio: 'inherit' // user sees the command's output normally in their terminal
       });
       ```
    3. `stdio: 'inherit'` is critical - the user sees `npm run dev` output exactly as normal
    4. On child process exit: stop the proxy, print summary: `Proxy stopped. Captured 14 requests into "Dabbr Captured".`
    5. Forward SIGINT (Ctrl+C) to the child process first, then stop the proxy after it exits
  - Example usage:
    ```
    reqly exec npm run dev
    reqly exec --collection "Dabbr API" --port 8888 npm run dev
    reqly exec python manage.py runserver
    ```

  ### MCP tool: `exec_with_proxy`
  - New file: `src/mcp/tools/exec-with-proxy.ts`
  - The tool always attempts to spawn the command itself as a detached background process. Only if spawning fails (permission error, binary not found, etc.) does it fall back to returning the command string for the user to run manually. Agents should never pre-emptively tell the user to run the command - try first, ask only if it fails.
  - Input:
    ```ts
    {
      command: string,      // e.g. "npm run dev" - the command to run with proxy injected
      collection?: string,  // collection name, default "Captured"
      port?: number         // proxy port, default 8080
    }
    ```
  - Implementation:
    1. Start the proxy (`ProxyServer.start(port, collection)`)
    2. Spawn the command as a detached background process with proxy env vars injected:
       ```ts
       const child = spawn(command, args, {
         env: { ...process.env, HTTP_PROXY: `http://localhost:${port}`, HTTPS_PROXY: `http://localhost:${port}` },
         detached: true,
         stdio: ['ignore', 'pipe', 'pipe'] // capture stdout/stderr to a log file
       });
       // write stdout/stderr to ~/.reqly/exec.log so user can inspect if needed
       child.unref(); // don't block the MCP process
       ```
    3. Store the child pid in the lock file alongside the proxy state
    4. On spawn success, return:
       ```ts
       {
         ok: true,
         spawned: true,
         pid: child.pid,
         port: 8080,
         collection: "Dabbr API",
         logFile: "/Users/Rutvik/.reqly/exec.log",
         message: "Started 'npm run dev' (pid 12345) with proxy on port 8080. Output is in ~/.reqly/exec.log. Call stop_proxy when done capturing."
       }
       ```
    5. On spawn failure (catch the error), return:
       ```ts
       {
         ok: true,
         spawned: false,
         port: 8080,
         collection: "Dabbr API",
         fallbackCommand: "reqly exec --collection 'Dabbr API' --port 8080 npm run dev",
         message: "Proxy started on port 8080 but could not start 'npm run dev' automatically (reason: <error>). Ask the user to run: reqly exec --collection 'Dabbr API' --port 8080 npm run dev"
       }
       ```
    - Agents must check `spawned` in the response. If `true`, tell the user "I've started everything, use your app now." If `false`, show `fallbackCommand` to the user.
  - **`stop_proxy` MCP tool** (already exists) should also kill the child pid stored from `exec_with_proxy` if present, so the agent can cleanly stop both the proxy and the dev server in one call
  - Register in `src/mcp/server.ts` alongside the other tools
  - **Tests (mandatory):** `src/mcp/tools/exec-with-proxy.test.ts` - mock `spawn`, assert proxy starts, assert correct env vars injected, assert pid returned in output
