import { useEffect, useState, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { fetchEnvironments, setActiveEnvironment } from '../api';

export function EnvironmentSwitcher() {
  const [environments, setEnvironments] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  
  const [newEnvName, setNewEnvName] = useState('');
  const [variables, setVariables] = useState([{ key: '', value: '' }]);

  const popoverRef = useRef<HTMLDivElement>(null);

  const loadEnvs = () => {
    fetchEnvironments().then(data => {
      setEnvironments(data.environments || []);
      setActive(data.active || null);
    }).catch(console.error);
  };

  useEffect(() => {
    loadEnvs();
    
    const handleReload = () => loadEnvs();
    window.addEventListener('reqly-reload', handleReload);

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('reqly-reload', handleReload);
    };
  }, []);

  const handleSelect = async (name: string) => {
    try {
      await setActiveEnvironment(name);
      setActive(name);
      setIsOpen(false);
      window.dispatchEvent(new Event('reqly-reload'));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateEnv = async () => {
    if (!newEnvName.trim()) return;
    
    const varsMap: Record<string, string> = {};
    variables.forEach(v => {
      if (v.key.trim()) varsMap[v.key.trim()] = v.value;
    });

    try {
      // Create environment
      await fetch('/api/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEnvName.trim(), variables: varsMap })
      });
      setShowNewModal(false);
      setNewEnvName('');
      setVariables([{ key: '', value: '' }]);
      loadEnvs();
      await handleSelect(newEnvName.trim());
      window.dispatchEvent(new Event('reqly-reload'));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 bg-gray-900 border border-gray-700 hover:border-gray-500 text-gray-300 px-3 py-1.5 rounded text-sm font-medium transition-colors"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-green-500' : 'bg-gray-600'}`}></span>
        <span className="flex-1 text-left truncate">{active || 'No env'}</span>
        <ChevronDown size={14} className={`transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 bottom-full mb-1 w-56 bg-gray-900 border border-gray-700 rounded shadow-xl py-1 z-50">
          <div className="max-h-64 overflow-y-auto">
            {environments.map(env => (
              <button 
                key={env.name}
                onClick={() => handleSelect(env.name)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active === env.name ? 'bg-green-500' : 'bg-transparent'}`}></span>
                {env.name}
              </button>
            ))}
            {environments.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500 italic">No environments</div>
            )}
          </div>
          <div className="border-t border-gray-800 mt-1 pt-1">
            <button 
              onClick={() => { setIsOpen(false); setShowNewModal(true); }}
              className="w-full text-left px-3 py-2 text-sm text-blue-400 hover:bg-gray-800 flex items-center gap-2"
            >
              + New environment
            </button>
          </div>
        </div>
      )}

      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-gray-900 border border-gray-700 rounded p-6 w-[500px] shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-4">New Environment</h2>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Environment Name</label>
              <input 
                autoFocus
                className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={newEnvName}
                onChange={e => setNewEnvName(e.target.value)}
                placeholder="e.g. Production"
              />
            </div>
            
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-1">Variables</label>
              <div className="space-y-2">
                {variables.map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <input 
                      className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none font-mono"
                      placeholder="Key (e.g. baseUrl)"
                      value={v.key}
                      onChange={e => {
                        const newVars = [...variables];
                        newVars[i].key = e.target.value;
                        setVariables(newVars);
                      }}
                    />
                    <input 
                      className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none font-mono"
                      placeholder="Value"
                      value={v.value}
                      onChange={e => {
                        const newVars = [...variables];
                        newVars[i].value = e.target.value;
                        setVariables(newVars);
                      }}
                    />
                    <button 
                      onClick={() => setVariables(variables.filter((_, idx) => idx !== i))}
                      className="text-gray-500 hover:text-red-400 px-2"
                    >×</button>
                  </div>
                ))}
                <button 
                  onClick={() => setVariables([...variables, { key: '', value: '' }])}
                  className="text-xs text-blue-400 hover:text-blue-300 mt-2"
                >+ Add Variable</button>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-800 pt-4">
              <button 
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >Cancel</button>
              <button 
                onClick={handleCreateEnv}
                disabled={!newEnvName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-sm font-medium rounded transition-colors"
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
