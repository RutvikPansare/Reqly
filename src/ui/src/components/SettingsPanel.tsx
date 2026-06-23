import { useEffect, useState } from 'react';
import { fetchConfig, saveConfig } from '../api-config';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-3-7-sonnet-20250219');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfig().then(config => {
      if (config.llmApiKey) setApiKey(config.llmApiKey);
      if (config.llmModel) setModel(config.llmModel);
      setLoading(false);
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    await saveConfig({ llmApiKey: apiKey, llmModel: model });
    onClose();
  };

  if (loading) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-[400px] overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center bg-gray-950">
          <h2 className="font-semibold text-gray-200">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">&times;</button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">LLM API Key</label>
            <input 
              type="password" 
              className="w-full bg-gray-950 text-gray-200 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Model</label>
            <select 
              className="w-full bg-gray-950 text-gray-200 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              value={model}
              onChange={e => setModel(e.target.value)}
            >
              <option value="claude-3-7-sonnet-20250219">Claude 3.7 Sonnet</option>
              <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o-mini</option>
            </select>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-800 flex justify-end gap-2 bg-gray-950">
          <button 
            className="px-4 py-1.5 text-sm font-semibold text-gray-400 hover:text-white"
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-sm font-semibold transition-colors"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
