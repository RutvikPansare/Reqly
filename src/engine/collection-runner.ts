import { Environment, AuthProfile, HttpResponse } from '../types/index.js';
import { AssertionResult } from '../types/assertion.js';
import { EngineContext } from '../mcp/tools/types.js';
import { runAssertions } from './assertion-runner.js';

export interface RunOptions {
  environment?: Environment;
  auth?: AuthProfile;
  stopOnFailure?: boolean;
}

export interface RequestRunResult {
  requestName: string;
  response: HttpResponse | null;
  assertions: AssertionResult[];
  passed: boolean;
  duration: number;
  error?: string;
}

export interface CollectionRunResult {
  collection: string;
  total: number;
  passed: number;
  failed: number;
  results: RequestRunResult[];
  stoppedEarly?: boolean;
  jumpedTo?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class CollectionRunner {
  private context: EngineContext;

  constructor(context: EngineContext) {
    this.context = context;
  }

  public async run(collectionName: string, options: RunOptions = {}): Promise<CollectionRunResult> {
    const collection = await this.context.collectionManager.getCollection(collectionName);
    const collectionVars = collection.variables || {};
    const { resolveCollectionAuth } = await import('./collection-auth.js');
    const collectionAuth = await resolveCollectionAuth(collection.auth, this.context.authManager);

    const validRequestNames = collection.requests.map((r: any) => r.name as string);
    const results: RequestRunResult[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let stoppedEarly = false;
    let jumpedTo: string | undefined;

    let i = 0;
    while (i < collection.requests.length) {
      const request = collection.requests[i];
      const start = Date.now();
      let passed = true;
      let response: HttpResponse | null = null;
      let assertionResults: AssertionResult[] = [];
      let error: string | undefined;

      try {
        let auth = options.auth;
        if (!auth && request.authProfileId) {
          auth = await this.context.authManager.getProfile(request.authProfileId);
        }

        const { substituteConfig } = await import('./variable-substitutor.js');
        const envVars = options.environment ? options.environment.variables : {};
        const config = substituteConfig(request, [collectionVars, envVars], this.context.responseStore);

        response = await this.context.executeRequest(
          config, options.environment, auth, undefined, undefined,
          collectionVars, collectionAuth, collectionName,
          { validRequestNames }
        );
        this.context.responseStore.set(request.name, response);
        this.context.historyStore.append(request, response, { collectionName: collectionName });

        if (request.assertions && request.assertions.length > 0) {
          assertionResults = runAssertions(response, request.assertions);
          passed = assertionResults.every((a: AssertionResult) => a.passed);
        }
      } catch (e: any) {
        passed = false;
        error = e.message;
      }

      const duration = Date.now() - start;

      if (passed) {
        passedCount++;
      } else {
        failedCount++;
      }

      let agentResponse: HttpResponse | null = null;
      if (response) {
        agentResponse = { ...response };
        delete agentResponse.fullBody;
      }

      results.push({
        requestName: request.name,
        response: agentResponse,
        assertions: assertionResults,
        passed,
        duration,
        error
      });

      // Read flow control signals from the response (set by scripts via executeRequest)
      const fc = (response as any)?._flowControl;

      if (!passed && options.stopOnFailure) {
        break;
      }

      if (fc?.stopRunner) {
        stoppedEarly = true;
        break;
      }

      if (fc?.nextRequest) {
        const targetIdx = collection.requests.findIndex((r: any) => r.name === fc.nextRequest);
        if (targetIdx !== -1) {
          jumpedTo = fc.nextRequest;
          i = targetIdx;
          continue;
        }
      }

      if (fc?.sleepMs && fc.sleepMs > 0) {
        await sleep(fc.sleepMs);
      }

      i++;
    }

    return {
      collection: collectionName,
      total: collection.requests.length,
      passed: passedCount,
      failed: failedCount,
      results,
      stoppedEarly,
      jumpedTo,
    };
  }
}
