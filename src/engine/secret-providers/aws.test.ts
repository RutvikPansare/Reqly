import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AwsSecretsProvider, parseAwsUri } from './aws.js';

describe('parseAwsUri', () => {
  it('parses a plain secret name', () => {
    expect(parseAwsUri('aws://my-prod-secret')).toEqual({ secretId: 'my-prod-secret', arnRegion: undefined });
  });

  it('parses a full ARN and extracts its region', () => {
    const arn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-AbC123';
    expect(parseAwsUri(`aws://${arn}`)).toEqual({ secretId: arn, arnRegion: 'us-east-1' });
  });

  it('throws on an empty secret id', () => {
    expect(() => parseAwsUri('aws://')).toThrow(/aws:\/\/secret-name/);
  });
});

describe('AwsSecretsProvider', () => {
  const origRegion = process.env.AWS_REGION;
  const origDefault = process.env.AWS_DEFAULT_REGION;

  beforeEach(() => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
  });

  afterEach(() => {
    if (origRegion === undefined) delete process.env.AWS_REGION; else process.env.AWS_REGION = origRegion;
    if (origDefault === undefined) delete process.env.AWS_DEFAULT_REGION; else process.env.AWS_DEFAULT_REGION = origDefault;
  });

  function makeMock(response: any = { SecretString: 'sk-aws-value' }) {
    const getSecretValue = vi.fn().mockResolvedValue(response);
    const clientFactory = vi.fn().mockResolvedValue({ getSecretValue });
    return { getSecretValue, clientFactory };
  }

  it('has the aws:// prefix', () => {
    const provider = new AwsSecretsProvider({ loadConfig: async () => ({}) });
    expect(provider.prefix).toBe('aws://');
  });

  it('errors clearly when no region is available', async () => {
    const provider = new AwsSecretsProvider({ loadConfig: async () => ({}) });
    await expect(provider.resolve('aws://my-secret')).rejects.toThrow(/Set AWS_REGION/);
  });

  it('resolves a secret by name using the env region', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    const { getSecretValue, clientFactory } = makeMock();
    const provider = new AwsSecretsProvider({ loadConfig: async () => ({}), clientFactory });
    await expect(provider.resolve('aws://my-secret')).resolves.toBe('sk-aws-value');
    expect(clientFactory).toHaveBeenCalledWith('eu-west-1');
    expect(getSecretValue).toHaveBeenCalledWith('my-secret');
  });

  it('uses the region embedded in an ARN when no env region is set', async () => {
    const arn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:prod-key-XyZ';
    const { getSecretValue, clientFactory } = makeMock();
    const provider = new AwsSecretsProvider({ loadConfig: async () => ({}), clientFactory });
    await provider.resolve(`aws://${arn}`);
    expect(clientFactory).toHaveBeenCalledWith('us-east-1');
    expect(getSecretValue).toHaveBeenCalledWith(arn);
  });

  it('falls back to secretProviders.aws.region from config', async () => {
    const { clientFactory } = makeMock();
    const provider = new AwsSecretsProvider({
      loadConfig: async () => ({ secretProviders: { aws: { region: 'ap-south-1' } } }),
      clientFactory,
    });
    await provider.resolve('aws://my-secret');
    expect(clientFactory).toHaveBeenCalledWith('ap-south-1');
  });

  it('env region wins over config region', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    const { clientFactory } = makeMock();
    const provider = new AwsSecretsProvider({
      loadConfig: async () => ({ secretProviders: { aws: { region: 'ap-south-1' } } }),
      clientFactory,
    });
    await provider.resolve('aws://my-secret');
    expect(clientFactory).toHaveBeenCalledWith('eu-west-1');
  });

  it('surfaces AWS auth errors with the original message intact', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    const getSecretValue = vi.fn().mockRejectedValue(new Error('The security token included in the request is invalid.'));
    const provider = new AwsSecretsProvider({
      loadConfig: async () => ({}),
      clientFactory: vi.fn().mockResolvedValue({ getSecretValue }),
    });
    await expect(provider.resolve('aws://my-secret')).rejects.toThrow('The security token included in the request is invalid.');
  });

  it('decodes SecretBinary when SecretString is absent', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    const { clientFactory } = makeMock({ SecretBinary: new TextEncoder().encode('binary-secret') });
    const provider = new AwsSecretsProvider({ loadConfig: async () => ({}), clientFactory });
    await expect(provider.resolve('aws://my-secret')).resolves.toBe('binary-secret');
  });

  it('errors when the response has no secret payload', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    const { clientFactory } = makeMock({});
    const provider = new AwsSecretsProvider({ loadConfig: async () => ({}), clientFactory });
    await expect(provider.resolve('aws://my-secret')).rejects.toThrow(/no SecretString or SecretBinary/);
  });
});
