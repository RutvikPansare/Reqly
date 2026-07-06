import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuthManager, AuthProfileNotFoundError } from './auth-manager.js';
import { AuthType } from '../types/index.js';

describe('AuthManager', () => {
  let tmpFile: string;
  let manager: AuthManager;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-auth-test-'));
    tmpFile = path.join(tmpDir, 'config.json');
    manager = new AuthManager(tmpFile);
  });

  afterEach(() => {
    fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
  });

  it('should create and get an auth profile', async () => {
    const profile = await manager.createProfile({
      name: 'Test Profile',
      type: AuthType.BEARER,
      credentials: { token: 'secret' },
    });
    
    expect(profile.id).toBeDefined();
    expect(profile.name).toBe('Test Profile');

    const retrieved = await manager.getProfile(profile.id);
    expect(retrieved.name).toBe('Test Profile');
    expect(retrieved.credentials).toEqual({ token: 'secret' });
  });

  it('should throw error without exposing credentials when profile not found', async () => {
    await expect(manager.getProfile('missing-id')).rejects.toThrow(AuthProfileNotFoundError);
    await expect(manager.getProfile('missing-id')).rejects.toThrow('Auth profile missing-id not found');
  });

  it('should list auth profiles', async () => {
    await manager.createProfile({ name: 'A', type: AuthType.BEARER, credentials: {} });
    await manager.createProfile({ name: 'B', type: AuthType.API_KEY, credentials: {} });

    const profiles = await manager.listProfiles();
    expect(profiles).toHaveLength(2);
    expect(profiles.map(p => p.name).sort()).toEqual(['A', 'B']);
  });

  it('should delete an auth profile', async () => {
    const profile = await manager.createProfile({
      name: 'Test Profile',
      type: AuthType.BEARER,
      credentials: { token: 'secret' },
    });

    await manager.deleteProfile(profile.id);

    await expect(manager.getProfile(profile.id)).rejects.toThrow(AuthProfileNotFoundError);
    const profiles = await manager.listProfiles();
    expect(profiles).toHaveLength(0);
  });

  it('should throw error when deleting non-existent profile', async () => {
    await expect(manager.deleteProfile('missing-id')).rejects.toThrow(AuthProfileNotFoundError);
  });

  it('should return undefined active project when never set', async () => {
    expect(await manager.getActiveProject()).toBeUndefined();
  });

  it('should set and get the active project', async () => {
    await manager.setActiveProject('/Users/dev/my-project');
    expect(await manager.getActiveProject()).toBe('/Users/dev/my-project');
  });

  it('should preserve existing auth profiles when setting active project', async () => {
    await manager.createProfile({ name: 'A', type: AuthType.BEARER, credentials: {} });
    await manager.setActiveProject('/Users/dev/my-project');

    expect(await manager.getActiveProject()).toBe('/Users/dev/my-project');
    expect(await manager.listProfiles()).toHaveLength(1);
  });

  it('defaults to [".env"] when dotenv files were never set', async () => {
    expect(await manager.getDotenvFiles()).toEqual(['.env']);
  });

  it('sets and gets the dotenv file list', async () => {
    await manager.setDotenvFiles(['.env', '.env.local']);
    expect(await manager.getDotenvFiles()).toEqual(['.env', '.env.local']);
  });

  describe('OAuth2', () => {
    it('should create an oauth2 profile with all credential fields', async () => {
      const profile = await manager.createProfile({
        name: 'My OAuth2',
        type: AuthType.OAUTH2,
        credentials: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          authUrl: 'https://auth.example.com/authorize',
          tokenUrl: 'https://auth.example.com/token',
          redirectUri: 'http://localhost:9876/callback',
          scope: 'openid profile',
        },
      });
      expect(profile.type).toBe(AuthType.OAUTH2);
      expect(profile.credentials.clientId).toBe('client-id');
      expect(profile.credentials.scope).toBe('openid profile');
    });

    it('should store and retrieve access/refresh tokens on an oauth2 profile', async () => {
      const profile = await manager.createProfile({
        name: 'Token Profile',
        type: AuthType.OAUTH2,
        credentials: {
          clientId: 'cid',
          tokenUrl: 'https://auth.example.com/token',
          accessToken: 'initial-access',
          refreshToken: 'initial-refresh',
          expiresAt: String(Date.now() + 3600_000),
        },
      });
      const loaded = await manager.getProfile(profile.id);
      expect(loaded.credentials.accessToken).toBe('initial-access');
      expect(loaded.credentials.refreshToken).toBe('initial-refresh');
    });

    it('should refresh an oauth2 token via POST to tokenUrl', async () => {
      const profile = await manager.createProfile({
        name: 'Refresh Test',
        type: AuthType.OAUTH2,
        credentials: {
          clientId: 'cid',
          clientSecret: 'secret',
          tokenUrl: 'https://auth.example.com/token',
          refreshToken: 'old-refresh',
          accessToken: 'old-access',
          expiresAt: String(Date.now() - 1000), // expired
        },
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      });

      const refreshed = await manager.refreshOAuth2Token(profile.id, mockFetch as any);
      expect(refreshed.credentials.accessToken).toBe('new-access');
      expect(refreshed.credentials.refreshToken).toBe('new-refresh');
      expect(Number(refreshed.credentials.expiresAt)).toBeGreaterThan(Date.now());

      // Verify the token POST used the right parameters
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://auth.example.com/token');
      const body = new URLSearchParams(opts.body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('old-refresh');
      expect(body.get('client_id')).toBe('cid');
    });

    it('should throw when refresh token is missing', async () => {
      const profile = await manager.createProfile({
        name: 'No Refresh',
        type: AuthType.OAUTH2,
        credentials: { clientId: 'cid', tokenUrl: 'https://t.example.com/token' },
      });
      await expect(manager.refreshOAuth2Token(profile.id)).rejects.toThrow('No refresh token');
    });

    it('should throw when profile is not oauth2 type', async () => {
      const profile = await manager.createProfile({
        name: 'Bearer',
        type: AuthType.BEARER,
        credentials: { token: 'abc' },
      });
      await expect(manager.refreshOAuth2Token(profile.id)).rejects.toThrow('not an OAuth2 profile');
    });

    it('should throw when token refresh request fails', async () => {
      const profile = await manager.createProfile({
        name: 'Bad Token',
        type: AuthType.OAUTH2,
        credentials: {
          clientId: 'cid',
          tokenUrl: 'https://auth.example.com/token',
          refreshToken: 'old-refresh',
        },
      });
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'invalid_grant' }) });
      await expect(manager.refreshOAuth2Token(profile.id, mockFetch as any)).rejects.toThrow('Token refresh failed: 401');
    });

    it('should update stored credentials after refresh', async () => {
      const profile = await manager.createProfile({
        name: 'Persist Refresh',
        type: AuthType.OAUTH2,
        credentials: {
          clientId: 'cid',
          tokenUrl: 'https://auth.example.com/token',
          refreshToken: 'old-refresh',
          accessToken: 'old-access',
          expiresAt: String(Date.now() - 1000),
        },
      });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'persisted-new', expires_in: 600 }),
      });
      await manager.refreshOAuth2Token(profile.id, mockFetch as any);

      const reloaded = await manager.getProfile(profile.id);
      expect(reloaded.credentials.accessToken).toBe('persisted-new');
    });
  });

  describe('secret provider config (T-245)', () => {
    it('persists provider config under secretProviders and merges per provider', async () => {
      await manager.setSecretProviderConfig('bitwarden', { accessToken: 't1' });
      await manager.setSecretProviderConfig('bitwarden', { organizationId: 'o1' });
      await manager.setSecretProviderConfig('vault', { address: 'http://v:8200' });

      const config = await manager.loadConfig();
      expect(config.secretProviders).toEqual({
        bitwarden: { accessToken: 't1', organizationId: 'o1' },
        vault: { address: 'http://v:8200' },
      });
    });

    it('getSecretProviders returns configured provider names with masked flag only', async () => {
      await manager.setSecretProviderConfig('bitwarden', { accessToken: 'secret-tok' });
      const providers = await manager.getSecretProviders();
      expect(providers).toEqual({ bitwarden: { configuredKeys: ['accessToken'] } });
      expect(JSON.stringify(providers)).not.toContain('secret-tok');
    });
  });
});
