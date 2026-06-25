import { describe, it, expect, vi } from 'vitest';
import { createServer } from './server.js';
import { EngineContext } from './tools/types.js';

describe('reqly://workflow resource', () => {
  it('is registered and returns the workflow guide text', async () => {
    const server = createServer({} as EngineContext);
    const result = await (server as any)._registeredResources['reqly://workflow'].readCallback(
      new URL('reqly://workflow')
    );

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain('PRIMARY: Build collection from code');
    expect(result.contents[0].text).toContain('SECONDARY: Capture outbound traffic');
    expect(result.contents[0].mimeType).toBe('text/plain');
  });
});
