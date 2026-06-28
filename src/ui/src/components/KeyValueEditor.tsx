import { CheckCircle2, Circle, Trash2 } from 'lucide-react';
import { VariableInput } from './VariableInput';
import type { VariableItem } from './VariableInput';

export interface KeyValuePair {
  key: string;
  value: string;
  enabled: boolean;
}

interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  variables?: VariableItem[];
}

export function KeyValueEditor({ pairs, onChange, variables = [] }: KeyValueEditorProps) {
  // Ensure there's always an empty row at the bottom
  const items = [...pairs];
  if (items.length === 0 || (items[items.length - 1].key !== '' || items[items.length - 1].value !== '')) {
    items.push({ key: '', value: '', enabled: true });
  }

  const handleChange = (index: number, field: keyof KeyValuePair, val: any) => {
    const newPairs = [...items];
    newPairs[index] = { ...newPairs[index], [field]: val };
    
    // Auto-enable if user types in a completely empty row
    if (field !== 'enabled' && !items[index].key && !items[index].value && val) {
      newPairs[index].enabled = true;
    }

    // Filter out the last row if it's empty, we add it back automatically during render
    const filtered = newPairs.filter((p, i) => i !== newPairs.length - 1 || p.key || p.value);
    onChange(filtered);
  };

  const handleRemove = (index: number) => {
    const newPairs = items.filter((_, i) => i !== index);
    onChange(newPairs);
  };

  return (
    <div className="w-full">
      {items.map((pair, i) => {
        const isLastEmpty = i === items.length - 1 && !pair.key && !pair.value;
        return (
          <div
            key={i}
            className="flex items-stretch group"
            style={{ borderBottom: isLastEmpty ? 'none' : '1px solid var(--border)' }}
          >
            <button
              className="text-gray-500 hover:text-gray-300 w-9 flex justify-center items-center shrink-0"
              onClick={() => !isLastEmpty && handleChange(i, 'enabled', !pair.enabled)}
              disabled={isLastEmpty}
            >
              {!isLastEmpty ? (
                pair.enabled ? (
                  <CheckCircle2 size={16} className="text-green-500" />
                ) : (
                  <Circle size={16} />
                )
              ) : (
                <div className="w-4 h-4"></div>
              )}
            </button>
            <VariableInput
              variables={variables}
              className={`flex-1 bg-transparent border-0 px-2 py-2 text-sm text-gray-200 focus:outline-none ${!pair.enabled && !isLastEmpty ? 'opacity-50' : ''}`}
              placeholder="Key"
              value={pair.key}
              onChange={val => handleChange(i, 'key', val)}
            />
            <VariableInput
              variables={variables}
              className={`flex-1 bg-transparent border-0 px-2 py-2 text-sm text-gray-200 focus:outline-none ${!pair.enabled && !isLastEmpty ? 'opacity-50' : ''}`}
              placeholder="Value"
              value={pair.value}
              onChange={val => handleChange(i, 'value', val)}
            />
            <button
              onClick={() => handleRemove(i)}
              className={`text-gray-600 hover:text-red-400 w-9 flex justify-center items-center shrink-0 ${isLastEmpty ? 'invisible' : 'invisible group-hover:visible'}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
