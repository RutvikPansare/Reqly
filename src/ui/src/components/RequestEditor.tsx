import { useState, useEffect, useMemo } from 'react';
import { fetchAuthProfiles, createAuthProfile, fetchEnvironments } from '../api';
import { KeyValueEditor } from './KeyValueEditor';
import type { KeyValuePair } from './KeyValueEditor';
import CodeMirror from '@uiw/react-codemirror';
import { graphql } from 'cm6-graphql';
import { buildClientSchema } from 'graphql';
import { json } from '@codemirror/lang-json';

interface RequestEditorProps {
  request: any;
  onFire: (req: any) => void;
  onSave: (req: any) => void;
  onChange?: (req: any) => void;
}

export function RequestEditor({ request, onFire, onSave, onChange }: RequestEditorProps) {
  const tabs = ['params', 'headers', 'body', 'auth', 'assertions', 'variables'];

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

  const [mode, setMode] = useState<'rest' | 'graphql'>('rest');
  const [graphqlQuery, setGraphqlQuery] = useState('');
  const [graphqlVariables, setGraphqlVariables] = useState('');
  const [graphqlBodyTab, setGraphqlBodyTab] = useState<'query' | 'variables'>('query');
  const [schema, setSchema] = useState<any>(null);
  const [introspecting, setIntrospecting] = useState(false);

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

      const reqMode = request.mode === 'graphql' ? 'graphql' : 'rest';
      setMode(reqMode);
      if (reqMode === 'graphql' && request.body && typeof request.body === 'object') {
        const b = request.body as any;
        setGraphqlQuery(b.query || '');
        setGraphqlVariables(b.variables ? JSON.stringify(b.variables, null, 2) : '');
        setBodyText('');
      } else {
        if (request.body) {
          setBodyText(typeof request.body === 'object' ? JSON.stringify(request.body, null, 2) : String(request.body));
        } else {
          setBodyText('');
        }
        setGraphqlQuery('');
        setGraphqlVariables('');
      }
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
      if (mode === 'graphql') {
        let vars: any = undefined;
        if (graphqlVariables.trim()) {
          try { vars = JSON.parse(graphqlVariables); } catch { vars = undefined; }
        }
        const body: any = { query: graphqlQuery };
        if (vars) body.variables = vars;
        return graphqlQuery.trim() ? body : undefined;
      }
      if (!bodyText.trim()) return undefined;
      try {
        return JSON.parse(bodyText);
      } catch {
        return bodyText;
      }
    };

    const effectiveMethod = mode === 'graphql' ? 'POST' : method;

    const buildRequest = () => {
      const req: any = { ...request, mode, method: effectiveMethod, url, assertions, headers: getHeadersRecord(), body: getParsedBody() };
      if (mode === 'graphql') {
        // GraphQL endpoints expect JSON content type.
        const hdrs = req.headers || {};
        if (!hdrs['Content-Type'] && !hdrs['content-type']) hdrs['Content-Type'] = 'application/json';
        req.headers = Object.keys(hdrs).length > 0 ? hdrs : undefined;
      }
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

    const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      ...FullType
    }
  }
}

fragment FullType on __Type {
  kind
  name
  fields(includeDeprecated: true) {
    name
    type { ...TypeRef }
  }
}

fragment TypeRef on __Type {
  kind
  name
  ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
}`;

    const runIntrospection = async () => {
      if (!url.trim()) { alert('Enter the GraphQL endpoint URL first.'); return; }
      setIntrospecting(true);
      try {
        const res = await fetch('/api/run/adhoc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request: { name: 'introspection', method: 'POST', url, headers: getHeadersRecord(), body: { query: INTROSPECTION_QUERY } }
          })
        });
        const data = await res.json();
        const schemaData = data.response?.body?.data?.__schema || data.response?.body?.__schema;
        if (schemaData) {
          setSchema(schemaData);
        } else {
          alert('Introspection failed. Check the endpoint URL and auth.');
        }
      } catch (e: any) {
        alert('Introspection error: ' + e.message);
      } finally {
        setIntrospecting(false);
      }
    };

    const schemaFields = (): string[] => {
      if (!schema) return [];
      const queryType = schema.types?.find((t: any) => t.name === schema.queryType?.name);
      return (queryType?.fields || []).map((f: any) => f.name).filter(Boolean);
    };

    const gqlSchemaObj = useMemo(() => {
      if (!schema) return null;
      try {
        return buildClientSchema({ __schema: schema });
      } catch (e) {
        console.error('Error building GraphQL client schema:', e);
        return null;
      }
    }, [schema]);

    // Report live edits so the parent can track dirty state.
    useEffect(() => {
      if (!onChange) return;
      onChange(buildRequest());
    }, [mode, method, url, assertions, headersList, bodyText, graphqlQuery, graphqlVariables, authType, authProfileId, authCreds]);

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
      <div className="flex p-2 gap-2 border-b border-gray-800 bg-gray-950">
        <button
          className={`px-2 py-1 rounded text-xs font-semibold border transition-colors ${mode === 'graphql' ? 'bg-pink-600 text-white border-pink-500' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
          onClick={() => setMode(m => m === 'graphql' ? 'rest' : 'graphql')}
          title="Toggle REST / GraphQL mode"
        >
          {mode === 'graphql' ? 'GQL' : 'REST'}
        </button>
        <select
          className="bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1 text-sm font-semibold focus:outline-none disabled:opacity-50"
          value={effectiveMethod}
          disabled={mode === 'graphql'}
          onChange={e => setMethod(e.target.value as any)}
        >
          <option>GET</option>
          <option>POST</option>
          <option>PUT</option>
          <option>PATCH</option>
          <option>DELETE</option>
        </select>
        <input 
          type="text" 
          className="flex-1 bg-gray-800 text-gray-200 border border-gray-700 rounded px-3 py-1 text-sm focus:outline-none focus:border-blue-500"
          value={url}
          onChange={e => handleUrlChange(e.target.value)}
          placeholder="https://api.example.com/v1/users"
        />
        <button 
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1 rounded text-sm font-semibold transition-colors"
          onClick={handleFireWithAuth}
        >
          Send
        </button>
        <button 
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-1 rounded text-sm font-semibold transition-colors"
          onClick={handleSaveWithAuth}
        >
          Save
        </button>
      </div>

      <div className="flex border-b border-gray-800 px-2 bg-gray-950 overflow-x-auto">
        {tabs.map(tab => (
          <button 
            key={tab}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-gray-900">
        {activeTab === 'params' ? (
          <div className="py-2">
            <KeyValueEditor pairs={paramsList} onChange={handleParamsChange} />
          </div>
        ) : activeTab === 'headers' ? (
          <div className="py-2">
            <KeyValueEditor pairs={headersList} onChange={setHeadersList} />
          </div>
        ) : activeTab === 'body' ? (
          mode === 'graphql' ? (
            <div className="flex flex-col h-full gap-2">
              <div className="flex justify-between items-center px-1">
                <div className="flex gap-1">
                  <button
                    className={`px-3 py-1 text-xs font-semibold rounded ${graphqlBodyTab === 'query' ? 'bg-gray-800 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                    onClick={() => setGraphqlBodyTab('query')}
                  >
                    Query
                  </button>
                  <button
                    className={`px-3 py-1 text-xs font-semibold rounded ${graphqlBodyTab === 'variables' ? 'bg-gray-800 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                    onClick={() => setGraphqlBodyTab('variables')}
                  >
                    Variables
                  </button>
                </div>
                <button
                  onClick={runIntrospection}
                  disabled={introspecting}
                  className="text-xs text-pink-400 hover:text-pink-300 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-50"
                  title="Fetch and parse the GraphQL schema from the endpoint"
                >
                  {introspecting ? 'Introspecting...' : 'Introspect'}
                </button>
              </div>
              {graphqlBodyTab === 'query' ? (
                <>
                  {schema && schemaFields().length > 0 && (
                    <div className="text-[10px] text-gray-500 px-1">
                      Schema loaded: {schemaFields().length} query fields - {schemaFields().join(', ')}
                    </div>
                  )}
                  <div className="flex-1 min-h-0 bg-gray-950 border border-gray-800 rounded overflow-hidden">
                    <CodeMirror
                      value={graphqlQuery}
                      height="100%"
                      theme="dark"
                      extensions={gqlSchemaObj ? [graphql(gqlSchemaObj)] : []}
                      onChange={(val) => setGraphqlQuery(val)}
                      className="h-full text-sm font-mono [&_.cm-scroller]:overflow-auto"
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 min-h-0 bg-gray-950 border border-gray-800 rounded overflow-hidden">
                  <CodeMirror
                    value={graphqlVariables}
                    height="100%"
                    theme="dark"
                    extensions={[json()]}
                    onChange={(val) => setGraphqlVariables(val)}
                    className="h-full text-sm font-mono [&_.cm-scroller]:overflow-auto"
                  />
                </div>
              )}
            </div>
          ) : (
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
            <textarea
              className="flex-1 bg-gray-950 border border-gray-800 rounded p-3 text-sm text-gray-300 font-mono focus:outline-none focus:border-blue-500 resize-none whitespace-pre"
              placeholder="Enter JSON, XML, or raw text here..."
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
              spellCheck={false}
            />
          </div>
          )
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
                  <input 
                    type="text" 
                    disabled={!!authProfileId}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                    placeholder="e.g. {{login.response.body.token}}"
                    value={authCreds.token || ''}
                    onChange={e => setAuthCreds({ ...authCreds, token: e.target.value })}
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
                    <input 
                      type="text" 
                      disabled={!!authProfileId}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
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
                      type="text" 
                      disabled={!!authProfileId}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                      value={authCreds.username || ''}
                      onChange={e => setAuthCreds({ ...authCreds, username: e.target.value })}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-gray-400 mb-1">Password</label>
                    <input 
                      type="password" 
                      disabled={!!authProfileId}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                      value={authCreds.password || ''}
                      onChange={e => setAuthCreds({ ...authCreds, password: e.target.value })}
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
        ) : (
          <div className="text-gray-500 text-sm">
            {activeTab} editor coming soon...
          </div>
        )}
      </div>
    </div>
  );
}
