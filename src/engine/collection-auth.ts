import { AuthProfile, AuthType, CollectionAuth } from '../types/index.js';
import { AuthManager } from './auth-manager.js';

/**
 * Resolve a collection's auth config into a concrete AuthProfile-shaped object
 * the HTTP executor can apply. If the collection auth references a saved profile
 * by id, the profile is loaded; otherwise the inline credentials are used.
 * Returns undefined when there is no collection auth, or it is explicitly `none`.
 */
export async function resolveCollectionAuth(
  collectionAuth: CollectionAuth | undefined,
  authManager: AuthManager
): Promise<AuthProfile | undefined> {
  if (!collectionAuth || collectionAuth.type === 'none') return undefined;

  if (collectionAuth.profileId) {
    try {
      return await authManager.getProfile(collectionAuth.profileId);
    } catch {
      // Profile was deleted or is missing - fall through to inline creds if any.
    }
  }

  return {
    id: 'collection',
    name: 'collection',
    type: collectionAuth.type as AuthType,
    credentials: collectionAuth.credentials || {},
  };
}
