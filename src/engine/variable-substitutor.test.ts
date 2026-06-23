import { describe, it, expect } from 'vitest';
import { substitute, substituteConfig } from './variable-substitutor.js';
import { RequestConfig } from '../types/index.js';

describe('variable-substitutor', () => {
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
