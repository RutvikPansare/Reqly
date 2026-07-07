import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { fetch as undiciFetch } from 'undici';
import { AuthProfile, AuthType } from '../types/index.js';

export class AuthProfileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthProfileNotFoundError';
  }
}

interface ConfigFile {
  authProfiles?: AuthProfile[];
  activeProject?: string;
  dotenvFiles?: string[];
  workspaceProjects?: string[];
  secretProviders?: Record<string, Record<string, string>>;
  [key: string]: any;
}

export class AuthManager {
  constructor(private configPath: string) {}

  public async loadConfig(): Promise<ConfigFile> {
    if (!existsSync(this.configPath)) {
      return {};
    }
    const content = await fs.readFile(this.configPath, 'utf8');
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Loads the config for a read-modify-write cycle. Unlike loadConfig (which
   * tolerates a corrupt file by returning defaults for pure reads), this throws
   * when the file exists but is not valid JSON - saving a `{}` derived from a
   * corrupt file back to disk would silently wipe every profile, workspace, and
   * secret-provider entry.
   */
  private async loadConfigForWrite(): Promise<ConfigFile> {
    if (!existsSync(this.configPath)) {
      return {};
    }
    const content = await fs.readFile(this.configPath, 'utf8');
    if (content.trim() === '') {
      return {};
    }
    try {
      return JSON.parse(content);
    } catch {
      throw new Error(
        `Refusing to modify ${this.configPath}: the file exists but is not valid JSON. Fix or remove it before retrying.`,
      );
    }
  }

  private async saveConfig(config: ConfigFile): Promise<void> {
    const dir = path.dirname(this.configPath);
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(this.configPath, content, 'utf8');
  }

  async createProfile(profile: Omit<AuthProfile, 'id'>): Promise<AuthProfile> {
    const config = await this.loadConfigForWrite();
    const profiles = config.authProfiles || [];

    const newProfile: AuthProfile = {
      ...profile,
      id: `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    profiles.push(newProfile);
    config.authProfiles = profiles;
    await this.saveConfig(config);

    return newProfile;
  }

  async updateProfile(id: string, updates: Partial<AuthProfile>): Promise<AuthProfile> {
    const config = await this.loadConfigForWrite();
    const profiles = config.authProfiles || [];
    const index = profiles.findIndex(p => p.id === id);
    if (index === -1) throw new AuthProfileNotFoundError(`Auth profile ${id} not found`);

    profiles[index] = { ...profiles[index], ...updates };
    config.authProfiles = profiles;
    await this.saveConfig(config);
    return profiles[index];
  }

  async getProfile(id: string): Promise<AuthProfile> {
    const config = await this.loadConfig();
    const profiles = config.authProfiles || [];
    const profile = profiles.find(p => p.id === id);
    if (!profile) {
      throw new AuthProfileNotFoundError(`Auth profile ${id} not found`);
    }
    return profile;
  }

  async listProfiles(): Promise<AuthProfile[]> {
    const config = await this.loadConfig();
    return config.authProfiles || [];
  }

  async deleteProfile(id: string): Promise<void> {
    const config = await this.loadConfigForWrite();
    const profiles = config.authProfiles || [];
    
    const index = profiles.findIndex(p => p.id === id);
    if (index === -1) {
      throw new AuthProfileNotFoundError(`Auth profile ${id} not found`);
    }

    profiles.splice(index, 1);
    config.authProfiles = profiles;
    await this.saveConfig(config);
  }

  async getActiveProject(): Promise<string | undefined> {
    const config = await this.loadConfig();
    return config.activeProject;
  }

  async setActiveProject(projectDir: string): Promise<void> {
    const config = await this.loadConfigForWrite();
    config.activeProject = projectDir;
    await this.saveConfig(config);
  }

  async getDotenvFiles(): Promise<string[]> {
    const config = await this.loadConfig();
    return config.dotenvFiles || ['.env'];
  }

  async setDotenvFiles(files: string[]): Promise<void> {
    const config = await this.loadConfigForWrite();
    config.dotenvFiles = files;
    await this.saveConfig(config);
  }

  // Secret provider config lives under secretProviders in the GLOBAL
  // ~/.reqly/config.json - never in the project's .reqly/ so tokens never
  // touch git. Merges per provider so partial updates keep existing keys.
  async setSecretProviderConfig(provider: string, providerConfig: Record<string, string>): Promise<void> {
    const config = await this.loadConfigForWrite();
    config.secretProviders = config.secretProviders || {};
    config.secretProviders[provider] = { ...config.secretProviders[provider], ...providerConfig };
    await this.saveConfig(config);
  }

  // Listing for UI/MCP: which providers have config and which keys are set.
  // Values are intentionally omitted - tokens must never round-trip out.
  async getSecretProviders(): Promise<Record<string, { configuredKeys: string[] }>> {
    const config = await this.loadConfig();
    const result: Record<string, { configuredKeys: string[] }> = {};
    for (const [name, providerConfig] of Object.entries(config.secretProviders || {})) {
      result[name] = { configuredKeys: Object.keys(providerConfig as Record<string, string>) };
    }
    return result;
  }

  /**
   * Refresh an OAuth2 access token using the stored refresh_token.
   * Persists the new tokens back to config. Returns the updated profile.
   */
  async refreshOAuth2Token(
    profileId: string,
    fetchFn: typeof undiciFetch = undiciFetch,
  ): Promise<AuthProfile> {
    const profile = await this.getProfile(profileId);

    if (profile.type !== AuthType.OAUTH2) {
      throw new Error(`Profile "${profile.name}" is not an OAuth2 profile`);
    }

    const { refreshToken, clientId, clientSecret, tokenUrl } = profile.credentials;
    if (!refreshToken) throw new Error('No refresh token stored on this profile');
    if (!tokenUrl) throw new Error('No tokenUrl configured on this profile');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId || '',
      ...(clientSecret ? { client_secret: clientSecret } : {}),
    });

    const res = await fetchFn(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Token refresh failed: ${res.status}`);
    }

    const data: any = await res.json();
    const expiresAt = data.expires_in
      ? Date.now() + Number(data.expires_in) * 1000
      : undefined;

    const updatedCreds: Record<string, string> = {
      ...profile.credentials,
      accessToken: data.access_token,
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      ...(expiresAt !== undefined ? { expiresAt: String(expiresAt) } : {}),
    };

    return this.updateProfile(profileId, { credentials: updatedCreds });
  }

  async getWorkspaceProjects(): Promise<string[]> {
    const config = await this.loadConfig();
    return config.workspaceProjects || [];
  }

  async addWorkspaceProject(projectPath: string): Promise<void> {
    const config = await this.loadConfigForWrite();
    const projects = config.workspaceProjects || [];
    if (!projects.includes(projectPath)) {
      projects.push(projectPath);
      config.workspaceProjects = projects;
      await this.saveConfig(config);
    }
  }

  async removeWorkspaceProject(projectPath: string): Promise<void> {
    const config = await this.loadConfigForWrite();
    if (!config.workspaceProjects) return;
    config.workspaceProjects = config.workspaceProjects.filter(p => p !== projectPath);
    await this.saveConfig(config);
  }
}
