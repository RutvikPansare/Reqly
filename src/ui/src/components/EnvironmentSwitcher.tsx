import { useEffect, useState, useRef } from 'react';
import { ChevronDown, Download, Upload } from 'lucide-react';
import { fetchEnvironments, setActiveEnvironment, exportEnvironment, importEnvironmentFromJson } from '../api';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

export function EnvironmentSwitcher() {
  const [environments, setEnvironments] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  
  const [newEnvName, setNewEnvName] = useState('');
  const [variables, setVariables] = useState([{ key: '', value: '' }]);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const content = ev.target?.result as string;
      try {
        setImportError('');
        const result = await importEnvironmentFromJson(content);
        loadEnvs();
        await handleSelect(result.name);
        window.dispatchEvent(new Event('reqly-reload'));
        setIsOpen(false);
      } catch (err: any) {
        setImportError(err.message || 'Import failed');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors"
        style={{ background: 'var(--surface-3)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-green-500' : 'bg-gray-600'}`}></span>
        <span className="flex-1 text-left truncate">{active || 'No env'}</span>
        <ChevronDown size={14} className={`transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 bottom-full mb-1 w-64 rounded py-1 z-50" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
          <div className="max-h-64 overflow-y-auto">
            {environments.map(env => (
              <div key={env.name} className="flex items-center group">
                <button 
                  onClick={() => handleSelect(env.name)}
                  className="flex-1 text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active === env.name ? 'bg-green-500' : 'bg-transparent'}`}></span>
                  <span className="truncate">{env.name}</span>
                </button>
                <button
                  title={`Export ${env.name}`}
                  className="px-2 py-2 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                  onClick={async (e) => { e.stopPropagation(); await exportEnvironment(env.name).catch(console.error); }}
                >
                  <Download size={12} />
                </button>
              </div>
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
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 flex items-center gap-2"
            >
              <Upload size={12} /> Import Postman environment
            </button>
            {importError && <p className="px-3 pb-2 text-xs text-red-400">{importError}</p>}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      )}

      {showNewModal && (
        <Modal title="New Environment" onClose={() => setShowNewModal(false)} width="w-[500px]">
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Environment Name</label>
            <Input
              autoFocus
              value={newEnvName}
              onChange={e => setNewEnvName(e.target.value)}
              placeholder="e.g. Production"
              onKeyDown={e => e.key === 'Enter' && handleCreateEnv()}
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Variables</label>
            <div className="space-y-2">
              {variables.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    className="font-mono text-xs"
                    placeholder="Key (e.g. baseUrl)"
                    value={v.key}
                    onChange={e => { const n = [...variables]; n[i].key = e.target.value; setVariables(n); }}
                  />
                  <Input
                    className="font-mono text-xs"
                    placeholder="Value"
                    value={v.value}
                    onChange={e => { const n = [...variables]; n[i].value = e.target.value; setVariables(n); }}
                  />
                  <Button variant="ghost" size="sm" onClick={() => setVariables(variables.filter((_, idx) => idx !== i))}>×</Button>
                </div>
              ))}
              <button
                onClick={() => setVariables([...variables, { key: '', value: '' }])}
                className="text-xs text-blue-400 hover:text-blue-300 mt-1"
              >+ Add Variable</button>
            </div>
          </div>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowNewModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateEnv} disabled={!newEnvName.trim()}>Save</Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
