import * as path from 'path';
import { EngineContext } from '../mcp/tools/types.js';
import {
  FlowConfig,
  FlowDataRow,
  RunStep,
  ExtractStep,
  AssertStep,
  PollStep,
  ConditionalStep,
  StepResult,
  RowResult,
  FlowRunResult,
  HttpResponse,
  AuthProfile,
  RequestConfig,
} from '../types/index.js';
import { substituteConfig } from './variable-substitutor.js';
import { runAssertions, extractBodyValue } from './assertion-runner.js';
import { resolveCollectionAuth } from './collection-auth.js';
import { runGrpcRequest, GrpcResponse } from './grpc-runner.js';

export interface FlowRunOptions {
  dataRow?: FlowDataRow;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export class FlowRunner {
  constructor(private context: EngineContext) {}

  async run(flow: FlowConfig, options: FlowRunOptions = {}): Promise<FlowRunResult> {
    const start = Date.now();

    // dataRow override: single run seeded with that row, no iteration.
    if (options.dataRow) {
      const steps = await this.runSteps(flow, options.dataRow);
      return { flowName: flow.name, passed: steps.every(s => s.passed), steps, duration: Date.now() - start };
    }

    // Data-driven: run the step sequence once per row.
    if (flow.data && flow.data.length > 0) {
      const dataRows: RowResult[] = [];
      for (const row of flow.data) {
        const steps = await this.runSteps(flow, row);
        dataRows.push({ data: row, passed: steps.every(s => s.passed), steps });
      }
      return {
        flowName: flow.name,
        passed: dataRows.every(r => r.passed),
        steps: [],
        dataRows,
        duration: Date.now() - start,
      };
    }

    // Plain run.
    const steps = await this.runSteps(flow, {});
    return { flowName: flow.name, passed: steps.every(s => s.passed), steps, duration: Date.now() - start };
  }

  private async runSteps(flow: FlowConfig, row: FlowDataRow): Promise<StepResult[]> {
    // Flow-local scope, seeded with data-row keys. Spec calls for a Map;
    // converted to a plain object when handed to the layered resolver.
    const flowScope = new Map<string, string>(Object.entries(row));
    const results: StepResult[] = [];
    let lastResponse: HttpResponse | undefined;

    const stepIndex = new Map(flow.steps.map((s, i) => [s.id, i]));
    // Each conditional->target jump may only be taken once; a repeat means a
    // circular goto loop, which we abort rather than spin forever.
    const gotoEdges = new Set<string>();

    let i = 0;
    let aborted = false;

    while (i < flow.steps.length) {
      const step = flow.steps[i];
      const stepStart = Date.now();
      const r: StepResult = { stepId: step.id, type: step.type, passed: false, duration: 0 };
      let jumpTo: number | null = null;

      try {
        switch (step.type) {
          case 'run': {
            lastResponse = await this.execRun(step, flowScope);
            r.response = lastResponse;
            r.passed = true;
            break;
          }
          case 'extract': {
            await this.execExtract(step, lastResponse, flowScope);
            r.passed = true;
            break;
          }
          case 'assert': {
            const assertResult = this.execAssert(step, lastResponse);
            r.passed = assertResult.passed;
            r.error = assertResult.error;
            break;
          }
          case 'poll': {
            const { response, passed } = await this.execPoll(step, flowScope);
            if (passed && response) {
              lastResponse = response;
              this.context.responseStore.set(step.request, response);
              this.context.historyStore.append(
                await this.context.collectionManager.getRequest(step.collection, step.request),
                response,
                { collectionName: step.collection }
              );
              r.response = response;
            }
            r.passed = passed;
            break;
          }
          case 'conditional': {
            const cond = this.evalConditional(step, lastResponse, flowScope);
            const action = cond ? step.then : step.else;
            if (action === undefined) {
              r.passed = true; // no branch taken, fall through
            } else if (action === 'skip') {
              r.passed = true;
            } else if (action === 'abort') {
              r.passed = false;
              aborted = true;
            } else {
              // goto stepId
              const target = stepIndex.get(action);
              if (target === undefined) throw new Error(`goto target "${action}" not found`);
              const edge = `${step.id}->${action}`;
              if (gotoEdges.has(edge)) throw new Error(`Circular goto loop detected at step ${step.id}`);
              gotoEdges.add(edge);
              r.passed = true;
              jumpTo = target;
            }
            break;
          }
        }
      } catch (e: any) {
        r.passed = false;
        r.error = e.message;
        // A control-flow error (bad goto target / loop) must stop the flow.
        if (step.type === 'conditional') aborted = true;
      }

      r.duration = Date.now() - stepStart;
      results.push(r);

      if (aborted) break;
      i = jumpTo !== null ? jumpTo : i + 1;
    }

    return results;
  }

  // Single fire: load, substitute, execute. No retry, no store - callers
  // (execRun, execPoll) own those concerns.
  private async fireRequest(collectionName: string, requestName: string, flowScope: Map<string, string>): Promise<HttpResponse> {
    const request = await this.context.collectionManager.getRequest(collectionName, requestName);
    const collection = await this.context.collectionManager.getCollection(collectionName);
    const collectionVars = collection.variables || {};
    const collectionAuth = await resolveCollectionAuth(collection.auth, this.context.authManager);

    let auth: AuthProfile | undefined;
    if (request.authProfileId) {
      auth = await this.context.authManager.getProfile(request.authProfileId);
    }

    const env = await this.context.environmentManager.getActiveEnvironment();
    const envVars = env?.variables || {};

    // Layered scope: flow-local wins, then collection vars, then env vars.
    const layers = [Object.fromEntries(flowScope), collectionVars, envVars];
    const config = substituteConfig(request, layers, this.context.responseStore);

    // Route gRPC unary requests to the dedicated runner.
    if (config.type === 'grpc' && config.grpc) {
      return this.fireGrpcRequest(config, auth, collectionAuth);
    }

    return this.context.executeRequest(config, env ?? undefined, auth, undefined, undefined, collectionVars, collectionAuth);
  }

  // Execute a unary gRPC request and adapt the GrpcResponse into an HttpResponse
  // so the rest of the flow runner (assert, extract, conditional) works uniformly.
  private async fireGrpcRequest(
    config: RequestConfig,
    auth: AuthProfile | undefined,
    collectionAuth: AuthProfile | undefined,
  ): Promise<HttpResponse> {
    const grpcCfg = config.grpc!;
    const protosDir = path.join(this.context.collectionManager.getBaseDir(), 'protos');

    // Build gRPC metadata: collection auth first, request auth overrides, then explicit headers.
    const metadata: Record<string, string> = {};
    for (const a of [collectionAuth, auth].filter((a): a is AuthProfile => !!a)) {
      const creds = (a as any).credentials ?? {};
      if (a.type === 'bearer' && creds.token) {
        metadata['authorization'] = `Bearer ${creds.token}`;
      } else if (a.type === 'apiKey' && creds.key && creds.value) {
        metadata[creds.key.toLowerCase()] = creds.value;
      } else if (a.type === 'basic' && creds.username && creds.password) {
        const encoded = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
        metadata['authorization'] = `Basic ${encoded}`;
      }
    }
    if (config.headers) {
      Object.assign(metadata, config.headers);
    }

    const grpcResp = await runGrpcRequest(
      {
        serverUrl: config.url,
        protoFile: grpcCfg.protoFile,
        service: grpcCfg.service,
        method: grpcCfg.method,
        message: grpcCfg.message ?? {},
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        insecure: grpcCfg.insecure !== false,
      },
      protosDir,
    );

    return this.adaptGrpcResponse(grpcResp);
  }

  // Map a GrpcResponse onto the HttpResponse shape used throughout the flow runner.
  // Status 200 = gRPC OK (code 0). Any non-zero code maps to 500 so assert steps
  // can check `status === 200` to detect errors uniformly.
  private adaptGrpcResponse(grpcResp: GrpcResponse): HttpResponse {
    const ok = grpcResp.grpcStatusCode === 0;
    return {
      status: ok ? 200 : 500,
      body: ok
        ? (grpcResp.body ?? {})
        : {
            grpcStatus: grpcResp.grpcStatus,
            grpcStatusCode: grpcResp.grpcStatusCode,
            error: grpcResp.errorMessage ?? 'gRPC error',
          },
      headers: {
        'grpc-status': String(grpcResp.grpcStatusCode),
        'grpc-message': grpcResp.grpcStatus,
      },
      latency: grpcResp.latency,
      timestamp: new Date().toISOString(),
    };
  }

  private async execRun(step: RunStep, flowScope: Map<string, string>): Promise<HttpResponse> {
    let response = await this.fireRequest(step.collection, step.request, flowScope);

    if (step.retry) {
      let attempts = 0;
      while (step.retry.on.includes(response.status) && attempts < step.retry.times) {
        attempts++;
        if (step.retry.delay > 0) await sleep(step.retry.delay);
        response = await this.fireRequest(step.collection, step.request, flowScope);
      }
    }

    this.context.responseStore.set(step.request, response);
    this.context.historyStore.append(
      await this.context.collectionManager.getRequest(step.collection, step.request),
      response,
      { collectionName: step.collection }
    );

    if (step.retry && step.retry.on.includes(response.status)) {
      throw new Error(`Request failed after retries with status ${response.status}`);
    }

    return response;
  }

  // Fire repeatedly until `until` is truthy or maxAttempts is exhausted.
  // Flow-scope/extract effects of the final response are applied by the caller
  // only when passed is true.
  private async execPoll(step: PollStep, flowScope: Map<string, string>): Promise<{ response?: HttpResponse; passed: boolean }> {
    let response: HttpResponse | undefined;
    for (let attempt = 0; attempt < step.maxAttempts; attempt++) {
      if (attempt > 0 && step.delay > 0) await sleep(step.delay);
      response = await this.fireRequest(step.collection, step.request, flowScope);
      if (this.evalExpression(step.until, response, flowScope, true)) {
        return { response, passed: true };
      }
    }
    return { response, passed: false };
  }

  private async execExtract(step: ExtractStep, lastResponse: HttpResponse | undefined, flowScope: Map<string, string>): Promise<void> {
    if (!lastResponse) throw new Error('extract step has no preceding response');
    const value = this.readPath(step.from, lastResponse);
    const strVal = value === undefined || value === null
      ? ''
      : (typeof value === 'object' ? JSON.stringify(value) : String(value));

    if (step.into.startsWith('env.')) {
      const key = step.into.slice('env.'.length);
      const env = await this.context.environmentManager.getActiveEnvironment();
      if (!env) throw new Error('extract into env.* requires an active environment');
      await this.context.environmentManager.updateVariable(env.name, key, strVal);
      return;
    }

    flowScope.set(step.into, strVal);
  }

  private execAssert(step: AssertStep, lastResponse: HttpResponse | undefined): { passed: boolean; error?: string } {
    if (!lastResponse) throw new Error('assert step has no preceding response');
    const results = runAssertions(lastResponse, step.assertions);
    const failed = results.find(a => !a.passed);
    return { passed: !failed, error: failed?.message };
  }

  private evalConditional(step: ConditionalStep, lastResponse: HttpResponse | undefined, flowScope: Map<string, string>): boolean {
    return this.evalExpression(step.if, lastResponse, flowScope, false);
  }

  // Safe expression evaluator - NO arbitrary JS eval. Supports a single
  // `A === B` / `A !== B` comparison, or a bare existence/truthiness check.
  private evalExpression(expr: string, response: HttpResponse | undefined, flowScope: Map<string, string>, pollMode: boolean): boolean {
    const m = expr.match(/^(.*?)(===|!==)(.*)$/);
    if (m) {
      const lhs = this.resolveOperand(m[1].trim(), response, flowScope, pollMode);
      const rhs = this.resolveOperand(m[3].trim(), response, flowScope, pollMode);
      const equal = String(lhs) === String(rhs);
      return m[2] === '===' ? equal : !equal;
    }
    const v = this.resolveOperand(expr.trim(), response, flowScope, pollMode);
    return v !== undefined && v !== null && v !== false && v !== '' && v !== 'false';
  }

  private resolveOperand(token: string, response: HttpResponse | undefined, flowScope: Map<string, string>, pollMode: boolean): unknown {
    // Quoted string literal.
    if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
      return token.slice(1, -1);
    }
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);

    if (token.startsWith('response.') || token.startsWith('body.')) {
      return response ? this.readPath(token, response) : undefined;
    }
    if (flowScope.has(token)) return flowScope.get(token);

    // Poll `until` operands are evaluated against response.body by default.
    if (pollMode && response) return extractBodyValue(response.body, token);
    return undefined;
  }

  // Read a `response.*` path: response.status | response.latency |
  // response.headers.<h> | response.body.<dotted.path> (also accepts a bare
  // `body.<path>`).
  private readPath(from: string, response: HttpResponse): unknown {
    const path = from.startsWith('response.') ? from.slice('response.'.length) : from;
    if (path === 'status') return response.status;
    if (path === 'latency') return response.latency;
    if (path.startsWith('headers.')) return response.headers?.[path.slice('headers.'.length)];
    if (path === 'body') return response.body;
    if (path.startsWith('body.')) return extractBodyValue(response.body, path.slice('body.'.length));
    return extractBodyValue(response.body, path);
  }
}
