import { EngineContext } from '../mcp/tools/types.js';
import {
  FlowConfig,
  FlowDataRow,
  FlowStep,
  RunStep,
  ExtractStep,
  AssertStep,
  StepResult,
  RowResult,
  FlowRunResult,
  HttpResponse,
  AuthProfile,
} from '../types/index.js';
import { substituteConfig } from './variable-substitutor.js';
import { runAssertions, extractBodyValue } from './assertion-runner.js';
import { resolveCollectionAuth } from './collection-auth.js';

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
      return {
        flowName: flow.name,
        passed: steps.every(s => s.passed),
        steps,
        duration: Date.now() - start,
      };
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
    return {
      flowName: flow.name,
      passed: steps.every(s => s.passed),
      steps,
      duration: Date.now() - start,
    };
  }

  private async runSteps(flow: FlowConfig, row: FlowDataRow): Promise<StepResult[]> {
    // Flow-local scope, seeded with data-row keys. Spec calls for a Map;
    // converted to a plain object when handed to the layered resolver.
    const flowScope = new Map<string, string>(Object.entries(row));
    const results: StepResult[] = [];
    let lastResponse: HttpResponse | undefined;

    for (const step of flow.steps) {
      const stepStart = Date.now();
      const r: StepResult = { stepId: step.id, type: step.type, passed: false, duration: 0 };
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
            r.passed = this.execAssert(step, lastResponse);
            break;
          }
          default:
            // conditional/poll are implemented in T-097.
            throw new Error(`Step type ${step.type} not supported in the core runner`);
        }
      } catch (e: any) {
        r.passed = false;
        r.error = e.message;
      }
      r.duration = Date.now() - stepStart;
      results.push(r);
    }

    return results;
  }

  private async execRun(step: RunStep, flowScope: Map<string, string>): Promise<HttpResponse> {
    const request = await this.context.collectionManager.getRequest(step.collection, step.request);
    const collection = await this.context.collectionManager.getCollection(step.collection);
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

    const fire = () => this.context.executeRequest(
      config, env ?? undefined, auth, undefined, undefined, collectionVars, collectionAuth
    );

    let response = await fire();
    if (step.retry) {
      let attempts = 0;
      while (step.retry.on.includes(response.status) && attempts < step.retry.times) {
        attempts++;
        if (step.retry.delay > 0) await sleep(step.retry.delay);
        response = await fire();
      }
    }

    this.context.responseStore.set(request.name, response);
    this.context.historyStore.append(request, response, { collectionName: step.collection });

    if (step.retry && step.retry.on.includes(response.status)) {
      throw new Error(`Request failed after retries with status ${response.status}`);
    }

    return response;
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

  private execAssert(step: AssertStep, lastResponse: HttpResponse | undefined): boolean {
    if (!lastResponse) throw new Error('assert step has no preceding response');
    const results = runAssertions(lastResponse, step.assertions);
    return results.every(a => a.passed);
  }

  // Read a `response.*` path: response.status | response.latency |
  // response.headers.<h> | response.body.<dotted.path>.
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
