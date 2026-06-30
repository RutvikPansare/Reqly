import { describe, it, expect } from 'vitest';
import { resolveMcpMode } from './startup-mode.js';

describe('resolveMcpMode', () => {
  it('switch ok → switched', () => {
    expect(resolveMcpMode({ ok: true, status: 200 })).toBe('switched');
  });

  it('404 → mcp-only', () => {
    expect(resolveMcpMode({ ok: false, status: 404 })).toBe('mcp-only');
  });

  it('500 → mcp-only', () => {
    expect(resolveMcpMode({ ok: false, status: 500 })).toBe('mcp-only');
  });

  it('ECONNREFUSED → start-fresh', () => {
    expect(resolveMcpMode('econnrefused')).toBe('start-fresh');
  });

  it('network error → mcp-only', () => {
    expect(resolveMcpMode('error')).toBe('mcp-only');
  });
});
