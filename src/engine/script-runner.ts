import vm from 'vm';
import { expect as chaiExpect } from 'chai';

export interface ScriptContext {
  env: Record<string, string>;
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  req?: Record<string, unknown>;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface ScriptResult {
  consoleLogs: string[];
  testResults: TestResult[];
}

function formatArgs(...args: unknown[]): string {
  return args.map(a => (a !== null && typeof a === 'object') ? JSON.stringify(a) : String(a)).join(' ');
}

export function runScript(script: string, context: ScriptContext): ScriptResult {
  const consoleLogs: string[] = [];
  const testResults: TestResult[] = [];

  const reqly = {
    response: context.response ?? null,
    setEnvVar: (key: string, value: string) => { context.env[key] = value; },
    getEnvVar: (key: string) => context.env[key] ?? '',
  };

  const sandbox: Record<string, unknown> = {
    env: context.env,
    request: context.request,
    reqly,
    ...(context.req ? { req: context.req } : {}),
    expect: chaiExpect,
    test: (name: string, fn: () => void) => {
      try {
        fn();
        testResults.push({ name, passed: true });
      } catch (err: any) {
        testResults.push({ name, passed: false, error: err.message ?? String(err) });
      }
    },
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

  return { consoleLogs, testResults };
}
