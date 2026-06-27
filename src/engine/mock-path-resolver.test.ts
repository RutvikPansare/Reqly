import { describe, it, expect } from 'vitest';
import { resolveMockPath } from './mock-path-resolver.js';

describe('resolveMockPath', () => {
  it('strips protocol and host from an absolute URL', () => {
    expect(resolveMockPath({ url: 'https://api.stripe.com/v1/charges' })).toBe('/v1/charges');
  });

  it('converts {{var}} segments to :var and strips a leading base-url placeholder', () => {
    expect(resolveMockPath({ url: '{{baseUrl}}/users/{{userId}}' })).toBe('/users/:userId');
  });

  it('handles multiple variable segments', () => {
    expect(resolveMockPath({ url: '{{baseUrl}}/orgs/{{orgId}}/users/{{userId}}' })).toBe('/orgs/:orgId/users/:userId');
  });

  it('strips the query string', () => {
    expect(resolveMockPath({ url: 'https://api.x.com/search?q=hello&page=2' })).toBe('/search');
  });

  it('strips the query string on a variable URL', () => {
    expect(resolveMockPath({ url: '{{baseUrl}}/users/{{userId}}?expand=true' })).toBe('/users/:userId');
  });

  it('returns mockPath as-is when set, ignoring the URL', () => {
    expect(resolveMockPath({ url: 'https://api.stripe.com/v1/charges', mockPath: '/custom/path' })).toBe('/custom/path');
  });

  it('treats a bare path with no host as the path', () => {
    expect(resolveMockPath({ url: '/v1/charges' })).toBe('/v1/charges');
  });

  it('ensures a leading slash', () => {
    expect(resolveMockPath({ url: 'v1/charges' })).toBe('/v1/charges');
  });
});
