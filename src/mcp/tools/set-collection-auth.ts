import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { CollectionAuth } from '../../types/index.js';

export const definition: ToolDefinition = {
  name: 'set_collection_auth',
  description: 'Sets the collection-level auth for a named collection. Auth set here is inherited by every request in the collection unless a request overrides it with its own auth or sets type:none to opt out. Supported types: bearer (credentials.token), basic (credentials.username + credentials.password), apiKey (credentials.key), oauth2, mtls (credentials.certPath + credentials.keyPath, or credentials.pfxPath for PKCS#12, plus optional credentials.passphrase and credentials.caPath), none. Pass profileId instead of credentials to reference a saved auth profile by id. Set type:none to explicitly disable collection auth. For mtls: all path fields and the passphrase support {{variables}} resolution so secrets and local paths are not hardcoded in the YAML. When to use: to apply a shared bearer token, API key, or client certificate to an entire collection without repeating it on every request.',
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string' },
      type: {
        type: 'string',
        description: 'Auth type: bearer, basic, apiKey, oauth2, mtls, or none.',
      },
      profileId: {
        type: 'string',
        description: 'Optional. ID of a saved auth profile to reference instead of inline credentials.',
      },
      credentials: {
        type: 'object',
        description: 'Optional. Inline credentials. For bearer: { token }. For basic: { username, password }. For apiKey: { key }. For mtls: { certPath, keyPath, pfxPath, passphrase, caPath } (Fields support {{variables}}).',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['collectionName', 'type'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const auth: CollectionAuth = { type: args.type };
    if (args.profileId) auth.profileId = args.profileId;
    if (args.credentials) auth.credentials = args.credentials;
    await context.collectionManager.setCollectionAuth(args.collectionName, auth);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, collectionName: args.collectionName, auth }) }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
