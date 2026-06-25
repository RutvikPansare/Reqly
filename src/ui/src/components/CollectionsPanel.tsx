import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Play, Plus, Upload } from 'lucide-react';
import { fetchCollections, createCollection, addRequest, deleteRequest, updateRequest, renameCollection, deleteCollection, duplicateRequest, importCollection } from '../api';
import { METHOD_BADGE_BASE, methodBadgeClass } from '../lib/colors';

interface CollectionsPanelProps {
  activeRequest: any;
  onSelectRequest: (req: any, collectionName: string) => void;
  onRunCollection: (name: string) => void;
}

export function CollectionsPanel({ activeRequest, onSelectRequest, onRunCollection }: CollectionsPanelProps) {
  const [collections, setCollections] = useState<any[]>([]);
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({});

  const [creatingCol, setCreatingCol] = useState(false);
  const [newColName, setNewColName] = useState('');

  const [addingReqTo, setAddingReqTo] = useState<string | null>(null);
  const [newReqName, setNewReqName] = useState('');

  const [renaming, setRenaming] = useState<{ col: string; req: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [colRenameValue, setColRenameValue] = useState('');

  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; type: 'col'; col: string }
    | { x: number; y: number; type: 'req'; col: string; req: string }
    | null
  >(null);

  const loadData = () => {
    fetchCollections().then(setCollections).catch(console.error);
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

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const format: 'postman' | 'bruno' = file.name.endsWith('.json') ? 'postman' : 'bruno';
    try {
      const content = await file.text();
      await importCollection(content, format);
      loadData();
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    } finally {
      // reset so the same file can be re-selected
      e.target.value = '';
    }
  };

  const handleCreateCol = async () => {
    if (newColName.trim()) {
      await createCollection(newColName.trim());
      setExpandedCols(prev => ({ ...prev, [newColName.trim()]: true }));
      loadData();
    }
    setCreatingCol(false);
    setNewColName('');
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

  const handleDuplicateReq = async (col: string, req: string) => {
    await duplicateRequest(col, req, `${req} Copy`);
    loadData();
  };

  const handleDeleteCol = async (col: string) => {
    await deleteCollection(col);
    loadData();
  };

  const startRenameCol = (col: string) => {
    setRenamingCol(col);
    setColRenameValue(col);
  };

  const commitRenameCol = async () => {
    if (!renamingCol) return;
    const col = renamingCol;
    if (colRenameValue.trim() && colRenameValue.trim() !== col) {
      await renameCollection(col, colRenameValue.trim());
      loadData();
    }
    setRenamingCol(null);
    setColRenameValue('');
  };

  const startRename = (col: string, req: string) => {
    setRenaming({ col, req });
    setRenameValue(req);
  };

  const commitRename = async () => {
    if (!renaming) return;
    const { col, req } = renaming;
    if (renameValue.trim() && renameValue.trim() !== req) {
      const collection = collections.find(c => c.name === col);
      const reqObj = collection?.requests.find((r: any) => r.name === req);
      if (reqObj) {
        await updateRequest(col, req, { ...reqObj, name: renameValue.trim() });
        loadData();
      }
    }
    setRenaming(null);
    setRenameValue('');
  };

  return (
    <div className="p-3 flex flex-col gap-3 relative h-full">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Collections</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-gray-400 hover:text-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors"
            title="Import from Postman (.json) or Bruno (.bru)"
          >
            <Upload size={12} />
          </button>
          <button
            onClick={() => setCreatingCol(true)}
            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded hover:bg-gray-800 transition-colors"
            title="New collection"
          >
            + New
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.bru"
        className="hidden"
        onChange={handleImportFile}
      />

      {importError && (
        <p className="text-xs text-red-400 px-1 break-words">{importError}</p>
      )}

      <div className="space-y-1 overflow-y-auto flex-1">
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

        {collections.length === 0 && !creatingCol && (
          <p className="text-xs text-gray-600 italic px-1">No collections yet</p>
        )}

        {collections.map(col => {
          const isExpanded = expandedCols[col.name] !== false;
          return (
            <div key={col.name} className="select-none">
              <div
                className="flex items-center justify-between group hover:bg-gray-800/50 rounded px-1 py-1 cursor-pointer"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.pageX, y: e.pageY, type: 'col', col: col.name });
                }}
              >
                <div
                  className="flex items-center gap-1 flex-1 overflow-hidden"
                  onClick={() => setExpandedCols(prev => ({ ...prev, [col.name]: !isExpanded }))}
                >
                  <span className={`text-gray-500 flex items-center transition-transform ${isExpanded ? 'rotate-90' : ''}`}><ChevronRight size={14} /></span>
                  {renamingCol === col.name ? (
                    <input
                      autoFocus
                      className="flex-1 bg-gray-950 border border-blue-500 rounded px-1 py-0 text-sm text-white outline-none"
                      value={colRenameValue}
                      onChange={e => setColRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRenameCol();
                        if (e.key === 'Escape') { setRenamingCol(null); setColRenameValue(''); }
                      }}
                      onBlur={commitRenameCol}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="text-sm font-semibold text-gray-300 truncate">{col.name}</span>
                  )}
                </div>
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="text-gray-400 hover:text-white px-1.5 flex items-center"
                    title="Add Request"
                    onClick={(e) => { e.stopPropagation(); setAddingReqTo(col.name); setExpandedCols(p => ({ ...p, [col.name]: true })); }}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    className="text-blue-400 hover:text-blue-300 px-1.5 flex items-center"
                    title="Run Collection"
                    onClick={(e) => { e.stopPropagation(); onRunCollection(col.name); }}
                  >
                    <Play size={14} />
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
                    const isRenaming = renaming?.col === col.name && renaming?.req === req.name;
                    return (
                      <li
                        key={req.name}
                        className={`text-sm cursor-pointer py-1 pl-2 pr-1 rounded flex items-center gap-2 group ${isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'}`}
                        onClick={() => !isRenaming && onSelectRequest(req, col.name)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.pageX, y: e.pageY, type: 'req', col: col.name, req: req.name });
                        }}
                      >
                        <span className={`${METHOD_BADGE_BASE} ${methodBadgeClass(req.method)} shrink-0`}>{req.method}</span>
                        {isRenaming ? (
                          <input
                            autoFocus
                            className="flex-1 bg-gray-950 border border-blue-500 rounded px-1 py-0 text-sm text-white outline-none"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') { setRenaming(null); setRenameValue(''); }
                            }}
                            onBlur={commitRename}
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span className="truncate">{req.name}</span>
                        )}
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

      {contextMenu && (
        <div
          className="fixed bg-gray-900 border border-gray-700 rounded shadow-xl py-1 z-50 text-sm min-w-[120px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.type === 'col' ? (
            <>
              <button
                className="w-full text-left px-4 py-1.5 text-gray-300 hover:bg-gray-800 hover:text-white"
                onClick={() => { setAddingReqTo(contextMenu.col); setExpandedCols(p => ({ ...p, [contextMenu.col]: true })); setContextMenu(null); }}
              >
                Add Request
              </button>
              <button
                className="w-full text-left px-4 py-1.5 text-gray-300 hover:bg-gray-800 hover:text-white"
                onClick={() => { startRenameCol(contextMenu.col); setContextMenu(null); }}
              >
                Rename
              </button>
              <button
                className="w-full text-left px-4 py-1.5 text-red-400 hover:bg-gray-800 hover:text-red-300"
                onClick={() => { handleDeleteCol(contextMenu.col); setContextMenu(null); }}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full text-left px-4 py-1.5 text-gray-300 hover:bg-gray-800 hover:text-white"
                onClick={() => { startRename(contextMenu.col, contextMenu.req); setContextMenu(null); }}
              >
                Rename
              </button>
              <button
                className="w-full text-left px-4 py-1.5 text-gray-300 hover:bg-gray-800 hover:text-white"
                onClick={() => { handleDuplicateReq(contextMenu.col, contextMenu.req); setContextMenu(null); }}
              >
                Duplicate
              </button>
              <button
                className="w-full text-left px-4 py-1.5 text-red-400 hover:bg-gray-800 hover:text-red-300"
                onClick={() => { handleDeleteReq(contextMenu.col, contextMenu.req); setContextMenu(null); }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
