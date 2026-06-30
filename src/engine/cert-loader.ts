import * as fs from 'fs';

export class CertLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertLoadError';
  }
}

export interface CertPaths {
  certPath?: string;
  keyPath?: string;
  pfxPath?: string;
  passphrase?: string;
  caPath?: string;
}

export interface CertBuffers {
  cert?: Buffer;
  key?: Buffer;
  pfx?: Buffer;
  passphrase?: string;
  ca?: Buffer[];
}

export function loadCert({ certPath, keyPath, pfxPath, passphrase, caPath }: CertPaths): CertBuffers {
  const result: CertBuffers = {};
  
  if (passphrase !== undefined) {
    result.passphrase = passphrase;
  }

  if (pfxPath) {
    if (!fs.existsSync(pfxPath)) {
      throw new CertLoadError(`mTLS PFX file not found: ${pfxPath}`);
    }
    result.pfx = fs.readFileSync(pfxPath);
  } else {
    if (certPath && !fs.existsSync(certPath)) {
      throw new CertLoadError(`Client certificate file not found: ${certPath}`);
    }
    if (keyPath && !fs.existsSync(keyPath)) {
      throw new CertLoadError(`Client key file not found: ${keyPath}`);
    }
    if (certPath) result.cert = fs.readFileSync(certPath);
    if (keyPath) result.key = fs.readFileSync(keyPath);
  }

  if (caPath) {
    if (!fs.existsSync(caPath)) {
      throw new CertLoadError(`Custom Root CA file not found: ${caPath}`);
    }
    result.ca = [fs.readFileSync(caPath)];
  }

  return result;
}
