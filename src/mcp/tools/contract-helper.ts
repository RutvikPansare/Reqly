import { EngineContext } from './types.js';
import { CollectionRequest, HttpResponse, ContractViolation } from '../../types/index.js';
import { findOperation, validate } from '../../engine/contract-validator.js';
import { resolveVariables } from '../../engine/variable-substitutor.js';

export interface ContractCheckResult {
  violations: ContractViolation[];
  matched: boolean;
  operationId?: string;
}

// Resolves contract violations for a fired request, or null if the collection
// has no spec configured. Shared by run_request (post-fire) and
// validate_response (re-validate a stored response without re-firing).
export async function checkContract(
  context: EngineContext,
  collectionName: string,
  req: CollectionRequest,
  response: HttpResponse,
): Promise<ContractCheckResult | null> {
  const spec = await context.collectionManager.getCollectionSpec(collectionName);
  if (!spec) return null;

  const source = spec.specPath || spec.specUrl;
  if (!source) return null;

  const collectionVars = await context.collectionManager.getCollectionVariables(collectionName);
  const resolvedUrl = resolveVariables(req.url, [collectionVars]);
  const baseUrl = collectionVars.baseUrl || '';

  const loadedSpec = await context.specLoader.load(source);
  const matched = findOperation(loadedSpec, req.method, resolvedUrl, baseUrl, req.specOperationId);
  if (!matched) return { violations: [], matched: false };

  return { violations: validate(matched.operation, response), matched: true, operationId: matched.operationId };
}
