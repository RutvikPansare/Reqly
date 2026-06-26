import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'refresh_oauth2_token',
  description: 'Refreshes the OAuth 2.0 access token for an auth profile using its stored refresh token. Call this when a request returns 401 and the profile uses OAuth2. Returns the new accessToken and its expiry. The token is automatically persisted to the profile so subsequent run_request calls use it immediately.',
  inputSchema: {
    type: 'object',
    properties: {
      profileId: {
        type: 'string',
        description: 'ID of the auth profile whose OAuth2 token should be refreshed',
      },
    },
    required: ['profileId'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  const { profileId } = args;
  if (!profileId) {
    return { content: [{ type: 'text', text: 'profileId is required' }], isError: true };
  }
  try {
    const updated = await context.authManager!.refreshOAuth2Token(profileId);
    const { accessToken, expiresAt } = updated.credentials as Record<string, string>;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          profileId,
          accessToken,
          expiresAt: expiresAt ? new Date(Number(expiresAt)).toISOString() : undefined,
        }),
      }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
