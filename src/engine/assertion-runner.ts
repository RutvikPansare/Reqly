import { Assertion, AssertionResult, HttpResponse } from '../types/index.js';

export function extractBodyValue(body: unknown, path?: string): unknown {
  if (!path || typeof body !== 'object' || body === null) return body;
  const parts = path.split('.');
  let current: any = body;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function runAssertions(response: HttpResponse, assertions: Assertion[]): AssertionResult[] {
  return assertions.map(assertion => {
    let actual: unknown;
    
    switch (assertion.field) {
      case 'status':
        actual = response.status;
        break;
      case 'latency':
        actual = response.latency;
        break;
      case 'body':
        actual = extractBodyValue(response.body, assertion.path);
        break;
    }

    let passed = false;
    
    switch (assertion.operator) {
      // eq/neq compare by string form: status/latency actuals are numbers, but
      // the UI and YAML persist assertion values as strings, so a strict ===
      // would never match (200 vs "200"). String coercion keeps numeric,
      // boolean, and string values comparable and matches the flow runner's
      // expression evaluator.
      case 'eq':
        passed = String(actual) === String(assertion.value);
        break;
      case 'neq':
        passed = String(actual) !== String(assertion.value);
        break;
      case 'contains':
        passed = typeof actual === 'string' && actual.includes(String(assertion.value));
        break;
      case 'lt':
        passed = typeof actual === 'number' && actual < Number(assertion.value);
        break;
      case 'gt':
        passed = typeof actual === 'number' && actual > Number(assertion.value);
        break;
    }

    const message = passed 
      ? 'Assertion passed'
      : `Expected ${assertion.field}${assertion.path ? '.' + assertion.path : ''} to ${assertion.operator} ${assertion.value}, got ${actual}`;

    return {
      passed,
      assertion,
      actual,
      message
    };
  });
}
