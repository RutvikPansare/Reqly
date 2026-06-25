import { useState, useMemo, useEffect } from 'react';
import { Send as SendIcon, Loader2, Save } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { graphql } from 'cm6-graphql';
import { buildClientSchema } from 'graphql';
import { json } from '@codemirror/lang-json';
import { ResponseViewer } from './ResponseViewer';
import { addRequest, fetchCollections } from '../api';

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

export function GraphQLWorkspace() {
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [variables, setVariables] = useState('');
  const [bodyTab, setBodyTab] = useState<'query' | 'variables'>('query');
  const [schema, setSchema] = useState<any>(null);
  const [introspecting, setIntrospecting] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [isSending, setIsSending] = useState(false);
  const [collections, setCollections] = useState<string[]>([]);
  const [saveCollection, setSaveCollection] = useState('');
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);

  useEffect(() => {
    fetchCollections().then((cols: any[]) => setCollections(cols.map((c: any) => c.name))).catch(() => {});
  }, []);

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
      await addRequest(saveCollection, {
        id: Date.now().toString(),
        name: saveName.trim(),
        method: 'POST',
        url: url.trim(),
        type: 'graphql',
        graphql: { query, ...(parsedVariables !== undefined ? { variables: parsedVariables } : {}) },
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

  const runIntrospection = async () => {
    if (!url.trim()) { alert('Enter the GraphQL endpoint URL first.'); return; }
    setIntrospecting(true);
    try {
      const res = await fetch('/api/run/adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: { name: 'introspection', method: 'POST', url, body: { query: INTROSPECTION_QUERY } }
        })
      });
      const data = await res.json();
      const schemaData = data.response?.body?.data?.__schema || data.response?.body?.__schema;
      if (schemaData) {
        setSchema(schemaData);
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
      const body: any = { query };
      if (vars) body.variables = vars;
      const res = await fetch('/api/run/adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: { name: 'graphql', method: 'POST', url, headers: { 'Content-Type': 'application/json' }, body }
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
    <div className="absolute inset-0 flex flex-col p-4 gap-4 overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
          <div className="flex p-2 gap-2 border-b border-gray-800 bg-gray-950">
            <span className="px-2 py-1 rounded text-xs font-semibold bg-pink-600 text-white border border-pink-500">GQL</span>
            <input
              type="text"
              className="flex-1 bg-gray-800 text-gray-200 border border-gray-700 rounded px-3 py-1 text-sm focus:outline-none focus:border-blue-500"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://api.example.com/graphql"
            />
            <button
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1 rounded text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              onClick={handleSend}
              disabled={isSending}
            >
              {isSending ? <Loader2 size={14} className="animate-spin" /> : <SendIcon size={14} />}
              {isSending ? 'Sending...' : 'Send'}
            </button>
            <button
              className={`px-3 py-1 rounded text-sm font-semibold transition-colors flex items-center gap-1.5 border ${saveSuccess ? 'bg-green-900 border-green-700 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
              onClick={() => setShowSaveForm(v => !v)}
              title="Save to collection"
            >
              <Save size={14} />
              {saveSuccess ? 'Saved!' : 'Save'}
            </button>
          </div>

          {showSaveForm && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-900">
              <select
                className="bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none"
                value={saveCollection}
                onChange={e => setSaveCollection(e.target.value)}
              >
                <option value="">-- collection --</option>
                {collections.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                className="flex-1 bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Request name"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              <button
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
                onClick={handleSave}
              >
                Save
              </button>
              {saveError && <span className="text-red-400 text-xs">{saveError}</span>}
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col gap-2 p-4">
            <div className="flex justify-between items-center px-1">
              <div className="flex gap-1">
                <button
                  className={`px-3 py-1 text-xs font-semibold rounded ${bodyTab === 'query' ? 'bg-gray-800 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                  onClick={() => setBodyTab('query')}
                >
                  Query
                </button>
                <button
                  className={`px-3 py-1 text-xs font-semibold rounded ${bodyTab === 'variables' ? 'bg-gray-800 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                  onClick={() => setBodyTab('variables')}
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
            {bodyTab === 'query' ? (
              <>
                {schema && schemaFields().length > 0 && (
                  <div className="text-[10px] text-gray-500 px-1">
                    Schema loaded: {schemaFields().length} query fields - {schemaFields().join(', ')}
                  </div>
                )}
                <div className="flex-1 min-h-0 bg-gray-950 border border-gray-800 rounded overflow-hidden">
                  <CodeMirror
                    value={query}
                    height="100%"
                    theme="dark"
                    extensions={gqlSchemaObj ? [graphql(gqlSchemaObj)] : []}
                    onChange={setQuery}
                    className="h-full text-sm font-mono [&_.cm-scroller]:overflow-auto"
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-0 bg-gray-950 border border-gray-800 rounded overflow-hidden">
                <CodeMirror
                  value={variables}
                  height="100%"
                  theme="dark"
                  extensions={[json()]}
                  onChange={setVariables}
                  className="h-full text-sm font-mono [&_.cm-scroller]:overflow-auto"
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <ResponseViewer response={response} isSending={isSending} />
      </div>
    </div>
  );
}
