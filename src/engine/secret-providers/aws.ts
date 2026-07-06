import { SecretProvider } from './index.js';

// Narrow client abstraction over @aws-sdk/client-secrets-manager so tests
// inject a mock and the SDK only loads when an aws:// URI is resolved.
export interface AwsClientLike {
  getSecretValue(secretId: string): Promise<{ SecretString?: string; SecretBinary?: Uint8Array }>;
}

export interface AwsProviderOptions {
  loadConfig: () => Promise<any>;
  clientFactory?: (region: string) => Promise<AwsClientLike>;
}

// aws://my-secret-name or aws://arn:aws:secretsmanager:us-east-1:123456:secret:name.
// The full ARN form carries its own region as the 4th colon segment.
export function parseAwsUri(uri: string): { secretId: string; arnRegion: string | undefined } {
  const secretId = uri.slice('aws://'.length);
  if (!secretId) {
    throw new Error(`Invalid AWS Secrets Manager URI "${uri}". Expected aws://secret-name or aws://arn:aws:secretsmanager:...`);
  }
  let arnRegion: string | undefined;
  if (secretId.startsWith('arn:')) {
    arnRegion = secretId.split(':')[3] || undefined;
  }
  return { secretId, arnRegion };
}

async function defaultClientFactory(region: string): Promise<AwsClientLike> {
  const sdk: any = await import('@aws-sdk/client-secrets-manager');
  const client = new sdk.SecretsManagerClient({ region });
  return {
    getSecretValue: (secretId: string) => client.send(new sdk.GetSecretValueCommand({ SecretId: secretId })),
  };
}

// Resolves aws:// URIs against AWS Secrets Manager using the standard AWS
// credential chain (env vars, ~/.aws/credentials, IAM role) - Reqly never
// stores AWS credentials. Region: AWS_REGION / AWS_DEFAULT_REGION env var >
// region embedded in an ARN > secretProviders.aws.region in ~/.reqly/config.json.
export class AwsSecretsProvider implements SecretProvider {
  readonly prefix = 'aws://';

  constructor(private options: AwsProviderOptions) {}

  async resolve(uri: string): Promise<string> {
    const { secretId, arnRegion } = parseAwsUri(uri);

    const config = await this.options.loadConfig();
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || arnRegion || config?.secretProviders?.aws?.region;
    if (!region) {
      throw new Error('AWS region missing. Set AWS_REGION (or use a full ARN in the aws:// URI, or configure secretProviders.aws.region in ~/.reqly/config.json)');
    }

    const client = await (this.options.clientFactory ?? defaultClientFactory)(region);
    const response = await client.getSecretValue(secretId);

    if (response.SecretString !== undefined) return response.SecretString;
    if (response.SecretBinary) return Buffer.from(response.SecretBinary).toString('utf8');
    throw new Error(`AWS secret "${secretId}" has no SecretString or SecretBinary payload`);
  }
}
