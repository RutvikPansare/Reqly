import path from 'path';
import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_project',
  description: 'Returns the absolute path of the project directory Reqly is currently pointed at (the parent of its .reqly collections folder), plus how that path was resolved. When to use: call on first connection to verify Reqly is operating on the expected directory - catches misconfiguration before any tool calls run. Returns: { projectDir, configSource: "flag"|"env"|"config"|"cwd", fallbackReason? }. fallbackReason is present when a higher-priority source (e.g. --project-dir flag) was detected but ignored because it contained an unresolved macro like ${workspaceFolder}.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function handler(_args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const projectDir = path.dirname(context.collectionManager.getBaseDir());
    const resolution = (globalThis as any).__reqlyProjectResolution;
    const result: any = { projectDir };
    if (resolution) {
      result.configSource = resolution.configSource;
      if (resolution.fallbackReason) result.fallbackReason = resolution.fallbackReason;
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
