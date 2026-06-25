import vm from 'vm';

export interface ScriptContext {
  env: Record<string, string>;
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export function runScript(script: string, context: ScriptContext): void {
  const sandbox: Record<string, unknown> = {
    env: context.env,
    request: context.request,
    console: {
      log: (...args: unknown[]) => console.error('[script]', ...args),
      error: (...args: unknown[]) => console.error('[script]', ...args),
      warn: (...args: unknown[]) => console.error('[script]', ...args),
    },
  };
  if (context.response !== undefined) {
    sandbox.response = context.response;
  }
  try {
    vm.runInNewContext(script, sandbox, { timeout: 2000 });
  } catch (err: any) {
    console.error('[script-runner] Script error:', err.message);
  }
}
