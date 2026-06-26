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
}

export class CollectionRunner {
  private context: EngineContext;

  constructor(context: EngineContext) {
    this.context = context;
  }

  public async run(collectionName: string, options: RunOptions = {}): Promise<CollectionRunResult> {
    const collection = await this.context.collectionManager.getCollection(collectionName);
    const collectionVars = collection.variables || {};

    const results: RequestRunResult[] = [];
    let passedCount = 0;
    let failedCount = 0;

    for (const request of collection.requests) {
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
        // Layered scope: collection vars win over env vars on collision.
        const config = substituteConfig(request, [collectionVars, envVars], this.context.responseStore);

        response = await this.context.executeRequest(config, options.environment, auth, undefined, undefined, collectionVars);
        this.context.responseStore.set(request.name, response);
        this.context.historyStore.append(request, response, { collectionName: collectionName });

        if (request.assertions && request.assertions.length > 0) {
          assertionResults = runAssertions(response, request.assertions);
          passed = assertionResults.every(a => a.passed);
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

      if (!passed && options.stopOnFailure) {
        break;
      }
    }

    return {
      collection: collectionName,
      total: collection.requests.length,
      passed: passedCount,
      failed: failedCount,
      results
    };
  }
}
