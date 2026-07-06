import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { load as yamlLoad } from 'js-yaml';
import Ajv from 'ajv';

const pkgDir = path.join(__dirname, '..');
const schemasDir = path.join(pkgDir, 'schemas');

function loadSchema(name: string) {
  return JSON.parse(fs.readFileSync(path.join(schemasDir, name), 'utf8'));
}

function validator(schemaFile: string) {
  const ajv = new Ajv({ allowUnionTypes: true, strict: false });
  return ajv.compile(loadSchema(schemaFile));
}

describe('generated YAML schemas (T-237)', () => {
  beforeAll(() => {
    execSync('node scripts/generate-schemas.mjs', { cwd: pkgDir, stdio: 'pipe' });
  });

  it('emits all four schema files', () => {
    for (const f of [
      'reqly-request.schema.json',
      'reqly-collection-meta.schema.json',
      'reqly-environments.schema.json',
      'reqly-flow.schema.json',
    ]) {
      expect(fs.existsSync(path.join(schemasDir, f)), f).toBe(true);
    }
  });

  it('accepts a valid request YAML', () => {
    const validate = validator('reqly-request.schema.json');
    const doc = yamlLoad(`
name: get-user
method: GET
url: '{{baseUrl}}/users/1'
assertions:
  - field: status
    operator: eq
    value: 200
`);
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects a typo like "methd" and a bad method value', () => {
    const validate = validator('reqly-request.schema.json');
    expect(validate({ name: 'x', methd: 'GET', url: 'https://a.dev' })).toBe(false);
    expect(validate({ name: 'x', method: 'YEET', url: 'https://a.dev' })).toBe(false);
  });

  it('does not require id on request files (assigned at load time)', () => {
    const validate = validator('reqly-request.schema.json');
    expect(validate({ name: 'x', method: 'GET', url: 'https://a.dev' }), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts a valid environments.yaml store', () => {
    const validate = validator('reqly-environments.schema.json');
    const doc = yamlLoad(`
environments:
  - id: env-1
    name: dev
    variables:
      baseUrl: https://dev.example.com
active: dev
`);
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts a valid flow and rejects an unknown step type', () => {
    const validate = validator('reqly-flow.schema.json');
    const good = yamlLoad(`
name: signup-flow
steps:
  - type: run
    id: login
    collection: users
    request: login
  - type: extract
    id: grab-token
    from: login
    into: authToken
`);
    expect(validate(good), JSON.stringify(validate.errors)).toBe(true);
    const bad = yamlLoad(`
name: broken
steps:
  - type: teleport
    id: nope
`);
    expect(validate(bad)).toBe(false);
  });

  it('accepts collection meta with variables and auth', () => {
    const validate = validator('reqly-collection-meta.schema.json');
    const doc = yamlLoad(`
description: user endpoints
variables:
  baseUrl: https://api.example.com
auth:
  type: bearer
  credentials:
    token: '{{API_TOKEN}}'
`);
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
  });

  it('validates the real starter-collection files in this repo', () => {
    const validate = validator('reqly-request.schema.json');
    const starterDir = path.join(pkgDir, '..', '..', 'example', 'reqly-starter', '.reqly', 'jsonplaceholder');
    const files = fs.readdirSync(starterDir).filter(f => f.endsWith('.yaml') && f !== 'collection.yaml');
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const doc = yamlLoad(fs.readFileSync(path.join(starterDir, f), 'utf8'));
      expect(validate(doc), `${f}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });
});
