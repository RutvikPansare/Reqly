import { useState, useMemo, useEffect, useRef } from 'react';
import { Send as SendIcon, Loader2, Save, BookOpen, Wand2, Terminal, Bookmark, FileCode2, CheckSquare, Square } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { graphql } from 'cm6-graphql';
import { buildClientSchema, getIntrospectionQuery, parse as gqlParse, print as gqlPrint } from 'graphql';
import type { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { autocompletion } from '@codemirror/autocomplete';
import type { CompletionContext } from '@codemirror/autocomplete';
import { GraphQLResponseViewer } from './GraphQLResponseViewer';
import { GraphQLSubscriptionStream } from './GraphQLSubscriptionStream';
import { SplitPane } from './SplitPane';
import { KeyValueEditor } from './KeyValueEditor';
import type { KeyValuePair } from './KeyValueEditor';
import { GraphQLDocsExplorer } from './GraphQLDocsExplorer';
import { VariableInput } from './VariableInput';
import type { VariableItem } from './VariableInput';
import { addRequest, fetchCollections, fetchEnvironments, getCollectionVariables, fetchDotenvFiles } from '../api';

const INTROSPECTION_QUERY = getIntrospectionQuery();

interface GraphQLWorkspaceProps {
  initialRequest?: any;
}

export function GraphQLWorkspace({ initialRequest }: GraphQLWorkspaceProps = {}) {
  const [url, setUrl] = useState(initialRequest?.url ?? '');
  const [query, setQuery] = useState(initialRequest?.graphql?.query ?? '');
  const [variables, setVariables] = useState(
    initialRequest?.graphql?.variables ? JSON.stringify(initialRequest.graphql.variables, null, 2) : ''
  );
  const [headers, setHeaders] = useState<KeyValuePair[]>(() => {
    const saved = initialRequest?.headers;
    if (!saved) return [];
    return Object.entries(saved).map(([key, value]) => ({ key, value: value as string, enabled: true }));
  });
  const [bodyTab, setBodyTab] = useState<'query' | 'variables' | 'headers'>('query');
  const [schema, setSchema] = useState<any>(null);
  const [schemaCachedAt, setSchemaCachedAt] = useState<string | null>(null);
  const [introspecting, setIntrospecting] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const editorViewRef = useRef<EditorView | null>(null);
  const [response, setResponse] = useState<any>(null);
  const [isSending, setIsSending] = useState(false);
  const [collections, setCollections] = useState<string[]>([]);
  const [saveCollection, setSaveCollection] = useState('');
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [operationName, setOperationName] = useState<string>(initialRequest?.graphql?.operationName ?? '');
  const [prettifyError, setPrettifyError] = useState<string | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);
  const [activeEnvVars, setActiveEnvVars] = useState<Record<string, string>>({});
  const [activeEnvName, setActiveEnvName] = useState<string>('');
  const [collectionVars, setCollectionVars] = useState<Record<string, string>>({});
  const [dotenvVars, setDotenvVars] = useState<{ key: string; source: string }[]>([]);

  const [showSaved, setShowSaved] = useState(false);
  const [savedRequests, setSavedRequests] = useState<{ collection: string; request: any }[]>([]);
  const [activeCollection, setActiveCollection] = useState<string | undefined>(initialRequest?._collection);
  const [activeRequestName, setActiveRequestName] = useState<string | undefined>(initialRequest?.name);
  const [queryFile, setQueryFile] = useState<string>(initialRequest?.graphql?.queryFile ?? '');
  const [useQueryFile, setUseQueryFile] = useState<boolean>(!!initialRequest?.graphql?.queryFile);

  const isDirty = useMemo(() => {
    if (!initialRequest) {
      return !!(url.trim() || query.trim());
    }
    if (url !== (initialRequest.url ?? '')) return true;
    if (query !== (initialRequest.graphql?.query ?? '')) return true;
    if (variables !== (initialRequest.graphql?.variables ? JSON.stringify(initialRequest.graphql.variables, null, 2) : '')) return true;
    
    const savedHeaders = initialRequest.headers || {};
    const currentEnabled = Object.fromEntries(headers.filter(h => h.enabled && h.key.trim()).map(h => [h.key, h.value]));
    if (JSON.stringify(savedHeaders) !== JSON.stringify(currentEnabled)) return true;
    
    return false;
  }, [initialRequest, url, query, variables, headers]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    fetchCollections().then((cols: any[]) => {
      setCollections(cols.map((c: any) => c.name));
      const reqs: { collection: string; request: any }[] = [];
      for (const col of cols) {
        if (col.requests) {
          for (const req of col.requests) {
            if (req.type === 'graphql' || req.type === 'graphql-subscription') {
              reqs.push({ collection: col.name, request: req });
            }
          }
        }
      }
      setSavedRequests(reqs);
    }).catch(() => {});
  }, []);

  // Load env vars, collection vars, and dotenv vars for variable autocomplete
  useEffect(() => {
    const load = () => {
      fetchEnvironments()
        .then((data: any) => {
          const active = data.environments?.find((e: any) => e.name === data.active);
          setActiveEnvName(active?.name || '');
          setActiveEnvVars(active?.variables || {});
        })
        .catch(() => {});
      fetchDotenvFiles()
        .then((data: any) => setDotenvVars(data.variables || []))
        .catch(() => {});
    };
    load();
    window.addEventListener('reqly-reload', load);
    return () => window.removeEventListener('reqly-reload', load);
  }, []);

  useEffect(() => {
    const colName = activeCollection;
    if (!colName) { setCollectionVars({}); return; }
    const load = () => { getCollectionVariables(colName).then(setCollectionVars).catch(() => {}); };
    load();
    window.addEventListener('reqly-reload', load);
    return () => window.removeEventListener('reqly-reload', load);
  }, [activeCollection]);

  useEffect(() => {
    if (!initialRequest) return;
    setUrl(initialRequest.url ?? '');
    setQuery(initialRequest.graphql?.query ?? '');
    setQueryFile(initialRequest.graphql?.queryFile ?? '');
    setUseQueryFile(!!initialRequest.graphql?.queryFile);
    setVariables(initialRequest.graphql?.variables ? JSON.stringify(initialRequest.graphql.variables, null, 2) : '');
    setOperationName(initialRequest.graphql?.operationName ?? '');
    setHeaders(
      initialRequest.headers
        ? Object.entries(initialRequest.headers).map(([key, value]) => ({ key, value: value as string, enabled: true }))
        : []
    );
    setActiveCollection(initialRequest._collection);
    setActiveRequestName(initialRequest.name);
  }, [initialRequest]);

  // Build the enabled custom headers as a plain object for use in fetch calls
  const enabledHeaders = useMemo(() => {
    const result: Record<string, string> = {};
    for (const h of headers) {
      if (h.enabled && h.key.trim()) result[h.key.trim()] = h.value;
    }
    return result;
  }, [headers]);

  // Merge collection, env, and dotenv vars for VariableInput autocomplete
  const availableVariables: VariableItem[] = [
    ...Object.entries(collectionVars).map(([k, v]) => ({
      name: k,
      sourceType: 'collection',
      sourceName: activeCollection || 'collection',
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
      .filter(v => !(v.key in collectionVars) && !(v.key in activeEnvVars))
      .map(v => ({
        name: v.key,
        sourceType: 'dotenv',
        sourceName: v.source,
        value: '',
      })),
  ];

  // CodeMirror completion extension for {{variable}} syntax in the Variables JSON editor
  const varCompletionExtension = useMemo(() => {
    return autocompletion({
      override: [
        (context: CompletionContext) => {
          const match = context.matchBefore(/\{\{[a-zA-Z0-9_-]*/);
          if (!match || (match.from === match.to && !context.explicit)) return null;
          const typed = match.text.slice(2); // strip {{
          const options = availableVariables
            .filter(v => v.name.toLowerCase().includes(typed.toLowerCase()))
            .map(v => ({
              label: `{{${v.name}}}`,
              apply: `{{${v.name}}}`,
              detail: `${v.sourceType}${v.value !== undefined ? ` = ${v.value}` : ''}`,
              type: 'variable',
            }));
          if (options.length === 0) return null;
          return { from: match.from, options };
        },
      ],
    });
  }, [availableVariables]);
  useEffect(() => {
    if (!url.trim()) return;
    const controller = new AbortController();
    fetch(`/api/schema-cache?url=${encodeURIComponent(url.trim())}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.schema) {
          setSchema(data.schema);
          setSchemaCachedAt(data.cachedAt ?? null);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [url]);

  const saveSchemaToCache = async (schemaData: any) => {
    try {
      await fetch('/api/schema-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), schema: schemaData }),
      });
    } catch {
      // Cache write failure is non-fatal
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    if (!saveName.trim() || !saveCollection.trim()) {
      setSaveError('Collection and request name are required.');
      return;
    }
    try {
      let parsedVariables: Record<string, unknown> | undefined;
      if (variables.trim()) {
        try { parsedVariables = JSON.parse(variables); } catch { setSaveError('Variables must be valid JSON.'); return; }
      }
      const savedHeaders = Object.keys(enabledHeaders).length > 0 ? enabledHeaders : undefined;
      await addRequest(saveCollection, {
        id: Date.now().toString(),
        name: saveName.trim(),
        method: 'POST',
        url: url.trim(),
        type: 'graphql',
        ...(savedHeaders ? { headers: savedHeaders } : {}),
        graphql: {
          ...(useQueryFile && queryFile.trim() ? { queryFile: queryFile.trim() } : { query }),
          ...(parsedVariables !== undefined ? { variables: parsedVariables } : {}),
          ...(operationName.trim() ? { operationName: operationName.trim() } : {}),
        },
      });
      setSaveSuccess(true);
      setShowSaveForm(false);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e: any) {
      setSaveError(e.message || 'Save failed.');
    }
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

  const schemaFields = (): string[] => {
    if (!schema) return [];
    const queryType = schema.types?.find((t: any) => t.name === schema.queryType?.name);
    return (queryType?.fields || []).map((f: any) => f.name).filter(Boolean);
  };

  // Check if the query declares variables that aren't present in the variables JSON pane
  const variableWarning = useMemo(() => {
    if (!query.trim()) return null;
    const declaredVars = [...query.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*[A-Za-z_!\[\]]+)/g)].map(m => m[1]);
    if (declaredVars.length === 0) return null;
    if (!variables.trim()) return declaredVars;
    try {
      const parsed = JSON.parse(variables);
      const missing = declaredVars.filter(v => !(v in parsed));
      return missing.length > 0 ? missing : null;
    } catch {
      return null;
    }
  }, [query, variables]);

  // Parse named operations from the query document (used for operationName dropdown)
  const namedOperations = useMemo(() => {
    if (!query.trim()) return [];
    const matches = [...query.matchAll(/(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/g)];
    return matches.map(m => m[1]);
  }, [query]);

  // Detect if the query is a subscription (shows stream panel instead of response viewer)
  const isSubscriptionQuery = useMemo(() => {
    // If using queryFile, we can't reliably detect subscription from the UI without reading the file.
    // We'll fall back to normal run (which will fail cleanly if it's actually a sub) unless we add a specific toggle,
    // or we assume users won't mix queryFile and subscriptions for now.
    if (useQueryFile) return false;
    return /^\s*subscription[\s{(]/m.test(query);
  }, [query, useQueryFile]);

  // Insert a field name at the current cursor position in the query editor
  const handleInsertField = (fieldName: string, hasSubfields: boolean) => {
    const view = editorViewRef.current;
    if (!view) {
      setQuery((prev: string) => prev + (hasSubfields ? `${fieldName} {\n  \n}` : fieldName));
      return;
    }
    const insert = hasSubfields ? `${fieldName} {\n  \n}` : fieldName;
    const { from } = view.state.selection.main;
    view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length } });
    view.focus();
  };

  const handlePrettify = () => {
    setPrettifyError(null);
    try {
      const formatted = gqlPrint(gqlParse(query));
      const view = editorViewRef.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: formatted },
          selection: EditorSelection.cursor(0),
          scrollIntoView: true,
        });
      }
      setQuery(formatted);
    } catch (e: any) {
      setPrettifyError(e.message ?? 'Could not parse query');
      setTimeout(() => setPrettifyError(null), 4000);
    }
  };

  const handleCopyAsCurl = () => {
    const body: Record<string, unknown> = { query };
    if (variables.trim()) {
      try { body.variables = JSON.parse(variables); } catch { /* ignore */ }
    }
    if (operationName.trim()) body.operationName = operationName.trim();
    const allHeaders = { 'Content-Type': 'application/json', ...enabledHeaders };
    const headerArgs = Object.entries(allHeaders).map(([k, v]) => `-H '${k}: ${v}'`).join(' ');
    const bodyArg = `-d '${JSON.stringify(body).replace(/'/g, "\\'")}'`;
    const curlCmd = `curl -X POST ${headerArgs} ${bodyArg} '${url}'`;
    navigator.clipboard.writeText(curlCmd).catch(() => {});
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 2000);
  };

  const runIntrospection = async () => {
    if (!url.trim()) { alert('Enter the GraphQL endpoint URL first.'); return; }
    setIntrospecting(true);
    try {
      const res = await fetch('/api/run/adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: {
            name: 'introspection',
            method: 'POST',
            url,
            headers: { ...enabledHeaders },
            body: { query: INTROSPECTION_QUERY },
          }
        })
      });
      const data = await res.json();
      const schemaData = data.response?.body?.data?.__schema || data.response?.body?.__schema;
      if (schemaData) {
        setSchema(schemaData);
        setSchemaCachedAt(null); // Will be updated after save
        await saveSchemaToCache(schemaData);
        setSchemaCachedAt(new Date().toISOString());
      } else {
        alert('Introspection failed. Check the endpoint URL.');
      }
    } catch (e: any) {
      alert('Introspection error: ' + e.message);
    } finally {
      setIntrospecting(false);
    }
  };

  const handleSend = async () => {
    if (!url.trim()) { alert('Enter the GraphQL endpoint URL first.'); return; }
    let vars: any = undefined;
    if (variables.trim()) {
      try {
        vars = JSON.parse(variables);
      } catch {
        alert('Invalid JSON in variables.');
        return;
      }
    }
    setIsSending(true);
    try {
      const body: any = {};
      if (useQueryFile && queryFile.trim()) {
        body.queryFile = queryFile.trim();
      } else {
        body.query = query;
      }
      if (vars) body.variables = vars;
      if (operationName.trim()) body.operationName = operationName.trim();
      const res = await fetch('/api/run/adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: {
            name: 'graphql',
            method: 'POST',
            url,
            headers: { 'Content-Type': 'application/json', ...enabledHeaders },
            body,
          }
        })
      });
      const data = await res.json();
      if (data.response) {
        setResponse({ ...data.response, assertions: data.assertions });
      } else {
        setResponse({ status: 500, latency: 0, body: data.error, headers: {} });
      }
    } catch (e: any) {
      setResponse({ status: 500, latency: 0, body: e.message, headers: {} });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="absolute inset-0 flex overflow-hidden" style={{ background: 'var(--surface-1)' }}>
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <SplitPane
        top={
        <div className="flex flex-col h-full overflow-hidden p-2">
          <div className="flex items-center gap-2 mb-2">
            <button
              className={`btn ${showSaved ? 'btn-primary' : 'btn-secondary'} rounded`}
              onClick={() => setShowSaved(v => !v)}
              title="Toggle saved requests"
              style={{ padding: '0 8px', height: '32px' }}
            >
              <Bookmark size={14} />
            </button>
            
            <div className="flex-1 flex items-center border border-[var(--border-strong)] rounded bg-black overflow-hidden h-8">
              <span className="method-badge ml-2" style={{ background: '#db2777', color: '#fff' }}>GQL</span>
              <VariableInput
                variables={availableVariables}
                className="flex-1 px-3 py-1.5 text-sm bg-black focus:outline-none h-full"
                value={url}
                onChange={setUrl}
                placeholder="https://api.example.com/graphql"
              />
            </div>

            {isSubscriptionQuery ? (
              <span className="px-3 py-1.5 rounded text-xs font-semibold bg-purple-900 border border-purple-700 text-purple-300 flex items-center gap-1.5 h-8">
                Use Connect in the stream panel below
              </span>
            ) : (
              <button
                className="btn btn-primary rounded gap-1.5 h-8"
                onClick={handleSend}
                disabled={isSending}
              >
                {isSending ? <Loader2 size={13} className="animate-spin" /> : <SendIcon size={13} />}
                {isSending ? 'Sending...' : 'Send'}
              </button>
            )}

            <button
              className={`btn ${saveSuccess ? 'btn-primary' : 'btn-secondary'} rounded gap-1.5 h-8`}
              style={saveSuccess ? { background: '#16a34a', borderColor: '#16a34a' } : undefined}
              onClick={() => setShowSaveForm(v => !v)}
              title="Save to collection"
            >
              <Save size={13} />
              {saveSuccess ? 'Saved!' : 'Save'}
            </button>

            {schema && (
              <button
                className={`btn ${showDocs ? 'btn-primary' : 'btn-secondary'} rounded gap-1.5 h-8`}
                style={showDocs ? { background: '#db2777', borderColor: '#db2777' } : undefined}
                onClick={() => setShowDocs(v => !v)}
                title="Toggle schema docs explorer"
              >
                <BookOpen size={13} />
                Docs
              </button>
            )}
          </div>

          {showSaveForm && (
            <div className="flex items-center gap-2 mb-4 p-2 rounded border border-[var(--border)] bg-[var(--surface-2)]">
              <select
                className="bg-[var(--surface-3)] text-gray-200 border border-[var(--border-strong)] rounded px-2 py-1 text-xs focus:outline-none"
                value={saveCollection}
                onChange={e => setSaveCollection(e.target.value)}
              >
                <option value="">-- collection --</option>
                {collections.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                className="flex-1 bg-[var(--surface-3)] text-gray-200 border border-[var(--border-strong)] rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Request name"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              <button
                className="btn btn-primary rounded text-xs px-3 py-1"
                onClick={handleSave}
              >
                Save
              </button>
              {saveError && <span className="text-red-400 text-xs">{saveError}</span>}
            </div>
          )}

          <div className="tab-bar overflow-x-auto">
            <button
              className={`tab-btn ${bodyTab === 'query' ? 'active' : ''}`}
              onClick={() => setBodyTab('query')}
            >
              Query
            </button>
            <button
              className={`tab-btn flex items-center gap-1 ${bodyTab === 'variables' ? 'active' : ''}`}
              onClick={() => setBodyTab('variables')}
            >
              Variables
              {variableWarning && variableWarning.length > 0 && (
                <span className="text-[10px] text-amber-400" title={`Missing variables: ${variableWarning.join(', ')}`}>
                  ⚠
                </span>
              )}
            </button>
            <button
              className={`tab-btn flex items-center gap-1 ${bodyTab === 'headers' ? 'active' : ''}`}
              onClick={() => setBodyTab('headers')}
            >
              Headers
              {headers.filter(h => h.enabled && h.key.trim()).length > 0 && (
                <span className="ml-1 text-[10px] bg-blue-700 text-white rounded-full px-1">
                  {headers.filter(h => h.enabled && h.key.trim()).length}
                </span>
              )}
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col pt-2 pb-0" style={{ background: 'var(--surface-1)' }}>
            <div className="flex justify-end items-center px-1 mb-2">
              <div className="flex items-center gap-2">
                {prettifyError && (
                  <span className="text-[10px] text-red-400 max-w-xs truncate" title={prettifyError}>Parse error</span>
                )}
                {bodyTab === 'query' && (
                  <>
                    <button
                      onClick={() => setUseQueryFile(!useQueryFile)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 cursor-pointer mr-2 bg-transparent border-none p-0"
                      title="Toggle From File"
                    >
                      {useQueryFile ? <CheckSquare size={14} className="text-pink-500" /> : <Square size={14} />}
                      <FileCode2 size={12} />
                      From File
                    </button>
                    {!useQueryFile && (
                      <>
                        <button
                          onClick={handlePrettify}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded bg-[var(--surface-3)] hover:bg-[var(--surface-4)] transition-colors"
                          title="Format the GraphQL query"
                        >
                          <Wand2 size={12} />
                          Prettify
                        </button>
                        <button
                          onClick={handleCopyAsCurl}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded bg-[var(--surface-3)] hover:bg-[var(--surface-4)] transition-colors"
                          title="Copy as cURL command"
                        >
                          <Terminal size={12} />
                          {curlCopied ? 'Copied!' : 'cURL'}
                        </button>
                      </>
                    )}
                  </>
                )}
                {schema && schemaCachedAt && (
                  <span className="text-[10px] text-gray-500 border border-[var(--border)] rounded px-1.5 py-0.5" title={`Cached at ${new Date(schemaCachedAt).toLocaleString()}`}>
                    schema (cached)
                  </span>
                )}
                <button
                  onClick={runIntrospection}
                  disabled={introspecting}
                  className="text-xs text-pink-400 hover:text-pink-300 px-2 py-1 rounded bg-[var(--surface-3)] hover:bg-[var(--surface-4)] transition-colors disabled:opacity-50"
                  title={schema ? 'Re-fetch the GraphQL schema from the endpoint' : 'Fetch and parse the GraphQL schema from the endpoint'}
                >
                  {introspecting ? 'Introspecting...' : schema ? 'Refresh Schema' : 'Introspect'}
                </button>
              </div>
            </div>
            {bodyTab === 'query' ? (
              <div className="flex flex-1 min-h-0" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex-1 min-h-0 flex flex-col">
                  {namedOperations.length > 1 && (
                    <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
                      <span className="text-[10px] text-gray-500">Operation:</span>
                      <select
                        className="bg-[var(--surface-3)] text-gray-200 text-xs border border-[var(--border-strong)] rounded px-2 py-0.5 focus:outline-none"
                        value={operationName}
                        onChange={e => setOperationName(e.target.value)}
                      >
                        <option value="">-- all (may error) --</option>
                        {namedOperations.map(op => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {schema && schemaFields().length > 0 && !schemaCachedAt && (
                    <div className="text-[10px] text-gray-500 px-1 pt-1">
                      Schema loaded: {schemaFields().length} query fields
                    </div>
                  )}
                  {useQueryFile ? (
                    <div className="flex-1 min-h-0 flex flex-col p-4">
                      <div className="text-xs text-gray-400 mb-2">Query File Path (relative to project root):</div>
                      <VariableInput
                        variables={availableVariables}
                        value={queryFile}
                        onChange={setQueryFile}
                        placeholder="e.g. queries/getUser.graphql"
                        className="w-full bg-[var(--surface-3)] text-gray-200 border border-[var(--border-strong)] rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <div className="mt-4 text-[10px] text-gray-500">
                        When using a query file, the file's contents will be sent as the query string. Variable substitution `{'{{var}}'}` will be applied to the file path itself (e.g. if the path changes per environment).
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 flex flex-col">
                      <div className="flex-1 min-h-0 rounded-none border-t border-[var(--border)]">
                        <CodeMirror
                          value={query}
                          height="100%"
                          theme="dark"
                          extensions={gqlSchemaObj ? [graphql(gqlSchemaObj), varCompletionExtension] : [varCompletionExtension]}
                          onChange={setQuery}
                          onCreateEditor={view => { editorViewRef.current = view; }}
                          className="h-full text-sm font-mono [&_.cm-scroller]:overflow-auto"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : bodyTab === 'variables' ? (
              <div className="flex-1 min-h-0">
                <CodeMirror
                  value={variables}
                  height="100%"
                  theme="dark"
                  extensions={[json(), varCompletionExtension]}
                  onChange={setVariables}
                  className="h-full text-sm font-mono [&_.cm-scroller]:overflow-auto rounded-none border-t border-[var(--border)]"
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto py-2">
                <KeyValueEditor pairs={headers} onChange={setHeaders} variables={availableVariables} />
              </div>
            )}
          </div>
        </div>
        }
        bottom={isSubscriptionQuery ? (
          <GraphQLSubscriptionStream
            url={url}
            query={query}
            variables={variables}
            operationName={operationName}
            headers={enabledHeaders}
          />
        ) : (
          <GraphQLResponseViewer response={response} isSending={isSending} request={{ _collection: activeCollection, name: activeRequestName }} />
        )}
      />
      </div>
      {showSaved && (
        <div className="w-64 shrink-0 border-l border-[var(--border)] overflow-hidden flex flex-col bg-[var(--surface-1)] order-first border-r">
          <div className="p-2 border-b border-[var(--border)] bg-[var(--surface-2)] font-semibold text-xs text-gray-300">
            Saved GraphQL Requests
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-4">
            {collections.map(col => {
              const reqs = savedRequests.filter(r => r.collection === col);
              if (reqs.length === 0) return null;
              return (
                <div key={col} className="flex flex-col gap-1">
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">{col}</div>
                  {reqs.map(({ request }) => (
                    <button
                      key={request.name}
                      className="text-left text-xs px-2 py-1.5 rounded hover:bg-[var(--surface-3)] text-gray-300 truncate transition-colors"
                      onClick={() => {
                        setUrl(request.url ?? '');
                        setQuery(request.graphql?.query ?? '');
                        setQueryFile(request.graphql?.queryFile ?? '');
                        setUseQueryFile(!!request.graphql?.queryFile);
                        setVariables(request.graphql?.variables ? JSON.stringify(request.graphql.variables, null, 2) : '');
                        setOperationName(request.graphql?.operationName ?? '');
                        setHeaders(
                          request.headers
                            ? Object.entries(request.headers).map(([key, value]) => ({ key, value: value as string, enabled: true }))
                            : []
                        );
                        setActiveCollection(col);
                        setActiveRequestName(request.name);
                      }}
                    >
                      <span className={`mr-2 ${request.type === 'graphql-subscription' ? 'text-purple-400' : 'text-pink-400'}`}>
                        {request.type === 'graphql-subscription' ? 'SUB' : 'GQL'}
                      </span>
                      {request.name}
                    </button>
                  ))}
                </div>
              );
            })}
            {savedRequests.length === 0 && (
              <div className="text-xs text-gray-500 italic p-2 text-center mt-4">
                No saved GraphQL requests found in any collection.
              </div>
            )}
          </div>
        </div>
      )}
      {showDocs && schema && (
        <div className="w-64 shrink-0 border-l border-[var(--border)] overflow-hidden flex flex-col">
          <GraphQLDocsExplorer schema={schema} onInsertField={handleInsertField} />
        </div>
      )}
    </div>
  );
}
