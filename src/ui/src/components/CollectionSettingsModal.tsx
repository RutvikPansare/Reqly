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
} from '../api';

interface CollectionSettingsModalProps {
  collectionName: string;
  onClose: () => void;
}

const AUTH_TYPES = ['none', 'bearer', 'apiKey', 'basic', 'oauth2'] as const;
type AuthTabType = typeof AUTH_TYPES[number];

export function CollectionSettingsModal({ collectionName, onClose }: CollectionSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'variables' | 'auth'>('variables');

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

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none';

  return (
    <Modal title={`${collectionName} - Settings`} onClose={onClose} icon={<Settings size={16} />} width="w-[580px]">
      <div className="flex border-b mb-4" style={{ borderColor: 'var(--border)' }}>
        {(['variables', 'auth'] as const).map(tab => (
          <button
            key={tab}
            className="px-3 py-2 text-sm font-medium border-b-2 capitalize"
            style={{
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              borderColor: activeTab === tab ? 'var(--accent)' : 'transparent',
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'auth' ? 'Auth' : 'Variables'}
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
                className="flex-1 bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
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
                    className={`px-3 py-1 rounded text-sm capitalize transition-colors ${authType === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    onClick={() => { setAuthType(t); setAuthCreds({}); }}
                  >
                    {t === 'apiKey' ? 'API Key' : t === 'oauth2' ? 'OAuth 2.0' : t === 'none' ? 'None' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Credential fields */}
            <div className="bg-gray-950 p-4 rounded border border-gray-800 space-y-4">
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
    </Modal>
  );
}

