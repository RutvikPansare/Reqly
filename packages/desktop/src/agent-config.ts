import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ResolvedReqly } from './reqly-resolver';

/**
 * MCP config injection for the setup wizard (T-233).
 *
 * Mirrors the shapes written by `reqly setup` (src/server/setup-command.ts):
 * VS Code-macro editors (Cursor, Windsurf, VS Code) get
 * `--project-dir ${workspaceFolder}` so the server follows the open project;
 * standalone hosts (Claude Desktop) get plain `start` and the user points
 * Reqly at a project with `reqly use <path>`.
 */

export type AgentId = 'claude-desktop' | 'cursor' | 'windsurf' | 'vscode';

export interface AgentDef {
  id: AgentId;
  name: string;
  /** Absolute path to the agent's MCP config file for this platform. */
  configPath: string;
  /** Whether the agent's config dir exists (rough "is it installed" signal). */
  detected: boolean;
  /** Args written into the MCP entry. */
  args: string[];
}

export interface InjectResult {
  ok: boolean;
  message: string;
}

const WORKSPACE_ARGS = ['start', '--project-dir', '${workspaceFolder}'];
const STANDALONE_ARGS = ['start'];

function claudeDesktopConfigPath(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
}

function vscodeSettingsPath(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Code', 'User', 'settings.json');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
  }
  return path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');
}

export function listAgents(): AgentDef[] {
  const defs: Array<Omit<AgentDef, 'detected'>> = [
    {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      configPath: claudeDesktopConfigPath(),
      args: STANDALONE_ARGS,
    },
    {
      id: 'cursor',
      name: 'Cursor',
      configPath: path.join(os.homedir(), '.cursor', 'mcp.json'),
      args: WORKSPACE_ARGS,
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      configPath: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
      args: WORKSPACE_ARGS,
    },
    {
      id: 'vscode',
      name: 'VS Code',
      configPath: vscodeSettingsPath(),
      args: WORKSPACE_ARGS,
    },
  ];
  return defs.map(d => ({
    ...d,
    // "Installed" heuristic: the agent's config directory exists. The file
    // itself may not exist yet (fresh install) - that's fine, we create it.
    detected: fs.existsSync(path.dirname(d.configPath)),
  }));
}

function readJsonFile(filePath: string): { ok: true; data: any } | { ok: false; error: string } {
  if (!fs.existsSync(filePath)) return { ok: true, data: {} };
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.trim() === '') return { ok: true, data: {} };
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return { ok: false, error: 'existing config is not valid JSON (it may contain comments)' };
  }
}

/**
 * Merges the reqly MCP server entry into the agent's config file. Never
 * removes or rewrites other entries. Returns a human-readable result for the
 * wizard UI.
 */
export function injectMcpConfig(agentId: AgentId, resolved: ResolvedReqly): InjectResult {
  const agent = listAgents().find(a => a.id === agentId);
  if (!agent) return { ok: false, message: `Unknown agent: ${agentId}` };

  const entry = { command: resolved.command, args: agent.args };

  const parsed = readJsonFile(agent.configPath);
  if (!parsed.ok) {
    return {
      ok: false,
      message: `Could not update ${agent.name}: ${parsed.error}. Add this entry manually to ${agent.configPath}: "reqly": ${JSON.stringify(entry)}`,
    };
  }

  const config = parsed.data;
  if (agentId === 'vscode') {
    // VS Code keeps MCP servers under the "mcp.servers" setting.
    if (!config.mcp || typeof config.mcp !== 'object') config.mcp = {};
    if (!config.mcp.servers || typeof config.mcp.servers !== 'object') config.mcp.servers = {};
    config.mcp.servers.reqly = entry;
  } else {
    if (!config.mcpServers || typeof config.mcpServers !== 'object') config.mcpServers = {};
    config.mcpServers.reqly = entry;
  }

  try {
    fs.mkdirSync(path.dirname(agent.configPath), { recursive: true });
    fs.writeFileSync(agent.configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  } catch (e: any) {
    return { ok: false, message: `Could not write ${agent.configPath}: ${e.message}` };
  }

  const restartNote = 'Restart it to pick up the connection.';
  const useNote = agentId === 'claude-desktop'
    ? ' Then run `reqly use <your project path>` (or use the app) to point Reqly at a project.'
    : '';
  return { ok: true, message: `${agent.name} connected. ${restartNote}${useNote}` };
}

/** setupComplete flag in ~/.reqly/config.json suppresses the first-launch wizard. */
const REQLY_CONFIG = path.join(os.homedir(), '.reqly', 'config.json');

export function isSetupComplete(configPath: string = REQLY_CONFIG): boolean {
  try {
    return !!JSON.parse(fs.readFileSync(configPath, 'utf8')).setupComplete;
  } catch {
    return false;
  }
}

export function markSetupComplete(configPath: string = REQLY_CONFIG): void {
  let config: any = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    if (raw.trim() !== '') {
      try {
        config = JSON.parse(raw);
      } catch {
        // Corrupt-but-present config: refuse to overwrite, or we would wipe
        // every auth profile / workspace / secret-provider entry. Leaving the
        // flag unset just re-shows the wizard next launch (recoverable).
        return;
      }
    }
  }
  config.setupComplete = true;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}
