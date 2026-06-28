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
} from '../api';

interface CollectionSettingsModalProps {
  collectionName: string;
  onClose: () => void;
}

const AUTH_TYPES = ['none', 'bearer', 'apiKey', 'basic', 'oauth2'] as const;
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

  useEffect(() => {
    getCollectionVariables(collectionName).then((vars) => {
      const entries = Object.entries(vars);
      setPairs(entries.map(([key, value]) => ({ key, value, enabled: true })));
      setOriginalKeys(entries.map(([key]) => key));
      setVarsLoaded(true);
    }).catch(console.error);

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
                    {t === 'apiKey' ? 'API Key' : t === 'oauth2' ? 'OAuth 2.0' : t === 'none' ? 'None' : t.charAt(0).toUpperCase() + t.slice(1)}
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
                  <input
                    disabled={!!authProfileId}
                    className={inputCls}
                    placeholder="Bearer token or {{variable}}"
                    value={authCreds.token || ''}
                    onChange={e => setAuthCreds({ ...authCreds, token: e.target.value })}
                  />
                </div>
              )}

              {authType === 'apiKey' && (
                <>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-1">Key Name</label>
                      <input
                        disabled={!!authProfileId}
                        className={inputCls}
                        placeholder="X-API-Key"
                        value={authCreds.keyName || ''}
                        onChange={e => setAuthCreds({ ...authCreds, keyName: e.target.value })}
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
                    <input
                      disabled={!!authProfileId}
                      className={inputCls}
                      value={authCreds.value || ''}
                      onChange={e => setAuthCreds({ ...authCreds, value: e.target.value })}
                    />
                  </div>
                </>
              )}

              {authType === 'basic' && (
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm text-gray-400 mb-1">Username</label>
                    <input
                      disabled={!!authProfileId}
                      className={inputCls}
                      value={authCreds.username || ''}
                      onChange={e => setAuthCreds({ ...authCreds, username: e.target.value })}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-gray-400 mb-1">Password</label>
                    <input
                      type="password"
                      disabled={!!authProfileId}
                      className={inputCls}
                      value={authCreds.password || ''}
                      onChange={e => setAuthCreds({ ...authCreds, password: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {authType === 'oauth2' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Client ID</label>
                      <input disabled={!!authProfileId} className={inputCls} value={authCreds.clientId || ''} onChange={e => setAuthCreds({ ...authCreds, clientId: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Client Secret</label>
                      <input type="password" disabled={!!authProfileId} className={inputCls} value={authCreds.clientSecret || ''} onChange={e => setAuthCreds({ ...authCreds, clientSecret: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Token URL</label>
                    <input disabled={!!authProfileId} className={inputCls} placeholder="https://provider.com/oauth/token" value={authCreds.tokenUrl || ''} onChange={e => setAuthCreds({ ...authCreds, tokenUrl: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Scope</label>
                    <input disabled={!!authProfileId} className={inputCls} placeholder="openid profile email" value={authCreds.scope || ''} onChange={e => setAuthCreds({ ...authCreds, scope: e.target.value })} />
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    For OAuth 2.0 collection auth, reference a saved profile with an access token via the Profile picker above.
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
              <input
                className={inputCls}
                placeholder={specSource === 'path' ? './openapi.yaml' : 'https://api.example.com/openapi.json'}
                value={specValue}
                onChange={e => setSpecValue(e.target.value)}
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

