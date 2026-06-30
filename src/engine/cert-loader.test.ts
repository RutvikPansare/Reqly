import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadCert, CertLoadError } from './cert-loader.js';

const FAKE_CERT = '-----BEGIN CERTIFICATE-----\nfakecert\n-----END CERTIFICATE-----';
const FAKE_KEY  = '-----BEGIN PRIVATE KEY-----\nfakekey\n-----END PRIVATE KEY-----';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-cert-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadCert', () => {
  it('reads cert and key PEM files and returns buffers', () => {
    const certFile = path.join(tmpDir, 'client.crt');
    const keyFile  = path.join(tmpDir, 'client.key');
    fs.writeFileSync(certFile, FAKE_CERT);
    fs.writeFileSync(keyFile, FAKE_KEY);

    const result = loadCert({ certPath: certFile, keyPath: keyFile });

    expect(result.cert.toString()).toBe(FAKE_CERT);
    expect(result.key.toString()).toBe(FAKE_KEY);
  });

  it('throws CertLoadError when cert file does not exist', () => {
    const keyFile = path.join(tmpDir, 'client.key');
    fs.writeFileSync(keyFile, FAKE_KEY);

    expect(() =>
      loadCert({ certPath: '/nonexistent/cert.pem', keyPath: keyFile })
    ).toThrow(CertLoadError);
  });

  it('throws CertLoadError when key file does not exist', () => {
    const certFile = path.join(tmpDir, 'client.crt');
    fs.writeFileSync(certFile, FAKE_CERT);

    expect(() =>
      loadCert({ certPath: certFile, keyPath: '/nonexistent/key.pem' })
    ).toThrow(CertLoadError);
  });

  it('error message includes the missing path', () => {
    const missing = '/no/such/file.pem';
    const keyFile = path.join(tmpDir, 'client.key');
    fs.writeFileSync(keyFile, FAKE_KEY);

    let msg = '';
    try {
      loadCert({ certPath: missing, keyPath: keyFile });
    } catch (e: any) {
      msg = e.message;
    }
    expect(msg).toContain(missing);
  });

  it('returns cert and key as Buffer instances', () => {
    const certFile = path.join(tmpDir, 'client.crt');
    const keyFile  = path.join(tmpDir, 'client.key');
    fs.writeFileSync(certFile, FAKE_CERT);
    fs.writeFileSync(keyFile, FAKE_KEY);

    const result = loadCert({ certPath: certFile, keyPath: keyFile });

    expect(Buffer.isBuffer(result.cert)).toBe(true);
    expect(Buffer.isBuffer(result.key)).toBe(true);
  });

  it('reads pfx file if provided', () => {
    const pfxFile = path.join(tmpDir, 'client.pfx');
    fs.writeFileSync(pfxFile, 'fakepfx');
    
    const result = loadCert({ pfxPath: pfxFile, passphrase: 'test' });
    
    expect(result.pfx?.toString()).toBe('fakepfx');
    expect(result.passphrase).toBe('test');
    expect(result.cert).toBeUndefined();
  });

  it('reads ca file if provided', () => {
    const caFile = path.join(tmpDir, 'ca.crt');
    fs.writeFileSync(caFile, 'fakeca');
    
    const result = loadCert({ caPath: caFile });
    
    expect(result.ca?.[0].toString()).toBe('fakeca');
  });

  it('throws when pfx does not exist', () => {
    expect(() => loadCert({ pfxPath: '/no/such.pfx' })).toThrow(/PFX file not found/);
  });
  
  it('throws when ca does not exist', () => {
    expect(() => loadCert({ caPath: '/no/such.ca' })).toThrow(/Root CA file not found/);
  });
});
