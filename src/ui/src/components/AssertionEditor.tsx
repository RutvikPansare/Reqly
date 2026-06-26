interface Assertion {
  field: 'status' | 'body' | 'latency';
  path?: string;
  operator: 'eq' | 'neq' | 'contains' | 'lt' | 'gt';
  value: string | number;
}

interface AssertionEditorProps {
  assertions: Assertion[];
  onChange: (assertions: Assertion[]) => void;
}

export function AssertionEditor({ assertions, onChange }: AssertionEditorProps) {
  const addAssertion = () => onChange([...assertions, { field: 'status', operator: 'eq', value: '' }]);
  const updateAssertion = (index: number, key: string, val: string) => {
    const newAss = [...assertions];
    (newAss[index] as any)[key] = val;
    onChange(newAss);
  };
  const removeAssertion = (index: number) => onChange(assertions.filter((_, i) => i !== index));

  return (
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
  );
}
