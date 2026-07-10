import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, ChevronRight } from 'lucide-react';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { updateDotenvFiles, updateLoginItem, fetchWorkspaceProjects, addWorkspaceProject, removeWorkspaceProject, fetchSecretStatus, configureSecretProvider, type SecretStatusEntry } from '../api';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [newFile, setNewFile] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loginItemSupported, setLoginItemSupported] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [missingGitignores, setMissingGitignores] = useState<string[]>([]);
  const [tab, setTab] = useState<'general' | 'workspace' | 'secrets'>('general');
  const [secretStatus, setSecretStatus] = useState<SecretStatusEntry[]>([]);
  const [secretProviders, setSecretProviders] = useState<Record<string, { configuredKeys: string[] }>>({});
  const [bwToken, setBwToken] = useState('');
  const [bwOrgId, setBwOrgId] = useState('');
  const [opToken, setOpToken] = useState('');
  const [vaultAddr, setVaultAddr] = useState('');
  const [vaultToken, setVaultToken] = useState('');
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerSaved, setProviderSaved] = useState(false);
  const [workspaces, setWorkspaces] = useState<{name: string, path: string}[]>([]);
  const [newWorkspace, setNewWorkspace] = useState('');
  const [fixingGitignore, setFixingGitignore] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  useEffect(() => {
    import('../api').then(({ fetchDotenvFiles, fetchLoginItem, fetchGitignoreStatus }) => {
      fetchDotenvFiles().then(data => setFiles(data.files)).catch(console.error);
      fetchLoginItem().then(data => {
        setLoginItemSupported(data.supported);
        setLaunchAtLogin(data.enabled);
      }).catch(console.error);
      fetchGitignoreStatus().then(data => {
        setMissingGitignores(data.missing || []);
      }).catch(console.error);
      fetchWorkspaceProjects().then(data => setWorkspaces(data.projects)).catch(console.error);
    });
    fetchSecretStatus().then(data => {
      setSecretStatus(data.secrets);
      setSecretProviders(data.providers);
    }).catch(console.error);
  }, []);

  const saveProvider = async (provider: string, config: Record<string, string>, clear: () => void) => {
    if (Object.keys(config).length === 0) return;
    setSavingProvider(true);
    setProviderSaved(false);
    try {
      const result = await configureSecretProvider(provider, config);
      setSecretStatus(result.secrets);
      const refreshed = await fetchSecretStatus();
      setSecretProviders(refreshed.providers);
      clear();
      setProviderSaved(true);
      setTimeout(() => setProviderSaved(false), 2000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingProvider(false);
    }
  };

  const handleSaveBitwarden = () => {
    const config: Record<string, string> = {};
    if (bwToken.trim()) config.accessToken = bwToken.trim();
    if (bwOrgId.trim()) config.organizationId = bwOrgId.trim();
    return saveProvider('bitwarden', config, () => { setBwToken(''); setBwOrgId(''); });
  };

  const handleSaveOnePassword = () => {
    const config: Record<string, string> = {};
    if (opToken.trim()) config.serviceAccountToken = opToken.trim();
    return saveProvider('onepassword', config, () => setOpToken(''));
  };

  const handleSaveVault = () => {
    const config: Record<string, string> = {};
    if (vaultAddr.trim()) config.address = vaultAddr.trim();
    if (vaultToken.trim()) config.token = vaultToken.trim();
    return saveProvider('vault', config, () => { setVaultAddr(''); setVaultToken(''); });
  };

  const toggleLaunchAtLogin = async () => {
    const next = !launchAtLogin;
    setLaunchAtLogin(next);
    try {
      await updateLoginItem(next);
    } catch (e) {
      console.error(e);
      setLaunchAtLogin(!next);
      alert('Failed to update launch at login setting');
    }
  };

  const handleFixGitignore = async () => {
    setFixingGitignore(true);
    try {
      const { fixGitignore } = await import('../api');
      await fixGitignore();
      setMissingGitignores([]);
    } catch (e) {
      console.error(e);
      alert('Failed to update .gitignore');
    } finally {
      setFixingGitignore(false);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const next = [...files];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setFiles(next);
  };

  const remove = (i: number) => setFiles(files.filter((_, idx) => idx !== i));

  const add = () => {
    const name = newFile.trim();
    if (!name || files.includes(name)) return;
    setFiles([...files, name]);
    setNewFile('');
  };


  const handleAddWorkspace = async () => {
    const trimmed = newWorkspace.trim();
    if (!trimmed) return;
    try {
      await addWorkspaceProject(trimmed);
      const data = await fetchWorkspaceProjects();
      setWorkspaces(data.projects);
      setNewWorkspace('');
      window.dispatchEvent(new Event('reqly-reload'));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleRemoveWorkspace = async (p: string) => {
    try {
      await removeWorkspaceProject(p);
      const data = await fetchWorkspaceProjects();
      setWorkspaces(data.projects);
      window.dispatchEvent(new Event('reqly-reload'));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateDotenvFiles(files);
      window.dispatchEvent(new Event('reqly-reload'));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
      alert('Failed to save environment files');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Settings" onClose={onClose}>

      <div className="flex gap-4 border-b mb-4" style={{ borderColor: 'var(--border)' }}>
        <button 
          className={`pb-2 text-sm ${tab === 'general' ? 'border-b-2 font-medium' : ''}`}
          style={{ borderColor: tab === 'general' ? 'var(--accent)' : 'transparent', color: tab === 'general' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          onClick={() => setTab('general')}
        >
          General
        </button>
        <button
          className={`pb-2 text-sm ${tab === 'workspace' ? 'border-b-2 font-medium' : ''}`}
          style={{ borderColor: tab === 'workspace' ? 'var(--accent)' : 'transparent', color: tab === 'workspace' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          onClick={() => setTab('workspace')}
        >
          Workspace
        </button>
        <button
          className={`pb-2 text-sm ${tab === 'secrets' ? 'border-b-2 font-medium' : ''}`}
          style={{ borderColor: tab === 'secrets' ? 'var(--accent)' : 'transparent', color: tab === 'secrets' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          onClick={() => setTab('secrets')}
        >
          Secrets
        </button>
      </div>

      {tab === 'general' && (
        <>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Environment files
        </label>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          .env-style files loaded as variables, lowest priority (below collection and environment vars). Later files in the list win on key collision.
        </p>

        <div className="flex flex-col gap-1.5 mb-2">
          {files.map((file, i) => (
            <div key={file} className="flex items-center gap-2">
              <span className="flex-1 text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{file}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ color: 'var(--text-muted)', opacity: i === 0 ? 0.3 : 1 }} title="Move up">
                <ArrowUp size={13} />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === files.length - 1} style={{ color: 'var(--text-muted)', opacity: i === files.length - 1 ? 0.3 : 1 }} title="Move down">
                <ArrowDown size={13} />
              </button>
              <button onClick={() => remove(i)} style={{ color: 'var(--text-muted)' }} title="Remove">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {files.length === 0 && (
            <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No environment files configured.</p>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={newFile}
            onChange={e => setNewFile(e.target.value)}
            placeholder=".env.local"
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <Button variant="secondary" onClick={add}><Plus size={13} /> Add</Button>
        </div>
      </div>

      {loginItemSupported && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={launchAtLogin} onChange={toggleLaunchAtLogin} />
            Launch at login
          </label>
        </div>
      )}

      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Gitignore status
        </label>
        {missingGitignores.length === 0 ? (
          <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-green-500/20 text-green-500">✓</span>
            All runtime state files are gitignored.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs" style={{ color: 'var(--warning)' }}>
              Missing entries in .gitignore: {missingGitignores.join(', ')}
            </p>
            <Button variant="secondary" onClick={handleFixGitignore} disabled={fixingGitignore}>
              {fixingGitignore ? 'Fixing...' : 'Add to .gitignore'}
            </Button>
          </div>
        )}
      </div>

        </>
      )}

      {tab === 'workspace' && (
        <div className="flex flex-col gap-3 min-h-[250px]">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Configure additional project directories to include in your workspace. Reqly will load collections from these directories as well.
          </p>
          
          <div className="flex flex-col gap-2 flex-1">
            {workspaces.map((ws, i) => (
              <div key={ws.path} className="flex items-center justify-between p-2 rounded" style={{ background: 'var(--surface-3)' }}>
                <div className="flex flex-col min-w-0 flex-1 mr-2">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ws.name}</span>
                  <span className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{ws.path}</span>
                </div>
                {i > 0 && (
                  <button onClick={() => handleRemoveWorkspace(ws.path)} style={{ color: 'var(--text-muted)' }} title="Remove from workspace">
                    <Trash2 size={14} />
                  </button>
                )}
                {i === 0 && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#fff' }}>Active</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-auto pt-2">
            <Input
              value={newWorkspace}
              onChange={e => setNewWorkspace(e.target.value)}
              placeholder="/Users/name/projects/api"
              onKeyDown={e => e.key === 'Enter' && handleAddWorkspace()}
            />
            <Button variant="secondary" onClick={handleAddWorkspace}><Plus size={13} /> Add</Button>
          </div>
        </div>
      )}

      {tab === 'secrets' && (
        <div className="flex flex-col gap-4 min-h-[250px]">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Vault URIs in .env
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              Values in your .env files that reference a secret manager (bw://, op://, vault://, aws://) and whether they resolve.
            </p>
            {secretStatus.length === 0 ? (
              <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                No vault URIs detected. Put e.g. <span className="font-mono">STRIPE_KEY=bw://project/secret</span> in your .env to pull it from your vault.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {secretStatus.map(s => (
                  <div key={s.key} className="flex items-start gap-2 p-2 rounded" style={{ background: 'var(--surface-3)' }} data-testid={`secret-row-${s.key}`}>
                    {s.status === 'resolved' ? (
                      <span className="mt-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-green-500/20 text-green-500 text-[10px] shrink-0">✓</span>
                    ) : (
                      <span className="mt-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-red-500/20 text-red-500 text-[10px] shrink-0">✗</span>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>{s.key}</span>
                      <span className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{s.uri} · {s.source}</span>
                      {s.error && <span className="text-xs mt-0.5" style={{ color: 'var(--error, #f87171)' }}>{s.error}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
            <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Providers
            </label>

            {([
              { id: 'bitwarden', name: 'Bitwarden Secrets Manager', configured: !!secretProviders.bitwarden },
              { id: 'onepassword', name: '1Password', configured: !!secretProviders.onepassword },
              { id: 'aws', name: 'AWS Secrets Manager', configured: false },
              { id: 'vault', name: 'HashiCorp Vault', configured: !!secretProviders.vault },
            ] as const).map(p => {
              const isOpen = expandedProvider === p.id;
              return (
                <div key={p.id} className="rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm"
                    style={{ background: 'var(--surface-3)', color: 'var(--text-primary)' }}
                    onClick={() => setExpandedProvider(isOpen ? null : p.id)}
                  >
                    <ChevronRight size={13} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-muted)' }} />
                    <span className="flex-1 text-left font-medium">{p.name}</span>
                    {p.configured && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#fff' }}>Configured</span>
                    )}
                  </button>

                  {isOpen && (
                    <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
                      {p.id === 'bitwarden' && (
                        <>
                          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                            Stored in ~/.reqly/config.json (never in the repo). BITWARDENSM_ACCESS_TOKEN and BITWARDENSM_ORGANIZATION_ID env vars take precedence.
                          </p>
                          <div className="flex flex-col gap-2">
                            <Input
                              type="password"
                              value={bwToken}
                              onChange={e => setBwToken(e.target.value)}
                              placeholder="Machine account access token"
                            />
                            <Input
                              value={bwOrgId}
                              onChange={e => setBwOrgId(e.target.value)}
                              placeholder="Organization ID"
                            />
                            <div className="flex items-center gap-2">
                              <Button variant="secondary" onClick={handleSaveBitwarden} disabled={savingProvider}>
                                {savingProvider ? 'Saving...' : 'Save Bitwarden config'}
                              </Button>
                              {providerSaved && <span className="text-xs" style={{ color: 'var(--accent)' }}>Saved - .env re-resolved</span>}
                            </div>
                          </div>
                        </>
                      )}

                      {p.id === 'onepassword' && (
                        <>
                          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                            Service account token, stored in ~/.reqly/config.json. The OP_SERVICE_ACCOUNT_TOKEN env var takes precedence. Saving re-resolves your .env, which doubles as a connection test.
                          </p>
                          <div className="flex flex-col gap-2">
                            <Input
                              type="password"
                              value={opToken}
                              onChange={e => setOpToken(e.target.value)}
                              placeholder="Service account token (ops_...)"
                            />
                            <Button variant="secondary" onClick={handleSaveOnePassword} disabled={savingProvider}>
                              {savingProvider ? 'Saving...' : 'Save 1Password config'}
                            </Button>
                          </div>
                        </>
                      )}

                      {p.id === 'aws' && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          No credentials stored in Reqly - aws:// URIs use your standard AWS credential chain (env vars, ~/.aws/credentials, IAM role). Set AWS_REGION, use a full ARN in the URI, or configure secretProviders.aws.region.
                        </p>
                      )}

                      {p.id === 'vault' && (
                        <>
                          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                            KV v2 token auth, stored in ~/.reqly/config.json. VAULT_ADDR and VAULT_TOKEN env vars take precedence.
                          </p>
                          <div className="flex flex-col gap-2">
                            <Input
                              value={vaultAddr}
                              onChange={e => setVaultAddr(e.target.value)}
                              placeholder="Vault address (https://vault.example.com:8200)"
                            />
                            <Input
                              type="password"
                              value={vaultToken}
                              onChange={e => setVaultToken(e.target.value)}
                              placeholder="Vault token"
                            />
                            <Button variant="secondary" onClick={handleSaveVault} disabled={savingProvider}>
                              {savingProvider ? 'Saving...' : 'Save Vault config'}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ModalFooter>
        {saved && <span className="text-xs self-center mr-2" style={{ color: 'var(--accent)' }}>Saved</span>}
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </ModalFooter>
    </Modal>
  );
}
