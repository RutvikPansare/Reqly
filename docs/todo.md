# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-110** GitHub Actions export for flows
  - `reqly export-flow <name> --format github-actions` CLI sub-command
  - Generates a GitHub Actions workflow YAML file at `.github/workflows/<flow-name>.yml` in the project root (creates the `.github/workflows/` directory if it doesn't exist)
  - Template:
    ```yaml
    name: <flow-name>
    on: [push, pull_request]
    jobs:
      flow:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - name: Install Reqly
            run: npm install -g @rutvikpansare123/reqly
          # If your flow tests a local server, add a step here to start it
          # - name: Start server
          #   run: npm run dev &
          - name: Start Reqly
            run: reqly start --project-dir . &
          - name: Run flow
            run: reqly run-flow <flow-name>
    ```
  - Substitutes the real flow name in `name:` and `run: reqly run-flow <flow-name>`
  - Prints confirmation: `Written to .github/workflows/<flow-name>.yml` and a one-line tip: `Add a 'Start server' step before 'Run flow' if your flow hits a local API`
  - MCP tool `export_flow_ci`: `{ flow: string, format: 'github-actions' }` - same output, writes the file and returns the path. Agents can wire up CI for a flow without the developer touching a terminal.
  - Express route: `POST /api/flows/:name/export-ci` with body `{ format: 'github-actions' }` - returns the generated YAML as a string (does not write to disk from the UI path - let the developer download or copy it)
  - Update `README.md` and `llms.txt` with the `export-flow` command and `export_flow_ci` MCP tool
  - No new dependencies needed - pure string templating

