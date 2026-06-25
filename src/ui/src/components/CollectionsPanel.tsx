import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Play, Plus, FolderInput } from 'lucide-react';
import { fetchCollections, createCollection, addRequest, deleteRequest, updateRequest, renameCollection, deleteCollection, duplicateRequest, importCollection } from '../api';
import { METHOD_BADGE_BASE, methodBadgeClass } from '../lib/colors';
import { SidebarEnvSection } from './SidebarEnvSection';
import { SuccessToast } from './ui/SuccessToast';

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
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
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
      // Show the collection name without extension as the success label
      const collectionName = file.name.replace(/\.(json|bru)$/i, '');
      setImportSuccess(collectionName);
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    } finally {
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
    <div className="p-3 flex flex-col gap-3 relative min-h-full">

      {/* Import button - prominent, top of panel */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm font-medium transition-colors shrink-0"
        style={{ background: 'var(--surface-3)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}
        title="Import from Postman (.json) or Bruno (.bru)"
      >
        <FolderInput size={15} className="text-blue-400 shrink-0" />
        Import Collection
      </button>

      {importError && (
        <p className="text-xs text-red-400 px-1 break-words shrink-0">{importError}</p>
      )}

      {/* Environments section - below import button, above collections */}
      <div className="-mx-3 -mt-1" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <SidebarEnvSection />
      </div>

      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Collections</h2>
        <button
          onClick={() => setCreatingCol(true)}
          className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded transition-colors"
          title="New collection"
        >
          + New
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.bru"
        className="hidden"
        onChange={handleImportFile}
      />

      <div className="space-y-1">
        {creatingCol && (
          <input
            autoFocus
            className="input w-full mb-2 text-sm"
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
          <p className="text-xs italic px-1" style={{ color: 'var(--text-muted)' }}>No collections yet</p>
        )}

        {collections.map(col => {
          const isExpanded = expandedCols[col.name] !== false;
          return (
            <div key={col.name} className="select-none">
              <div
                className="flex items-center justify-between group rounded px-1.5 py-1 cursor-pointer transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.pageX, y: e.pageY, type: 'col', col: col.name });
                }}
              >
                <div
                  className="flex items-center gap-1 flex-1 overflow-hidden"
                  onClick={() => setExpandedCols(prev => ({ ...prev, [col.name]: !isExpanded }))}
                >
                  <span className="flex items-center transition-transform" style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(90deg)' : 'none' }}><ChevronRight size={14} /></span>
                  {renamingCol === col.name ? (
                    <input
                      autoFocus
                      className="input flex-1 text-sm py-0"
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
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{col.name}</span>
                  )}
                </div>
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="px-1.5 flex items-center transition-colors"
                    style={{ color: 'var(--text-muted)' }}
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
                <ul className="pl-4 ml-1.5 space-y-0.5 mt-0.5 mb-1" style={{ borderLeft: '1px solid var(--border)' }}>
                  {addingReqTo === col.name && (
                    <li className="py-1 pl-2">
                      <input
                        autoFocus
                        className="input w-full text-sm py-0.5"
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
                        className="text-sm cursor-pointer py-1 pl-2 pr-1 rounded flex items-center gap-2 group transition-colors"
                        style={{ background: isActive ? 'var(--surface-3)' : 'transparent', color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-3)'; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
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
                            className="input flex-1 text-sm py-0"
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
          className="fixed rounded py-1 z-50 text-sm min-w-[130px]"
          style={{ top: contextMenu.y, left: contextMenu.x, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.type === 'col' ? (
            <>
              <button
                className="w-full text-left px-4 py-1.5 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { setAddingReqTo(contextMenu.col); setExpandedCols(p => ({ ...p, [contextMenu.col]: true })); setContextMenu(null); }}
              >
                Add Request
              </button>
              <button
                className="w-full text-left px-4 py-1.5 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { startRenameCol(contextMenu.col); setContextMenu(null); }}
              >
                Rename
              </button>
              <button
                className="w-full text-left px-4 py-1.5 text-red-400 hover:text-red-300 transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { handleDeleteCol(contextMenu.col); setContextMenu(null); }}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full text-left px-4 py-1.5 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { startRename(contextMenu.col, contextMenu.req); setContextMenu(null); }}
              >
                Rename
              </button>
              <button
                className="w-full text-left px-4 py-1.5 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { handleDuplicateReq(contextMenu.col, contextMenu.req); setContextMenu(null); }}
              >
                Duplicate
              </button>
              <button
                className="w-full text-left px-4 py-1.5 text-red-400 hover:text-red-300 transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { handleDeleteReq(contextMenu.col, contextMenu.req); setContextMenu(null); }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {importSuccess && (
        <SuccessToast
          message="Collection imported!"
          sub={importSuccess}
          onDone={() => setImportSuccess(null)}
        />
      )}
    </div>
  );
}
