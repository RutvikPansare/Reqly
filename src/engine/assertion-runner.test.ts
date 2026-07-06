import { describe, it, expect } from 'vitest';
import { runAssertions } from './assertion-runner.js';
import { HttpResponse, Assertion } from '../types/index.js';

describe('AssertionRunner', () => {
  const mockResponse: HttpResponse = {
    status: 200,
    latency: 150,
    headers: { 'content-type': 'application/json' },
    timestamp: new Date().toISOString(),
    body: {
      user: { id: 1, role: 'admin' },
      success: true
    }
  };

  it('should evaluate status eq 200 to pass', () => {
    const assertions: Assertion[] = [{ field: 'status', operator: 'eq', value: 200 }];
    const results = runAssertions(mockResponse, assertions);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].actual).toBe(200);
  });

  it('should evaluate status neq 404 to pass', () => {
    const assertions: Assertion[] = [{ field: 'status', operator: 'neq', value: 404 }];
    const results = runAssertions(mockResponse, assertions);
    expect(results[0].passed).toBe(true);
  });

  it('should evaluate latency lt 200 to pass', () => {
    const assertions: Assertion[] = [{ field: 'latency', operator: 'lt', value: 200 }];
    const results = runAssertions(mockResponse, assertions);
    expect(results[0].passed).toBe(true);
  });

  it('should evaluate body nested paths', () => {
    const assertions: Assertion[] = [
      { field: 'body', path: 'user.id', operator: 'eq', value: 1 },
      { field: 'body', path: 'user.role', operator: 'contains', value: 'admin' }
    ];
    const results = runAssertions(mockResponse, assertions);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(true);
  });

  it('should fail correctly with human readable message', () => {
    const assertions: Assertion[] = [{ field: 'status', operator: 'eq', value: 201 }];
    const results = runAssertions(mockResponse, assertions);
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toBe('Expected status to eq 201, got 200');
  });

  // Regression: the UI and YAML persist assertion values as strings, but
  // status/latency actuals are numbers. Strict === made every string-valued
  // eq/neq assertion fail (or pass, for neq) regardless of the real value.
  it('should evaluate status eq "200" (string value) to pass', () => {
    const assertions: Assertion[] = [{ field: 'status', operator: 'eq', value: '200' }];
    const results = runAssertions(mockResponse, assertions);
    expect(results[0].passed).toBe(true);
  });

  it('should evaluate status neq "200" (string value) to fail', () => {
    const assertions: Assertion[] = [{ field: 'status', operator: 'neq', value: '200' }];
    const results = runAssertions(mockResponse, assertions);
    expect(results[0].passed).toBe(false);
  });

  it('should evaluate body numeric field eq "1" (string value) to pass', () => {
    const assertions: Assertion[] = [{ field: 'body', path: 'user.id', operator: 'eq', value: '1' }];
    const results = runAssertions(mockResponse, assertions);
    expect(results[0].passed).toBe(true);
  });

  it('should evaluate body boolean field eq "true" (string value) to pass', () => {
    const assertions: Assertion[] = [{ field: 'body', path: 'success', operator: 'eq', value: 'true' }];
    const results = runAssertions(mockResponse, assertions);
    expect(results[0].passed).toBe(true);
  });
});
