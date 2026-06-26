import vm from 'vm';

export interface ScriptContext {
  env: Record<string, string>;
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export interface ScriptResult {
  consoleLogs: string[];
}

function formatArgs(...args: unknown[]): string {
  return args.map(a => (a !== null && typeof a === 'object') ? JSON.stringify(a) : String(a)).join(' ');
}

export function runScript(script: string, context: ScriptContext): ScriptResult {
  const consoleLogs: string[] = [];

  const sandbox: Record<string, unknown> = {
    env: context.env,
    request: context.request,
    console: {
      log:   (...args: unknown[]) => consoleLogs.push(`[log] ${formatArgs(...args)}`),
      warn:  (...args: unknown[]) => consoleLogs.push(`[warn] ${formatArgs(...args)}`),
      error: (...args: unknown[]) => consoleLogs.push(`[error] ${formatArgs(...args)}`),
    },
  };
  if (context.response !== undefined) {
    sandbox.response = context.response;
  }
  try {
    vm.runInNewContext(script, sandbox, { timeout: 2000 });
  } catch (err: any) {
    consoleLogs.push(`[error] Script error: ${err.message}`);
  }

  return { consoleLogs };
}
