import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { KeyValueEditor } from './KeyValueEditor';
import type { KeyValuePair } from './KeyValueEditor';
import {
  getCollectionVariables,
  setCollectionVariable,
  deleteCollectionVariable,
  getCollectionAuth,
  setCollectionAuth,
  deleteCollectionAuth,
  fetchAuthProfiles,
  getCollectionSpec,
  setCollectionSpec,
  deleteCollectionSpec,
  fetchEnvironments,
  fetchDotenvFiles,
} from '../api';
import { VariableInput } from './VariableInput';
import type { VariableItem } from './VariableInput';

interface CollectionSettingsModalProps {
  collectionName: string;
  onClose: () => void;
}

const AUTH_TYPES = ['none', 'bearer', 'apiKey', 'basic', 'oauth2', 'mtls', 'awsv4'] as const;
type AuthTabType = typeof AUTH_TYPES[number];

export function CollectionSettingsModal({ collectionName, onClose }: CollectionSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'variables' | 'auth' | 'contract'>('variables');

  // Variables tab state
  const [pairs, setPairs] = useState<KeyValuePair[]>([]);
  const [originalKeys, setOriginalKeys] = useState<string[]>([]);
  const [varsLoaded, setVarsLoaded] = useState(false);
  const [varsSaving, setVarsSaving] = useState(false);
  const [varsSaved, setVarsSaved] = useState(false);

  // Auth tab state
  const [authLoaded, setAuthLoaded] = useState(false);
  const [authSaving, setAuthSaving] = useState(false);
  const [authSaved, setAuthSaved] = useState(false);
  const [authType, setAuthType] = useState<AuthTabType>('none');
  const [authProfileId, setAuthProfileId] = useState('');
  const [authCreds, setAuthCreds] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<any[]>([]);

  // Contract tab state
  const [specSource, setSpecSource] = useState<'path' | 'url'>('path');
  const [specValue, setSpecValue] = useState('');
  const [specLoaded, setSpecLoaded] = useState(false);
  const [specOperationCount, setSpecOperationCount] = useState<number | null>(null);
  const [specConfigured, setSpecConfigured] = useState(false);
  const [specSaving, setSpecSaving] = useState(false);
  const [specError, setSpecError] = useState('');

  // Global variables for autocompletion
  const [activeEnvVars, setActiveEnvVars] = useState<Record<string, string>>({});
  const [activeEnvName, setActiveEnvName] = useState<string>('');
  const [collectionVars, setCollectionVars] = useState<Record<string, string>>({});
  const [dotenvVars, setDotenvVars] = useState<{ key: string; source: string }[]>([]);

  const availableVariables: VariableItem[] = [
    ...Object.entries(collectionVars).map(([k, v]) => ({
      name: k,
      sourceType: 'collection',
      sourceName: collectionName,
      value: v,
    })),
    ...Object.entries(activeEnvVars)
      .filter(([k]) => !(k in collectionVars))
      .map(([k, v]) => ({
        name: k,
        sourceType: 'env',
        sourceName: activeEnvName || 'env',
        value: v,
      })),
    ...dotenvVars
      .filter((v) => !(v.key in collectionVars) && !(v.key in activeEnvVars))
      .map((v) => ({
        name: v.key,
        sourceType: 'dotenv',
        sourceName: v.source,
        value: 'hidden',
      })),
  ];

  useEffect(() => {
    getCollectionVariables(collectionName).then((vars) => {
      setCollectionVars(vars);
      const entries = Object.entries(vars);
      setPairs(entries.map(([key, value]) => ({ key, value, enabled: true })));
      setOriginalKeys(entries.map(([key]) => key));
      setVarsLoaded(true);
    }).catch(console.error);

    fetchEnvironments().then((data: any) => {
      const active = data.environments?.find((e: any) => e.name === data.active);
      setActiveEnvName(active?.name || '');
      setActiveEnvVars(active?.variables || {});
    }).catch(console.error);

    fetchDotenvFiles().then((data: any) => setDotenvVars(data.variables || [])).catch(console.error);

    Promise.all([
      getCollectionAuth(collectionName),
      fetchAuthProfiles(),
    ]).then(([auth, profs]) => {
      setProfiles(profs);
      if (auth) {
        setAuthType((auth.type as AuthTabType) || 'none');
        setAuthProfileId(auth.profileId || '');
        setAuthCreds(auth.credentials || {});
      }
      setAuthLoaded(true);
    }).catch(console.error);

    getCollectionSpec(collectionName).then((spec) => {
      if (spec.specPath) { setSpecSource('path'); setSpecValue(spec.specPath); setSpecConfigured(true); }
      else if (spec.specUrl) { setSpecSource('url'); setSpecValue(spec.specUrl); setSpecConfigured(true); }
      else { setSpecConfigured(false); setSpecValue(''); }
      setSpecOperationCount(spec.loaded ? spec.operationCount : null);
    }).catch(console.error).finally(() => setSpecLoaded(true));
  }, [collectionName]);

  const handleSaveVars = async () => {
    setVarsSaving(true);
    setVarsSaved(false);
    try {
      const newKeys = new Set(pairs.filter(p => p.key.trim() && p.enabled).map(p => p.key.trim()));
      for (const key of originalKeys) {
        if (!newKeys.has(key)) await deleteCollectionVariable(collectionName, key);
      }
      for (const pair of pairs) {
        if (pair.key.trim() && pair.enabled) {
          await setCollectionVariable(collectionName, pair.key.trim(), pair.value);
        }
      }
      setOriginalKeys([...newKeys]);
      window.dispatchEvent(new Event('reqly-reload'));
      setVarsSaved(true);
      setTimeout(() => setVarsSaved(false), 2000);
    } catch (e) {
      console.error(e);
      alert('Failed to save collection variables');
    } finally {
      setVarsSaving(false);
    }
  };

  const handleSaveAuth = async () => {
    setAuthSaving(true);
    setAuthSaved(false);
    try {
      if (authType === 'none' && !authProfileId) {
        await deleteCollectionAuth(collectionName);
      } else {
        const payload: { type: string; profileId?: string; credentials?: Record<string, string> } = { type: authType };
        if (authProfileId) payload.profileId = authProfileId;
        else if (Object.keys(authCreds).length > 0) payload.credentials = authCreds;
        await setCollectionAuth(collectionName, payload);
      }
      window.dispatchEvent(new Event('reqly-reload'));
      setAuthSaved(true);
      setTimeout(() => setAuthSaved(false), 2000);
    } catch (e) {
      console.error(e);
      alert('Failed to save collection auth');
    } finally {
      setAuthSaving(false);
    }
  };

  const handleLoadSpec = async () => {
    if (!specValue.trim()) return;
    setSpecSaving(true);
    setSpecError('');
    try {
      const payload = specSource === 'path' ? { specPath: specValue.trim() } : { specUrl: specValue.trim() };
      const result = await setCollectionSpec(collectionName, payload);
      setSpecOperationCount(result.operationCount);
      setSpecConfigured(true);
      window.dispatchEvent(new Event('reqly-reload'));
    } catch (e: any) {
      setSpecError(e.message || 'Failed to load spec');
    } finally {
      setSpecSaving(false);
    }
  };

  const handleRemoveSpec = async () => {
    setSpecSaving(true);
    try {
      await deleteCollectionSpec(collectionName);
      setSpecConfigured(false);
      setSpecValue('');
      setSpecOperationCount(null);
      window.dispatchEvent(new Event('reqly-reload'));
    } catch (e: any) {
      setSpecError(e.message || 'Failed to remove spec');
    } finally {
      setSpecSaving(false);
    }
  };

  const inputCls = 'w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none';

  return (
    <Modal title={`${collectionName} - Settings`} onClose={onClose} icon={<Settings size={16} />} width="w-[580px]">
      <div className="flex border-b mb-4" style={{ borderColor: 'var(--border)' }}>
        {(['variables', 'auth', 'contract'] as const).map(tab => (
          <button
            key={tab}
            className="px-3 py-2 text-sm font-medium border-b-2 capitalize"
            style={{
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              borderColor: activeTab === tab ? 'var(--accent)' : 'transparent',
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'auth' ? 'Auth' : tab === 'contract' ? 'Contract' : 'Variables'}
          </button>
        ))}
      </div>

      {activeTab === 'variables' && (
        <>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Collection variables are always available to requests in this collection, regardless of the active environment. They take priority over environment variables with the same name.
          </p>
          {varsLoaded && <KeyValueEditor pairs={pairs} onChange={setPairs} />}
          <ModalFooter>
            {varsSaved && <span className="text-xs self-center mr-2" style={{ color: 'var(--accent)' }}>Saved</span>}
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={handleSaveVars} disabled={varsSaving}>{varsSaving ? 'Saving...' : 'Save'}</Button>
          </ModalFooter>
        </>
      )}

      {activeTab === 'auth' && authLoaded && (
        <>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Auth set here applies to every request in this collection unless a request configures its own auth or sets its type to <strong>None</strong>.
          </p>

          <div className="space-y-5">
            {/* Profile picker */}
            <div className="flex gap-4 items-center">
              <label className="text-sm font-semibold text-gray-300 w-24 shrink-0">Profile</label>
              <select
                className="flex-1 bg-[var(--surface-3)] text-gray-200 border border-[var(--border-strong)] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                value={authProfileId}
                onChange={e => {
                  const id = e.target.value;
                  setAuthProfileId(id);
                  if (id) {
                    const prof = profiles.find(p => p.id === id);
                    if (prof) { setAuthType(prof.type as AuthTabType); setAuthCreds(prof.credentials || {}); }
                  } else {
                    setAuthType('none');
                    setAuthCreds({});
                  }
                }}
              >
                <option value="">Inline Auth (No Profile)</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </select>
            </div>

            {/* Type selector */}
            <div className="flex gap-4 items-center">
              <label className="text-sm font-semibold text-gray-300 w-24 shrink-0">Auth Type</label>
              <div className="flex gap-2 flex-wrap">
                {AUTH_TYPES.map(t => (
                  <button
                    key={t}
                    disabled={!!authProfileId}
                    className={`px-3 py-1 rounded text-sm capitalize transition-colors ${authType === t ? 'bg-blue-600 text-white' : 'bg-[var(--surface-3)] text-gray-400 hover:bg-[var(--surface-4)]'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    onClick={() => { setAuthType(t); setAuthCreds({}); }}
                  >
                    {t === 'apiKey' ? 'API Key' : t === 'oauth2' ? 'OAuth 2.0' : t === 'mtls' ? 'mTLS' : t === 'none' ? 'None' : t === 'awsv4' ? 'AWS SigV4' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Credential fields */}
            <div className="bg-[var(--surface-1)] p-4 rounded border border-[var(--border)] space-y-4">
              {authType === 'none' && (
                <p className="text-sm text-gray-500 italic">No collection-level auth. Each request uses its own auth configuration.</p>
              )}

              {authType === 'bearer' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Token</label>
                  <VariableInput
                    variables={availableVariables}
                    disabled={!!authProfileId}
                    className={inputCls}
                    placeholder="Bearer token or {{variable}}"
                    value={authCreds.token || ''}
                    onChange={val => setAuthCreds({ ...authCreds, token: val })}
                  />
                </div>
              )}

              {authType === 'apiKey' && (
                <>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-1">Key Name</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className={inputCls}
                        placeholder="X-API-Key"
                        value={authCreds.keyName || ''}
                        onChange={val => setAuthCreds({ ...authCreds, keyName: val })}
                      />
                    </div>
                    <div className="w-40">
                      <label className="block text-sm text-gray-400 mb-1">Placement</label>
                      <select
                        disabled={!!authProfileId}
                        className={inputCls}
                        value={authCreds.placement || 'header'}
                        onChange={e => setAuthCreds({ ...authCreds, placement: e.target.value })}
                      >
                        <option value="header">Header</option>
                        <option value="query">Query Param</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Value</label>
                    <VariableInput
                      variables={availableVariables}
                      disabled={!!authProfileId}
                      className={inputCls}
                      value={authCreds.value || ''}
                      onChange={val => setAuthCreds({ ...authCreds, value: val })}
                    />
                  </div>
                </>
              )}

              {authType === 'basic' && (
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm text-gray-400 mb-1">Username</label>
                    <VariableInput
                      variables={availableVariables}
                      disabled={!!authProfileId}
                      className={inputCls}
                      value={authCreds.username || ''}
                      onChange={val => setAuthCreds({ ...authCreds, username: val })}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-gray-400 mb-1">Password</label>
                    <VariableInput
                      type="password"
                      variables={availableVariables}
                      disabled={!!authProfileId}
                      className={inputCls}
                      value={authCreds.password || ''}
                      onChange={val => setAuthCreds({ ...authCreds, password: val })}
                    />
                  </div>
                </div>
              )}

              {authType === 'oauth2' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Client ID</label>
                      <VariableInput variables={availableVariables} disabled={!!authProfileId} className={inputCls} value={authCreds.clientId || ''} onChange={val => setAuthCreds({ ...authCreds, clientId: val })} />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Client Secret</label>
                      <VariableInput type="password" variables={availableVariables} disabled={!!authProfileId} className={inputCls} value={authCreds.clientSecret || ''} onChange={val => setAuthCreds({ ...authCreds, clientSecret: val })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Token URL</label>
                    <VariableInput variables={availableVariables} disabled={!!authProfileId} className={inputCls} placeholder="https://provider.com/oauth/token" value={authCreds.tokenUrl || ''} onChange={val => setAuthCreds({ ...authCreds, tokenUrl: val })} />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Scope</label>
                    <VariableInput variables={availableVariables} disabled={!!authProfileId} className={inputCls} placeholder="openid profile email" value={authCreds.scope || ''} onChange={val => setAuthCreds({ ...authCreds, scope: val })} />
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    For OAuth 2.0 collection auth, reference a saved profile with an access token via the Profile picker above.
                  </p>
                </div>
              )}

              {authType === 'mtls' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Certificate (PEM) path</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className={inputCls}
                        placeholder="{{cert_dir}}/client.crt"
                        value={authCreds.certPath || ''}
                        onChange={val => setAuthCreds({ ...authCreds, certPath: val })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Private key path</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className={inputCls}
                        placeholder="{{cert_dir}}/client.key"
                        value={authCreds.keyPath || ''}
                        onChange={val => setAuthCreds({ ...authCreds, keyPath: val })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">PKCS#12 (PFX) path</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className={inputCls}
                        placeholder="{{cert_dir}}/client.pfx"
                        value={authCreds.pfxPath || ''}
                        onChange={val => setAuthCreds({ ...authCreds, pfxPath: val })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Passphrase</label>
                      <VariableInput
                        variables={availableVariables}
                        type="password"
                        disabled={!!authProfileId}
                        className={inputCls}
                        placeholder="{{mtls_passphrase}}"
                        value={authCreds.passphrase || ''}
                        onChange={val => setAuthCreds({ ...authCreds, passphrase: val })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Custom Root CA path (optional)</label>
                    <VariableInput
                      variables={availableVariables}
                      disabled={!!authProfileId}
                      className={inputCls}
                      placeholder="{{cert_dir}}/ca.crt"
                      value={authCreds.caPath || ''}
                      onChange={val => setAuthCreds({ ...authCreds, caPath: val })}
                    />
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Provide either (Certificate + Private Key) OR a (PFX) file. All fields support <code>{'{{variables}}'}</code> to avoid hardcoding secrets in YAML. Store files outside the project repo (e.g. <code>~/.reqly/certs/</code>).
                  </p>
                </div>
              )}

              {authType === 'awsv4' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Access Key ID</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className={inputCls}
                        placeholder="AKIAIOSFODNN7EXAMPLE"
                        value={authCreds.accessKey || ''}
                        onChange={val => setAuthCreds({ ...authCreds, accessKey: val })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Secret Access Key</label>
                      <VariableInput
                        type="password"
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className={inputCls}
                        placeholder="wJalrXUtnFEMI/K7MDENG"
                        value={authCreds.secretKey || ''}
                        onChange={val => setAuthCreds({ ...authCreds, secretKey: val })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Region</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className={inputCls}
                        placeholder="us-east-1"
                        value={authCreds.region || ''}
                        onChange={val => setAuthCreds({ ...authCreds, region: val })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Service</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className={inputCls}
                        placeholder="execute-api"
                        value={authCreds.service || ''}
                        onChange={val => setAuthCreds({ ...authCreds, service: val })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Session Token (optional - for temporary credentials)</label>
                    <VariableInput
                      type="password"
                      variables={availableVariables}
                      disabled={!!authProfileId}
                      className={inputCls}
                      placeholder="{{aws_session_token}}"
                      value={authCreds.sessionToken || ''}
                      onChange={val => setAuthCreds({ ...authCreds, sessionToken: val })}
                    />
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    SigV4 signs REST and GraphQL requests via headers (Authorization, X-Amz-Date). For WebSocket connections (AppSync, IoT Core), the signature is applied as query parameters. Use <code>{'{{variables}}'}</code> to avoid hardcoding credentials in YAML.
                  </p>
                </div>
              )}
            </div>
          </div>

          <ModalFooter>
            {authSaved && <span className="text-xs self-center mr-2" style={{ color: 'var(--accent)' }}>Saved</span>}
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={handleSaveAuth} disabled={authSaving}>{authSaving ? 'Saving...' : 'Save'}</Button>
          </ModalFooter>
        </>
      )}

      {activeTab === 'contract' && specLoaded && (
        <>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Configure an OpenAPI/Swagger spec to validate every response from this collection against it. Violations show up in the response viewer's Contract tab and in run_request's contractViolations.
          </p>

          <div className="space-y-4">
            <div className="flex gap-4 items-center">
              <label className="text-sm font-semibold text-gray-300 w-24 shrink-0">Source</label>
              <div className="flex gap-2">
                {(['path', 'url'] as const).map(s => (
                  <button
                    key={s}
                    className={`px-3 py-1 rounded text-sm capitalize transition-colors ${specSource === s ? 'bg-blue-600 text-white' : 'bg-[var(--surface-3)] text-gray-400 hover:bg-[var(--surface-4)]'}`}
                    onClick={() => setSpecSource(s)}
                  >
                    {s === 'path' ? 'File path' : 'URL'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4 items-center">
              <label className="text-sm font-semibold text-gray-300 w-24 shrink-0">{specSource === 'path' ? 'Path' : 'URL'}</label>
              <VariableInput
                variables={availableVariables}
                className={inputCls}
                placeholder={specSource === 'path' ? './openapi.yaml' : 'https://api.example.com/openapi.json'}
                value={specValue}
                onChange={val => setSpecValue(val)}
              />
            </div>

            {specConfigured && (
              <div className="bg-[var(--surface-1)] p-3 rounded border border-[var(--border)] text-sm" style={{ color: 'var(--text-secondary)' }}>
                {specOperationCount !== null
                  ? `Loaded - ${specOperationCount} operation${specOperationCount === 1 ? '' : 's'} found.`
                  : 'Configured but not currently loaded.'}
              </div>
            )}

            {specError && <p className="text-xs text-red-400">{specError}</p>}
          </div>

          <ModalFooter>
            {specConfigured && (
              <Button variant="ghost" onClick={handleRemoveSpec} disabled={specSaving}>Remove</Button>
            )}
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={handleLoadSpec} disabled={specSaving || !specValue.trim()}>
              {specSaving ? 'Loading...' : 'Load spec'}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

