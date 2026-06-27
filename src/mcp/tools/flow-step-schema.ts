// Shared JSON schema fragment for a single FlowStep, used by add_flow_step
// and update_flow_step. Mirrors the FlowStep union in src/types/flow.ts.
export const flowStepSchema = {
  type: 'object',
  description: 'A single flow step. Shape depends on type: run { collection, request, retry? }, extract { from, into }, assert { assertions }, poll { collection, request, until, maxAttempts, delay }, conditional { if, then, else? }.',
  properties: {
    type: { type: 'string', enum: ['run', 'extract', 'assert', 'poll', 'conditional'] },
    id: { type: 'string', description: 'Unique step id within the flow, used as a goto target by conditional steps' },
    collection: { type: 'string', description: 'run/poll: collection the request belongs to' },
    request: { type: 'string', description: 'run/poll: name of the saved request to fire' },
    retry: {
      type: 'object',
      description: 'run only: { times, on: number[], delay } - retry while the response status is in `on`',
      properties: {
        times: { type: 'number' },
        on: { type: 'array', items: { type: 'number' } },
        delay: { type: 'number' },
      },
    },
    from: { type: 'string', description: "extract only: dotted path into the last response, e.g. 'response.body.token'" },
    into: { type: 'string', description: "extract only: flow-local var name, or 'env.varName' to write the active environment" },
    assertions: {
      type: 'array',
      description: "assert only: list of assertions against the last response. Each assertion is { field, operator, value, path? }. IMPORTANT: use 'field' (not 'type') to specify what to check. field: 'status' checks HTTP status code, field: 'body' checks a JSON body path (requires path), field: 'latency' checks response time in ms. operator: 'eq' | 'neq' | 'contains' | 'lt' | 'gt'. Examples: { field: 'status', operator: 'eq', value: 200 } | { field: 'body', path: 'user.id', operator: 'neq', value: '' } | { field: 'latency', operator: 'lt', value: 2000 }",
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', enum: ['status', 'body', 'latency'], description: "What to check: 'status' (HTTP status code), 'body' (JSON body field via dot-notation path), 'latency' (response time in ms)" },
          path: { type: 'string', description: "body only: dot-notation path into the response body, e.g. 'user.id' or 'data.items.0.name'" },
          operator: { type: 'string', enum: ['eq', 'neq', 'contains', 'lt', 'gt'], description: "eq=equals, neq=not-equals, contains=string includes, lt=less-than, gt=greater-than" },
          value: { description: 'Expected value. Primitives only: string, number, or boolean.' },
        },
        required: ['field', 'operator', 'value'],
      },
    },
    until: { type: 'string', description: "poll only: expression evaluated against the response on each attempt, e.g. \"response.body.status === 'done'\"" },
    maxAttempts: { type: 'number', description: 'poll only: max attempts before failing' },
    delay: { type: 'number', description: 'poll only: ms to wait between attempts' },
    if: { type: 'string', description: "conditional only: expression against flow-local scope + last response, e.g. \"response.body.role === 'admin'\"" },
    then: { type: 'string', description: "conditional only: a step id to goto, or 'skip' or 'abort'" },
    else: { type: 'string', description: "conditional only: optional, a step id to goto, or 'skip' or 'abort'" },
  },
  required: ['type', 'id'],
};
