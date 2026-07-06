// T-226: formal workspace model. A named workspace groups multiple repos
// under stable aliases so flows can reference requests across repos.
// Stored at ~/.reqly/workspaces/<name>/workspace.yaml - machine-local,
// never committed to any repo. Alias names are stable across teammates;
// each developer links their own local path.

export interface WorkspaceRepo {
  /** Stable, team-shared name for the repo (e.g. "auth", "payments") */
  alias: string;
  /** Absolute local path to the repo on this machine */
  path: string;
}

export interface WorkspaceConfig {
  name: string;
  repos: WorkspaceRepo[];
  /** Variables shared across all repos in the workspace, resolved below env vars */
  sharedEnv?: Record<string, string>;
}
