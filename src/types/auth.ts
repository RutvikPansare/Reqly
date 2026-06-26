export enum AuthType {
  BEARER = 'bearer',
  API_KEY = 'apiKey',
  BASIC = 'basic',
  OAUTH2 = 'oauth2',
}

export interface AuthProfile {
  id: string;
  name: string;
  type: AuthType;
  // All values stored as strings. OAuth2 fields: clientId, clientSecret, authUrl,
  // tokenUrl, redirectUri, scope, accessToken, refreshToken, expiresAt (ms epoch as string)
  credentials: Record<string, string>;
}
