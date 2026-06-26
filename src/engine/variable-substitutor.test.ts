import { describe, it, expect } from 'vitest';
import { substitute, substituteConfig, resolveVariables } from './variable-substitutor.js';
import { RequestConfig } from '../types/index.js';

describe('variable-substitutor', () => {
  describe('resolveVariables (layered scope chain)', () => {
    it('resolves a plain variable from a single layer', () => {
      expect(resolveVariables('Hi {{name}}', [{ name: 'World' }])).toBe('Hi World');
    });

    it('applies layers in priority order - first layer wins on collision', () => {
      const collectionVars = { token: 'collection-token' };
      const envVars = { token: 'env-token' };
      expect(resolveVariables('{{token}}', [collectionVars, envVars])).toBe('collection-token');
    });

    it('falls through to a later layer when an earlier layer lacks the key', () => {
      const collectionVars = { baseUrl: 'http://collection' };
      const envVars = { token: 'env-token' };
      expect(resolveVariables('{{baseUrl}}/{{token}}', [collectionVars, envVars]))
        .toBe('http://collection/env-token');
    });

    it('leaves unknown variables untouched', () => {
      expect(resolveVariables('{{a}} {{b}}', [{ a: '1' }])).toBe('1 {{b}}');
    });

    it('handles dotted response-chaining and plain vars in the same template', () => {
      const responseStore: any = {
        getValue: (key: string) => (key === 'login.response.token' ? 'chained-tok' : undefined),
      };
      const layers = [{ host: 'api.example.com' }];
      const out = resolveVariables(
        'https://{{host}}/me?t={{login.response.token}}',
        layers,
        responseStore,
      );
      expect(out).toBe('https://api.example.com/me?t=chained-tok');
    });

    it('prefers a plain layer var over response-store for a non-dotted key', () => {
      const responseStore: any = { getValue: () => 'should-not-be-used' };
      expect(resolveVariables('{{token}}', [{ token: 'layer-wins' }], responseStore))
        .toBe('layer-wins');
    });
  });

  describe('substitute', () => {
    it('should replace known variables', () => {
      const res = substitute('Hello {{name}}', { name: 'World' });
      expect(res).toBe('Hello World');
    });

    it('should leave unknown variables as-is', () => {
      const res = substitute('Hello {{name}} and {{unknown}}', { name: 'World' });
      expect(res).toBe('Hello World and {{unknown}}');
    });

    it('should handle multiple occurrences', () => {
      const res = substitute('{{var}} {{var}}', { var: 'x' });
      expect(res).toBe('x x');
    });
  });

  describe('substituteConfig', () => {
    it('should substitute url, headers, body, and query params', () => {
      const config: RequestConfig = {
        method: 'POST',
        url: 'http://{{host}}/api/{{path}}',
        headers: { 'X-Custom': '{{custom}}' },
        body: '{"data":"{{data}}"}',
        params: { q: '{{query}}' },
      };
      
      const vars = {
        host: 'example.com',
        path: 'test',
        custom: 'header-val',
        data: 'body-val',
        query: 'search',
      };

      const result = substituteConfig(config, vars);
      
      expect(result.url).toBe('http://example.com/api/test');
      expect(result.headers?.['X-Custom']).toBe('header-val');
      expect(result.body).toBe('{"data":"body-val"}');
      expect(result.params?.q).toBe('search');
    });

    it('should not mutate original config', () => {
      const config: RequestConfig = { method: 'GET', url: '{{url}}' };
      substituteConfig(config, { url: 'http://test' });
      expect(config.url).toBe('{{url}}');
    });
  });
});
