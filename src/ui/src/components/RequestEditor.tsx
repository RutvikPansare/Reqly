import { useState } from 'react';

interface RequestEditorProps {
  request: any;
  onFire: (req: any) => void;
  onSave: (req: any) => void;
}

export function RequestEditor({ request, onFire, onSave }: RequestEditorProps) {
  const [activeTab, setActiveTab] = useState('params');
  const [url, setUrl] = useState(request?.url || '');
  const [method, setMethod] = useState(request?.method || 'GET');

  if (!request) {
    return <div className="h-full flex items-center justify-center text-gray-500">Select a request to edit</div>;
  }

  const tabs = ['params', 'headers', 'body', 'auth', 'assertions'];

  const [assertions, setAssertions] = useState<any[]>(request?.assertions || []);

  const addAssertion = () => setAssertions([...assertions, { field: 'status', operator: 'eq', value: '' }]);
  const updateAssertion = (index: number, key: string, val: string) => {
    const newAss = [...assertions];
    newAss[index][key] = val;
    setAssertions(newAss);
  };
  const removeAssertion = (index: number) => setAssertions(assertions.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
      <div className="flex p-2 gap-2 border-b border-gray-800 bg-gray-950">
        <select 
          className="bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1 text-sm font-semibold focus:outline-none"
          value={method}
          onChange={e => setMethod(e.target.value)}
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
          onChange={e => setUrl(e.target.value)}
          placeholder="https://api.example.com/v1/users"
        />
        <button 
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1 rounded text-sm font-semibold transition-colors"
          onClick={() => onFire({ ...request, method, url, assertions })}
        >
          Send
        </button>
        <button 
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-1 rounded text-sm font-semibold transition-colors"
          onClick={() => onSave({ ...request, method, url, assertions })}
        >
          Save
        </button>
      </div>

      <div className="flex border-b border-gray-800 px-2 bg-gray-950 overflow-x-auto">
        {tabs.map(tab => (
          <button 
            key={tab}
            className={\`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors \${activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}\`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-gray-900">
        {activeTab === 'assertions' ? (
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
        ) : (
          <div className="text-gray-500 text-sm">
            {activeTab} editor coming soon...
          </div>
        )}
      </div>
    </div>
  );
}
