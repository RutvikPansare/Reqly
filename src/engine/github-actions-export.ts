// Generates a GitHub Actions workflow YAML that installs Reqly and runs a
// named flow in CI. Pure string templating - no YAML library needed since
// the only variable parts are plain identifiers (flow names), not values
// that need escaping for this fixed template shape.
export function generateGithubActionsWorkflow(flowName: string): string {
  return `name: ${flowName}
on: [push, pull_request]
jobs:
  flow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Reqly
        run: npm install -g getreqly
      # If your flow tests a local server, add a step here to start it
      # - name: Start server
      #   run: npm run dev &
      - name: Start Reqly
        run: reqly start --project-dir . &
      - name: Run flow
        run: reqly run-flow ${flowName} --reporter junit > results.xml
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: results
          path: results.xml
`;
}
