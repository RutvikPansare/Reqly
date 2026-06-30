import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { ParsedArgs } from './cli-parser.js';

export async function handleSetupCommand(parsed: ParsedArgs): Promise<number> {
  const target = parsed.args[0];

  if (target === '--help' || target === '-h') {
    console.log(`Usage: reqly setup [tool]

Supported tools: cursor, windsurf, claude, claudecode, gemini, antigravity

Project Directory Resolution:
- VS Code-based editors (cursor, windsurf) support the \`\${workspaceFolder}\` macro. Reqly will configure them to pass \`--project-dir \${workspaceFolder}\` so the server always points to your current editor window.
- Other tools (claude, claudecode, gemini, antigravity) do not support this macro. Reqly will omit the flag. Instead, you must run \`reqly use <path>\` in your project directory to set your default project manually.
`);
    return 0;
  }

  // Use `reqly` as the command (global install) with --project-dir so the server
  // always resolves collections relative to the user's actual project, not wherever
  // the AI tool happens to launch the process from.
  const mcpCommand = 'reqly';
  // ${workspaceFolder} is interpolated by Cursor and most MCP-aware editors at launch time.
  const mcpArgs = ['start', '--project-dir', '${workspaceFolder}'];
  // Tools that don't support it spawn one global server process shared across every project
  // so --project-dir can't be set per-project here. It's omitted and the user is told to run `reqly use` instead.
  const desktopMcpArgs = ['start'];

  const cursorConfigPath = path.join(os.homedir(), '.cursor', 'mcp.json');
  const windsurfConfigPath = path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json');
  const geminiConfigPath = path.join(os.homedir(), '.gemini', 'config', 'mcp.json');
  const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
  const claudeDesktopConfigPathMac = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  const getClaudeDesktopConfigPath = () => {
    if (process.platform !== 'win32') return claudeDesktopConfigPathMac;
    if (!process.env.APPDATA) {
      throw new Error(
        'APPDATA environment variable is not set. Cannot determine the Claude Desktop config path on Windows.'
      );
    }
    return path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json');
  };

  const setupJsonMcp = async (configPath: string, name: string, args: string[] = mcpArgs) => {
    try {
      let config: any = { mcpServers: {} };
      try {
        const data = await fs.readFile(configPath, 'utf8');
        config = JSON.parse(data);
      } catch (e) {}

      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers['reqly'] = { command: mcpCommand, args };

      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(`✅ ${name} configured successfully.`);
    } catch (e: any) {
      console.error(`❌ Failed to configure ${name}:`, e.message);
    }
  };

  const setupClaudeDesktop = async () => {
    let configPath: string;
    try {
      configPath = getClaudeDesktopConfigPath();
    } catch (e: any) {
      console.error('❌ Failed to configure Claude Desktop:', e.message);
      return;
    }
    await setupJsonMcp(configPath, 'Claude Desktop', desktopMcpArgs);
  };

  const printDesktopUseHint = (toolName: string) => {
    console.log(`\nNote for ${toolName}:`);
    console.log("  Run `reqly use <path>` inside your project to point Reqly at it.");
    console.log('  This tool does not support dynamic folder resolution, so this step is required.');
  };

  const setupCodex = async () => {
    try {
      let tomlStr = '';
      try {
        tomlStr = await fs.readFile(codexConfigPath, 'utf8');
      } catch (e) {}
      
      const newEntry = `\n[mcp_servers.reqly]\ncommand = "${mcpCommand}"\nargs = ${JSON.stringify(mcpArgs)}\n`;
      
      if (!tomlStr.includes('[mcp_servers.reqly]')) {
        tomlStr += newEntry;
        await fs.mkdir(path.dirname(codexConfigPath), { recursive: true });
        await fs.writeFile(codexConfigPath, tomlStr.trim() + '\n');
        console.log('✅ Codex configured successfully.');
      } else {
        console.log('✅ Codex already has reqly configured.');
      }
    } catch (e: any) {
      console.error('❌ Failed to configure Codex:', e.message);
    }
  };

  const printClaudeCode = () => {
    console.log('✅ For Claude Code (CLI), run this from inside your project directory:');
    console.log(`\n  claude mcp add reqly -- reqly start --project-dir .\n`);
    console.log('  The dot (.) tells Reqly to use the current folder as your project root.');
    console.log('  If your AI tool always launches reqly from the wrong directory, set the');
    console.log('  REQLY_PROJECT_DIR environment variable on the MCP server entry instead.');
  };

  console.log('Configuring Reqly MCP server...\n');

  if (target === 'cursor') {
    await setupJsonMcp(cursorConfigPath, 'Cursor', mcpArgs);
  } else if (target === 'windsurf') {
    await setupJsonMcp(windsurfConfigPath, 'Windsurf', mcpArgs);
    await setupCodex();
  } else if (target === 'claude') {
    await setupClaudeDesktop();
    printDesktopUseHint('Claude Desktop');
  } else if (target === 'gemini') {
    await setupJsonMcp(geminiConfigPath, 'Gemini', desktopMcpArgs);
    printDesktopUseHint('Gemini');
  } else if (target === 'antigravity') {
    await setupJsonMcp(geminiConfigPath, 'Antigravity', desktopMcpArgs);
    printDesktopUseHint('Antigravity');
  } else if (target === 'codex') {
    await setupCodex();
  } else if (target === 'claudecode') {
    printClaudeCode();
  } else {
    // All known tools
    await setupJsonMcp(cursorConfigPath, 'Cursor', mcpArgs);
    await setupJsonMcp(windsurfConfigPath, 'Windsurf', mcpArgs);
    await setupClaudeDesktop();
    printDesktopUseHint('Claude Desktop');
    await setupJsonMcp(geminiConfigPath, 'Gemini / Antigravity', desktopMcpArgs);
    printDesktopUseHint('Gemini / Antigravity');
    await setupCodex();
    printClaudeCode();
  }

  console.log('\nDone! Restart your AI tool and try saying "list my Reqly collections".');
  console.log('Tip: run `reqly app` to open the UI in your browser at any time.');
  return 0;
}
