import { useState, useEffect, useRef } from 'react';
import { Send as SendIcon, Save as SaveIcon, Terminal, Code2 } from 'lucide-react';
import { fetchAuthProfiles, createAuthProfile, fetchEnvironments } from '../api';
import { KeyValueEditor } from './KeyValueEditor';
import type { KeyValuePair } from './KeyValueEditor';
import { VariableInput } from './VariableInput';
import { ScriptEditor } from './ScriptEditor';
import { CurlImportModal } from './CurlImportModal';
import { CodeGenModal } from './CodeGenModal';

interface RequestEditorProps {
  request: any;
  isActive?: boolean;
  onFire: (req: any) => void;
  onSave: (req: any) => void;
  onChange?: (req: any) => void;
}

function methodColor(method: string): string {
  switch ((method || '').toUpperCase()) {
    case 'GET':    return '#22c55e';
    case 'POST':   return '#eab308';
    case 'PUT':    return '#3b82f6';
    case 'PATCH':  return '#f97316';
    case 'DELETE': return '#ef4444';
    default:       return '#a1a1aa';
  }
}

export function RequestEditor({ request, isActive, onFire, onSave, onChange }: RequestEditorProps) {
  const tabs = ['params', 'headers', 'body', 'auth', 'assertions', 'variables', 'pre-script', 'post-script'];

  const [activeEnvVars, setActiveEnvVars] = useState<Record<string, string>>({});
  const [activeEnvName, setActiveEnvName] = useState<string>('');

  useEffect(() => {
    fetchEnvironments()
      .then((data: any) => {
        const active = data.environments?.find((e: any) => e.name === data.active);
        setActiveEnvName(active?.name || '');
        setActiveEnvVars(active?.variables || {});
      })
      .catch(console.error);
  }, []);
  
  if (!request) {
    return <div className="h-full flex items-center justify-center text-gray-500">Select a request to edit</div>;
  }

  const [activeTab, setActiveTab] = useState('params');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [paramsList, setParamsList] = useState<KeyValuePair[]>([]);
  const [headersList, setHeadersList] = useState<KeyValuePair[]>([]);
  const [assertions, setAssertions] = useState<any[]>([]);
  const [bodyText, setBodyText] = useState('');
  const [preScript, setPreScript] = useState('');
  const [postScript, setPostScript] = useState('');
  const [showCurlImport, setShowCurlImport] = useState(false);
  const [showCodeGen, setShowCodeGen] = useState(false);

  const parseParams = (urlStr: string): KeyValuePair[] => {
    const qIndex = urlStr.indexOf('?');
    if (qIndex === -1) return [];
    const qs = urlStr.slice(qIndex + 1);
    if (!qs) return [];
    return qs.split('&').map(p => {
      const [k, v] = p.split('=');
      return { key: decodeURIComponent(k || ''), value: decodeURIComponent(v || ''), enabled: true };
    });
  };

  useEffect(() => {
    if (request) {
      setUrl(request.url || '');
      setMethod(request.method || 'GET');
      setParamsList(parseParams(request.url || ''));

      const hl: KeyValuePair[] = [];
      if (request.headers) {
        Object.entries(request.headers).forEach(([k, v]) => {
          hl.push({ key: k, value: String(v), enabled: true });
        });
      }
      setHeadersList(hl);
      setAssertions(request.assertions || []);

      if (request.body) {
        setBodyText(typeof request.body === 'object' ? JSON.stringify(request.body, null, 2) : String(request.body));
      } else {
        setBodyText('');
      }
      setPreScript(request.preScript || '');
      setPostScript(request.postScript || '');
    }
  }, [request?.id, request?.name]);

  const updateUrlWithParams = (base: string, params: KeyValuePair[]) => {
    const active = params.filter(p => p.enabled && (p.key || p.value));
    if (active.length === 0) return base;
    const qs = active.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    return `${base}?${qs}`;
  };

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    setParamsList(parseParams(newUrl));
  };

  const handleParamsChange = (newParams: KeyValuePair[]) => {
    setParamsList(newParams);
    const qIndex = url.indexOf('?');
    const base = qIndex === -1 ? url : url.slice(0, qIndex);
    setUrl(updateUrlWithParams(base, newParams));
  };

  const addAssertion = () => setAssertions([...assertions, { field: 'status', operator: 'eq', value: '' }]);
  const updateAssertion = (index: number, key: string, val: string) => {
    const newAss = [...assertions];
    newAss[index][key] = val;
    setAssertions(newAss);
  };
  const removeAssertion = (index: number) => setAssertions(assertions.filter((_, i) => i !== index));

    const [authType, setAuthType] = useState(request?.auth?.type || 'none');
    const [authProfileId, setAuthProfileId] = useState(request?.authProfileId || '');
    const [authCreds, setAuthCreds] = useState<any>(request?.auth?.credentials || {});
    const [profiles, setProfiles] = useState<any[]>([]);

    useEffect(() => {
      fetchAuthProfiles().then(setProfiles).catch(console.error);
    }, []);

    const updateAuth = (type: string, creds: any, profileId: string) => {
      setAuthType(type);
      setAuthCreds(creds);
      setAuthProfileId(profileId);
    };

    const handleSaveProfile = async () => {
      const name = prompt('Name for this auth profile:');
      if (!name) return;
      try {
        const newProf = await createAuthProfile({ name, type: authType, credentials: authCreds });
        setProfiles([...profiles, newProf]);
        updateAuth(authType, authCreds, newProf.id);
      } catch (e) {
        console.error(e);
      }
    };

    const getHeadersRecord = () => {
      const hdrs: Record<string, string> = {};
      headersList.forEach(h => {
        if (h.enabled && h.key) hdrs[h.key] = h.value;
      });
      return Object.keys(hdrs).length > 0 ? hdrs : undefined;
    };

    const getParsedBody = () => {
      if (!bodyText.trim()) return undefined;
      try {
        return JSON.parse(bodyText);
      } catch {
        return bodyText;
      }
    };

    const buildRequest = () => {
      const req: any = { ...request, method, url, assertions, headers: getHeadersRecord(), body: getParsedBody() };
      if (preScript.trim()) req.preScript = preScript;
      else delete req.preScript;
      if (postScript.trim()) req.postScript = postScript;
      else delete req.postScript;
      if (authProfileId) req.authProfileId = authProfileId;
      else if (authType !== 'none') req.auth = { type: authType, credentials: authCreds };
      else { delete req.authProfileId; delete req.auth; }
      return req;
    };

    const handleFireWithAuth = () => {
      onFire(buildRequest());
    };

    const handleSaveWithAuth = () => {
      onSave(buildRequest());
    };

    // Keyboard shortcuts: ⌘↵ = Send, ⌘S = Save (only when this tab is active)
    const handleFireRef = useRef(handleFireWithAuth);
    const handleSaveRef = useRef(handleSaveWithAuth);
    handleFireRef.current = handleFireWithAuth;
    handleSaveRef.current = handleSaveWithAuth;

    useEffect(() => {
      if (!isActive) return;
      const onKey = (e: KeyboardEvent) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          handleFireRef.current();
        }
        if (e.key === 's') {
          e.preventDefault();
          handleSaveRef.current();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [isActive]);

    // Report live edits so the parent can track dirty state.
    useEffect(() => {
      if (!onChange) return;
      onChange(buildRequest());
    }, [method, url, assertions, headersList, bodyText, authType, authProfileId, authCreds, preScript, postScript]);

  const availableVariables = Object.keys(activeEnvVars);

  return (
    <div className="flex flex-col h-full rounded overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      {/* URL bar */}
      <div className="flex p-2 gap-2" style={{ background: 'var(--surface-0)', borderBottom: '1px solid var(--border)' }}>
        <select
          className="rounded px-2 py-1 text-sm font-bold focus:outline-none"
          style={{ background: 'var(--surface-3)', border: `1px solid ${methodColor(method)}40`, color: methodColor(method) }}
          value={method}
          onChange={e => setMethod(e.target.value as any)}
        >
          <option>GET</option>
          <option>POST</option>
          <option>PUT</option>
          <option>PATCH</option>
          <option>DELETE</option>
        </select>
        <VariableInput
          variables={availableVariables}
          className="input flex-1"
          value={url}
          onChange={val => handleUrlChange(val)}
          placeholder="https://api.example.com/v1/users"
        />
        <button
          className="btn btn-ghost rounded"
          onClick={() => setShowCurlImport(true)}
          title="Import from cURL"
          style={{ padding: '0 8px' }}
        >
          <Terminal size={14} />
        </button>
        <button
          className="btn btn-ghost rounded"
          onClick={() => setShowCodeGen(true)}
          title="Generate code snippet"
          style={{ padding: '0 8px' }}
        >
          <Code2 size={14} />
        </button>
        <button className="btn btn-primary rounded gap-1.5" onClick={handleFireWithAuth} title="Send request (⌘↵)">
          <SendIcon size={13} />Send
          <span className="text-[10px] opacity-50 ml-0.5">⌘↵</span>
        </button>
        <button className="btn btn-secondary rounded gap-1.5" onClick={handleSaveWithAuth} title="Save request (⌘S)">
          <SaveIcon size={13} />Save
          <span className="text-[10px] opacity-50 ml-0.5">⌘S</span>
        </button>
      </div>

      {showCurlImport && (
        <CurlImportModal
          onClose={() => setShowCurlImport(false)}
          onImport={parsed => {
            setMethod(parsed.method as any);
            handleUrlChange(parsed.url);
            const newHeaders: KeyValuePair[] = Object.entries(parsed.headers || {}).map(([k, v]) => ({ key: k, value: v, enabled: true }));
            setHeadersList(newHeaders);
            if (parsed.body) setBodyText(parsed.body);
          }}
        />
      )}

      {showCodeGen && (
        <CodeGenModal
          request={buildRequest()}
          onClose={() => setShowCodeGen(false)}
        />
      )}

      {/* Tab bar */}
      <div className="tab-bar overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`tab-btn capitalize ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'pre-script' ? 'Pre-Script' : tab === 'post-script' ? 'Post-Script' : tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4" style={{ background: 'var(--surface-2)' }}>
        {activeTab === 'params' ? (
          <div className="py-2">
            <KeyValueEditor pairs={paramsList} onChange={handleParamsChange} variables={availableVariables} />
          </div>
        ) : activeTab === 'headers' ? (
          <div className="py-2">
            <KeyValueEditor pairs={headersList} onChange={setHeadersList} variables={availableVariables} />
          </div>
        ) : activeTab === 'body' ? (
          <div className="flex flex-col h-full gap-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-sm font-semibold text-gray-400">Raw Body</span>
              <button
                onClick={() => {
                  try {
                    setBodyText(JSON.stringify(JSON.parse(bodyText), null, 2));
                  } catch {
                    alert('Invalid JSON - could not format.');
                  }
                }}
                className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                Format JSON
              </button>
            </div>
            <VariableInput
              multiline
              variables={availableVariables}
              className="flex-1 bg-gray-950 border border-gray-800 rounded p-3 text-sm text-gray-300 font-mono focus:outline-none focus:border-blue-500 resize-none whitespace-pre"
              placeholder="Enter JSON, XML, or raw text here..."
              value={bodyText}
              onChange={val => setBodyText(val)}
              spellCheck={false}
            />
          </div>
        ) : activeTab === 'assertions' ? (
          <div className="space-y-2">
            {assertions.map((ass, i) => (
              <div key={i} className="flex items-center gap-2">
                <select 
                  className="bg-gray-800 text-gray-300 border border-gray-700 rounded p-1 text-sm"
                  value={ass.field} onChange={e => updateAssertion(i, 'field', e.target.value)}
                >
                  <option value="status">Status</option>
                  <option value="body">Body</option>
                  <option value="latency">Latency</option>
                </select>
                {ass.field === 'body' && (
                  <input 
                    type="text" placeholder="path (e.g. data.token)" 
                    className="bg-gray-800 text-gray-300 border border-gray-700 rounded p-1 text-sm w-32"
                    value={ass.path || ''} onChange={e => updateAssertion(i, 'path', e.target.value)}
                  />
                )}
                <select 
                  className="bg-gray-800 text-gray-300 border border-gray-700 rounded p-1 text-sm"
                  value={ass.operator} onChange={e => updateAssertion(i, 'operator', e.target.value)}
                >
                  <option value="eq">equals</option>
                  <option value="neq">not equals</option>
                  <option value="contains">contains</option>
                  <option value="lt">less than</option>
                  <option value="gt">greater than</option>
                </select>
                <input 
                  type="text" placeholder="value" 
                  className="flex-1 bg-gray-800 text-gray-300 border border-gray-700 rounded p-1 text-sm"
                  value={ass.value} onChange={e => updateAssertion(i, 'value', e.target.value)}
                />
                <button onClick={() => removeAssertion(i)} className="text-gray-500 hover:text-red-400">🗑️</button>
              </div>
            ))}
            <button onClick={addAssertion} className="text-blue-400 text-sm hover:underline mt-2">+ Add Assertion</button>
          </div>
        ) : activeTab === 'auth' ? (
          <div className="max-w-2xl">
            <div className="mb-6 flex gap-4 items-center">
              <label className="text-sm font-semibold text-gray-300 w-24">Profile</label>
              <select 
                className="flex-1 bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                value={authProfileId}
                onChange={e => {
                  const id = e.target.value;
                  setAuthProfileId(id);
                  if (id) {
                    const prof = profiles.find(p => p.id === id);
                    if (prof) {
                      setAuthType(prof.type);
                      setAuthCreds(prof.credentials);
                    }
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

            <div className="mb-6 flex gap-4 items-center">
              <label className="text-sm font-semibold text-gray-300 w-24">Auth Type</label>
              <div className="flex gap-2">
                {['none', 'bearer', 'apikey', 'basic'].map(t => (
                  <button 
                    key={t}
                    disabled={!!authProfileId}
                    className={`px-3 py-1 rounded text-sm capitalize transition-colors ${authType === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    onClick={() => { setAuthType(t); setAuthCreds({}); }}
                  >
                    {t === 'apikey' ? 'API Key' : t}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-950 p-4 rounded border border-gray-800 space-y-4">
              {authType === 'none' && <div className="text-sm text-gray-500 italic">This request does not use any authorization.</div>}
              
              {authType === 'bearer' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Token</label>
                  <VariableInput 
                    variables={availableVariables}
                    disabled={!!authProfileId}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                    placeholder="e.g. {{login.response.body.token}}"
                    value={authCreds.token || ''}
                    onChange={val => setAuthCreds({ ...authCreds, token: val })}
                  />
                </div>
              )}

              {authType === 'apikey' && (
                <>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-1">Key Name</label>
                      <input 
                        type="text" 
                        disabled={!!authProfileId}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                        placeholder="X-API-Key"
                        value={authCreds.keyName || 'X-API-Key'}
                        onChange={e => setAuthCreds({ ...authCreds, keyName: e.target.value })}
                      />
                    </div>
                    <div className="w-48">
                      <label className="block text-sm text-gray-400 mb-1">Placement</label>
                      <select 
                        disabled={!!authProfileId}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
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
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
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
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
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
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                      value={authCreds.password || ''}
                      onChange={val => setAuthCreds({ ...authCreds, password: val })}
                    />
                  </div>
                </div>
              )}
            </div>

            {!authProfileId && authType !== 'none' && (
              <div className="mt-4 flex justify-end">
                <button 
                  onClick={handleSaveProfile}
                  className="bg-gray-800 hover:bg-gray-700 text-blue-400 border border-gray-700 hover:border-gray-600 px-3 py-1.5 rounded text-sm transition-colors"
                >
                  Save as Profile
                </button>
              </div>
            )}
          </div>
        ) : activeTab === 'variables' ? (
          <div className="py-2">
            <p className="text-xs text-gray-500 mb-3">
              Variables in scope from the active environment{activeEnvName ? `: ${activeEnvName}` : ''}. Edit them in the Environments panel.
            </p>
            {Object.keys(activeEnvVars).length === 0 ? (
              <p className="text-sm text-gray-600 italic">No variables in the active environment.</p>
            ) : (
              <div className="border border-gray-800 rounded overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr] bg-gray-950 text-xs font-semibold text-gray-500 uppercase tracking-widest px-3 py-1.5 border-b border-gray-800">
                  <span>Key</span>
                  <span>Value</span>
                </div>
                {Object.entries(activeEnvVars).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[1fr_1fr] px-3 py-1.5 text-sm border-b border-gray-800 last:border-b-0">
                    <span className="text-gray-300 font-mono truncate">{`{{${k}}}`}</span>
                    <span className="text-gray-400 font-mono truncate">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'pre-script' ? (
          <div className="flex flex-col h-full gap-2">
            <p className="text-xs text-gray-500">
              Runs before the request fires. <code className="bg-gray-800 px-1 rounded">env</code> (read/write) and <code className="bg-gray-800 px-1 rounded">request</code> (read-only) are available. Mutations to <code className="bg-gray-800 px-1 rounded">env</code> are applied for this request and downstream requests in a collection run.
            </p>
            <ScriptEditor
              value={preScript}
              onChange={setPreScript}
              placeholder={`// Example: set a dynamic header from env\n// env.timestamp = String(Date.now());\n// env.authToken = "Bearer " + env.rawToken;`}
            />
          </div>
        ) : activeTab === 'post-script' ? (
          <div className="flex flex-col h-full gap-2">
            <p className="text-xs text-gray-500">
              Runs after the response is received. <code className="bg-gray-800 px-1 rounded">env</code> (read/write), <code className="bg-gray-800 px-1 rounded">request</code>, and <code className="bg-gray-800 px-1 rounded">response</code> are available. Use it to extract tokens from responses and store them in <code className="bg-gray-800 px-1 rounded">env</code> for subsequent requests.
            </p>
            <ScriptEditor
              value={postScript}
              onChange={setPostScript}
              placeholder={`// Example: extract a token from the response body\n// if (response.status === 200) {\n//   env.authToken = response.body.token;\n// }`}
            />
          </div>
        ) : (
          <div className="text-gray-500 text-sm">
            {activeTab} editor coming soon...
          </div>
        )}
      </div>
    </div>
  );
}
