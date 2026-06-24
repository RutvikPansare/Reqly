import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { ParsedArgs } from './cli-parser.js';

export async function handleSetupCommand(parsed: ParsedArgs): Promise<number> {
  const target = parsed.args[0];

  const binPath = process.argv[1] || 'reqly';
  // Use `node /path/to/dist/server/index.js` or just `reqly` if installed globally
  // We'll construct the command as `reqly` and args as `["start"]` assuming global installation
  const mcpCommand = 'reqly';
  const mcpArgs = ['start'];

  const cursorConfigPath = path.join(os.homedir(), '.cursor', 'mcp.json');
  const geminiConfigPath = path.join(os.homedir(), '.gemini', 'config', 'mcp.json');
  const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
  const claudeDesktopConfigPathMac = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  const claudeDesktopConfigPathWin = path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
  const claudeDesktopConfigPath = process.platform === 'win32' ? claudeDesktopConfigPathWin : claudeDesktopConfigPathMac;

  const setupJsonMcp = async (configPath: string, name: string) => {
    try {
      let config: any = { mcpServers: {} };
      try {
        const data = await fs.readFile(configPath, 'utf8');
        config = JSON.parse(data);
      } catch (e) {}
      
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers['reqly'] = { command: mcpCommand, args: mcpArgs };
      
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(`✅ ${name} configured successfully.`);
    } catch (e: any) {
      console.error(`❌ Failed to configure ${name}:`, e.message);
    }
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
    console.log('✅ For Claude Code (CLI), run the following command in your project directory:');
    console.log(`\n  claude mcp add reqly -- ${mcpCommand} ${mcpArgs.join(' ')}\n`);
  };

  console.log('Configuring Reqly MCP server...\n');

  if (target === 'cursor') {
    await setupJsonMcp(cursorConfigPath, 'Cursor');
  } else if (target === 'claude') {
    await setupJsonMcp(claudeDesktopConfigPath, 'Claude Desktop');
  } else if (target === 'gemini') {
    await setupJsonMcp(geminiConfigPath, 'Gemini');
  } else if (target === 'codex') {
    await setupCodex();
  } else if (target === 'claudecode') {
    printClaudeCode();
  } else {
    // All
    await setupJsonMcp(cursorConfigPath, 'Cursor');
    await setupJsonMcp(claudeDesktopConfigPath, 'Claude Desktop');
    await setupJsonMcp(geminiConfigPath, 'Gemini');
    await setupCodex();
    printClaudeCode();
  }

  console.log('\nDone! Restart your AI tool and try saying "list my Reqly collections".');
  return 0;
}
