import vm from 'vm';
import * as chai from 'chai';
const chaiExpect = chai.expect;
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import nodeCrypto from 'crypto';
import nodeBuffer from 'buffer';
import nodePath from 'path';
import nodeUrl from 'url';
import nodeQuerystring from 'querystring';
import nodeUtil from 'util';

// Ajv instance shared across script invocations - setup once at module load.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ajv = new (Ajv as any)({ allErrors: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(addFormats as any)(ajv);

function isSubset(expected: Record<string, unknown>, actual: Record<string, unknown>): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  for (const [key, val] of Object.entries(expected)) {
    if (!(key in actual)) {
      mismatches.push(`missing key '${key}'`);
    } else if (JSON.stringify(actual[key]) !== JSON.stringify(val)) {
      mismatches.push(`'${key}': expected ${JSON.stringify(val)}, got ${JSON.stringify(actual[key])}`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

chai.use(function (c, utils) {
  utils.addMethod(c.Assertion.prototype, 'jsonSchema', function (this: any, schema: Record<string, unknown>) {
    const obj = utils.flag(this, 'object');
    const validate = ajv.compile(schema);
    const valid = validate(obj);
    const bodyExcerpt = JSON.stringify(obj).slice(0, 200);
    this.assert(
      valid,
      `expected body to match JSON schema but got errors: ${ajv.errorsText(validate.errors)} | actual: ${bodyExcerpt}`,
      `expected body NOT to match JSON schema`
    );
  });

  utils.addMethod(c.Assertion.prototype, 'jsonBody', function (this: any, expected: Record<string, unknown>) {
    const obj = utils.flag(this, 'object');
    const actual = (typeof obj === 'object' && obj !== null) ? obj as Record<string, unknown> : {};
    const { ok, mismatches } = isSubset(expected, actual);
    const bodyExcerpt = JSON.stringify(actual).slice(0, 200);
    this.assert(
      ok,
      `expected body to contain ${JSON.stringify(expected)} but: ${mismatches.join('; ')} | actual: ${bodyExcerpt}`,
      `expected body NOT to contain ${JSON.stringify(expected)}`
    );
  });
});

const ALLOWED_MODULES: Record<string, unknown> = {
  crypto: nodeCrypto,
  buffer: nodeBuffer,
  path: nodePath,
  url: nodeUrl,
  querystring: nodeQuerystring,
  util: nodeUtil,
};

const ALLOWED_LIST = Object.keys(ALLOWED_MODULES).join(', ');

function sandboxRequire(name: string): unknown {
  if (Object.prototype.hasOwnProperty.call(ALLOWED_MODULES, name)) {
    return ALLOWED_MODULES[name];
  }
  throw new Error(`require('${name}') is not allowed in Reqly scripts. Allowed modules: ${ALLOWED_LIST}`);
}

export interface RunnerContext {
  validRequestNames: string[];
}

export interface ScriptContext {
  env: Record<string, string>;
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  req?: Record<string, unknown>;
  scriptVars?: Record<string, string>;
  onScriptVarSet?: (key: string, value: string) => void;
  runnerContext?: RunnerContext;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface FlowControl {
  stopRunner?: boolean;
  nextRequest?: string;
  sleepMs?: number;
}

export interface ScriptResult {
  consoleLogs: string[];
  testResults: TestResult[];
  flowControl: FlowControl;
}

function formatArgs(...args: unknown[]): string {
  return args.map(a => (a !== null && typeof a === 'object') ? JSON.stringify(a) : String(a)).join(' ');
}

export function runScript(script: string, context: ScriptContext): ScriptResult {
  const consoleLogs: string[] = [];
  const testResults: TestResult[] = [];
  const flowControl: FlowControl = {};

  const runnerCtx = context.runnerContext;

  const reqly = {
    response: context.response ?? null,
    setEnvVar: (key: string, value: string) => { context.env[key] = value; },
    getEnvVar: (key: string) => context.env[key] ?? '',
    setVar: (key: string, value: string) => {
      if (context.onScriptVarSet) context.onScriptVarSet(key, value);
      if (context.scriptVars) context.scriptVars[key] = value;
    },
    getVar: (key: string) => context.scriptVars ? context.scriptVars[key] : undefined,
    runner: {
      stop: () => {
        if (runnerCtx) flowControl.stopRunner = true;
      },
    },
    sleep: (ms: number) => {
      if (runnerCtx) flowControl.sleepMs = ms;
    },
    setNextRequest: (name: string) => {
      if (!runnerCtx) return;
      if (!runnerCtx.validRequestNames.includes(name)) {
        throw new Error(
          `setNextRequest: '${name}' not found. Valid request names: ${runnerCtx.validRequestNames.join(', ')}`
        );
      }
      flowControl.nextRequest = name;
    },
  };

  const sandbox: Record<string, unknown> = {
    env: context.env,
    request: context.request,
    reqly,
    bru: {
      setEnvVar: reqly.setEnvVar,
      getEnvVar: reqly.getEnvVar,
    },
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
    require: sandboxRequire,
    console: {
      log:   (...args: unknown[]) => consoleLogs.push(`[log] ${formatArgs(...args)}`),
      warn:  (...args: unknown[]) => consoleLogs.push(`[warn] ${formatArgs(...args)}`),
      error: (...args: unknown[]) => consoleLogs.push(`[error] ${formatArgs(...args)}`),
    },
  };
  if (context.response !== undefined) {
    sandbox.response = context.response;
    sandbox.res = {
      getStatus: () => context.response?.status ?? 0,
      getBody: () => context.response?.body ?? null,
      getHeader: (name: string) => {
        const headers = (context.response?.headers as Record<string, string>) || {};
        const lowerName = name.toLowerCase();
        return headers[name] ?? headers[lowerName] ?? null;
      },
      getResponseTime: () => context.response?.latency ?? 0,
    };
  }
  try {
    vm.runInNewContext(script, sandbox, { timeout: 2000 });
  } catch (err: any) {
    consoleLogs.push(`[error] Script error: ${err.message}`);
  }

  return { consoleLogs, testResults, flowControl };
}
