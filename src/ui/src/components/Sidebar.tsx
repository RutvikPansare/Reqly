import { useEffect, useState } from 'react';
import { fetchCollections, fetchEnvironments, setActiveEnvironment, createCollection, deleteRequest, updateRequest, addRequest } from '../api';
import { CapturePanel } from './CapturePanel';
import { EnvironmentEditor } from './EnvironmentEditor';

interface SidebarProps {
  activeRequest: any;
  onSelectRequest: (req: any, collectionName: string) => void;
  onRunCollection: (name: string) => void;
}

export function Sidebar({ activeRequest, onSelectRequest, onRunCollection }: SidebarProps) {
  const [collections, setCollections] = useState<any[]>([]);
  const [environments, setEnvironments] = useState<any>(null);
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({});
  
  const [creatingCol, setCreatingCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  
  const [creatingEnv, setCreatingEnv] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');

  const [addingReqTo, setAddingReqTo] = useState<string | null>(null);
  const [newReqName, setNewReqName] = useState('');

  const [editingEnv, setEditingEnv] = useState<any>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, col: string, req: string } | null>(null);

  const loadData = () => {
    fetchCollections().then(setCollections).catch(console.error);
    fetchEnvironments().then(setEnvironments).catch(console.error);
  };

  useEffect(() => {
    loadData();
    const closeMenu = () => setContextMenu(null);
    document.addEventListener('click', closeMenu);
    window.addEventListener('reqly-reload', loadData);
    return () => {
      document.removeEventListener('click', closeMenu);
      window.removeEventListener('reqly-reload', loadData);
    };
  }, []);

  const handleCreateCol = async () => {
    if (newColName.trim()) {
      await createCollection(newColName.trim());
      setExpandedCols(prev => ({ ...prev, [newColName.trim()]: true }));
      loadData();
    }
    setCreatingCol(false);
    setNewColName('');
  };

  const handleCreateEnv = async () => {
    if (newEnvName.trim()) {
      await fetch('/api/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEnvName.trim(), variables: {} })
      });
      loadData();
      await setActiveEnvironment(newEnvName.trim());
      loadData();
    }
    setCreatingEnv(false);
    setNewEnvName('');
  };

  const handleAddReq = async (colName: string) => {
    if (newReqName.trim()) {
      const req = { name: newReqName.trim(), method: 'GET', url: 'https://api.example.com' };
      await addRequest(colName, req);
      onSelectRequest(req, colName);
      loadData();
    }
    setAddingReqTo(null);
    setNewReqName('');
  };

  const handleDeleteReq = async (col: string, req: string) => {
    await deleteRequest(col, req);
    loadData();
  };

  const handleRenameReq = async (col: string, oldName: string) => {
    const newName = prompt('New request name:', oldName);
    if (newName && newName.trim() && newName.trim() !== oldName) {
      const collection = collections.find(c => c.name === col);
      const req = collection.requests.find((r: any) => r.name === oldName);
      await updateRequest(col, oldName, { ...req, name: newName.trim() });
      loadData();
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'text-blue-500';
      case 'POST': return 'text-green-500';
      case 'PUT': return 'text-amber-500';
      case 'PATCH': return 'text-orange-500';
      case 'DELETE': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="p-4 flex flex-col gap-6 relative">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Environments</h2>
          <button onClick={() => setCreatingEnv(true)} className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded hover:bg-gray-800 transition-colors">+ New</button>
        </div>
        
        <ul className="space-y-1">
          {creatingEnv && (
            <li className="mb-2">
              <input 
                autoFocus
                className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
                placeholder="Environment name..."
                value={newEnvName}
                onChange={e => setNewEnvName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateEnv();
                  if (e.key === 'Escape') setCreatingEnv(false);
                }}
                onBlur={() => setCreatingEnv(false)}
              />
            </li>
          )}
          {environments?.environments?.map((env: any) => (
            <li 
              key={env.name} 
              className={`text-sm p-1 rounded group flex items-center justify-between ${environments?.active === env.name ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <div 
                className="flex-1 cursor-pointer flex items-center overflow-hidden"
                onClick={async () => {
                  await setActiveEnvironment(env.name);
                  loadData();
                }}
              >
                <span className={`inline-block w-2 h-2 rounded-full mr-2 shrink-0 ${environments?.active === env.name ? 'bg-green-500' : 'bg-transparent'}`}></span>
                <span className="truncate">{env.name}</span>
              </div>
              <button 
                className="opacity-0 group-hover:opacity-100 px-1 text-gray-500 hover:text-blue-400 transition-opacity"
                title="Edit Variables"
                onClick={() => setEditingEnv(env)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/>
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Collections</h2>
          <button onClick={() => setCreatingCol(true)} className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded hover:bg-gray-800 transition-colors">+ New</button>
        </div>
        
        <div className="space-y-1">
          {creatingCol && (
            <input 
              autoFocus
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-white mb-2 outline-none focus:border-blue-500"
              placeholder="Collection name..."
              value={newColName}
              onChange={e => setNewColName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateCol();
                if (e.key === 'Escape') setCreatingCol(false);
              }}
              onBlur={() => setCreatingCol(false)}
            />
          )}

          {collections.map(col => {
            const isExpanded = expandedCols[col.name] !== false; // Default true or based on state
            
            return (
              <div key={col.name} className="select-none">
                <div className="flex items-center justify-between group hover:bg-gray-800/50 rounded px-1 py-1 cursor-pointer">
                  <div 
                    className="flex items-center gap-1 flex-1 overflow-hidden" 
                    onClick={() => setExpandedCols(prev => ({ ...prev, [col.name]: !isExpanded }))}
                  >
                    <span className={`text-gray-500 text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                    <span className="text-sm font-semibold text-gray-300 truncate">{col.name}</span>
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      className="text-gray-400 hover:text-white px-1.5"
                      title="Add Request"
                      onClick={(e) => { e.stopPropagation(); setAddingReqTo(col.name); setExpandedCols(p => ({...p, [col.name]: true})); }}
                    >
                      +
                    </button>
                    <button 
                      className="text-blue-400 hover:text-blue-300 px-1.5"
                      title="Run Collection"
                      onClick={(e) => { e.stopPropagation(); onRunCollection(col.name); }}
                    >
                      ▶
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <ul className="pl-4 border-l border-gray-800 ml-1.5 space-y-0.5 mt-0.5 mb-1">
                    {addingReqTo === col.name && (
                      <li className="py-1 pl-2">
                        <input 
                          autoFocus
                          className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-0.5 text-sm text-white outline-none focus:border-blue-500"
                          placeholder="Request name..."
                          value={newReqName}
                          onChange={e => setNewReqName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddReq(col.name);
                            if (e.key === 'Escape') setAddingReqTo(null);
                          }}
                          onBlur={() => setAddingReqTo(null)}
                        />
                      </li>
                    )}
                    
                    {col.requests.map((req: any) => {
                      const isActive = activeRequest?.name === req.name && activeRequest?._collection === col.name;
                      return (
                        <li 
                          key={req.name} 
                          className={`text-sm cursor-pointer py-1 pl-2 rounded flex items-center ${isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'}`}
                          onClick={() => onSelectRequest(req, col.name)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.pageX, y: e.pageY, col: col.name, req: req.name });
                          }}
                        >
                          <span className={`text-[10px] font-bold w-10 ${getMethodColor(req.method)}`}>{req.method}</span>
                          <span className="truncate">{req.name}</span>
                        </li>
                      );
                    })}
                    {col.requests.length === 0 && !addingReqTo && <li className="text-xs text-gray-600 italic py-1 pl-2">No requests</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
      
      {contextMenu && (
        <div 
          className="fixed bg-gray-900 border border-gray-700 rounded shadow-xl py-1 z-50 text-sm min-w-[120px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button 
            className="w-full text-left px-4 py-1.5 text-gray-300 hover:bg-gray-800 hover:text-white"
            onClick={() => handleRenameReq(contextMenu.col, contextMenu.req)}
          >
            Rename
          </button>
          <button 
            className="w-full text-left px-4 py-1.5 text-red-400 hover:bg-gray-800 hover:text-red-300"
            onClick={() => handleDeleteReq(contextMenu.col, contextMenu.req)}
          >
            Delete
          </button>
        </div>
      )}

      <CapturePanel onSelectCaptured={(req) => {
        // Find captured collection to pass
        onSelectRequest(req, 'captured');
      }} />

      {editingEnv && (
        <EnvironmentEditor 
          environment={editingEnv} 
          onClose={() => setEditingEnv(null)}
          onSaveSuccess={() => {
            loadData();
            setEditingEnv(null);
          }}
        />
      )}
    </div>
  );
}
