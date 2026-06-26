import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_inherited_headers',
  description: 'Returns the headers that will be automatically injected into a request based on its auth configuration, before the request is fired. Use this to inspect what Authorization or API key headers Reqly will add, without having to fire the request. Useful for debugging auth issues or verifying credentials are set correctly.',
  inputSchema: {
    type: 'object',
    properties: {
      authType: {
        type: 'string',
        enum: ['none', 'bearer', 'basic', 'api_key', 'oauth2'],
        description: 'Auth type configured on the request',
      },
      authProfileId: {
        type: 'string',
        description: 'If set, look up credentials from this auth profile ID instead of authCreds',
      },
      authCreds: {
        type: 'object',
        description: 'Inline auth credentials (used when authProfileId is not set)',
      },
    },
    required: ['authType'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const { authType, authProfileId, authCreds } = args;
    let creds: Record<string, string> = authCreds ?? {};

    if (authProfileId) {
      const profile = await context.authManager?.getProfile?.(authProfileId);
      if (profile) creds = profile.credentials ?? {};
    }

    const headers: Record<string, string> = {};

    if (authType === 'bearer') {
      const token = creds.token ?? '';
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } else if (authType === 'basic') {
      const username = creds.username ?? '';
      const password = creds.password ?? '';
      if (username) {
        const encoded = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
      }
    } else if (authType === 'api_key') {
      const key = creds.key ?? 'X-Api-Key';
      const value = creds.value ?? '';
      const position = creds.in ?? 'header';
      if (position === 'header' && value) headers[key] = value;
    } else if (authType === 'oauth2') {
      const accessToken = creds.accessToken ?? '';
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ authType, headers, note: authType === 'api_key' && (args.authCreds?.in ?? creds.in) === 'query' ? 'API key will be added as a query param, not a header' : undefined }),
      }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
