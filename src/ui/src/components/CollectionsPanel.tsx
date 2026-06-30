import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Play, Plus, Search, Download, BookMarked, Trash2, Settings, FolderOpen, Folder, AlertTriangle, Copy, Check } from 'lucide-react';
import { fetchCollections, createCollection, addRequest, deleteRequest, updateRequest, renameCollection, deleteCollection, duplicateCollection, duplicateRequest, moveRequest, exportCollection, deleteExample } from '../api';
import { METHOD_BADGE_BASE, methodBadgeClass } from '../lib/colors';
import { SidebarEnvSection } from './SidebarEnvSection';
import { SuccessToast } from './ui/SuccessToast';
import { CollectionSettingsModal } from './CollectionSettingsModal';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';

interface CollectionsPanelProps {
  activeRequest: any;
  onSelectRequest: (req: any, collectionName: string) => void;
  onRunCollection: (name: string) => void;
}

function formatProjectPath(p: string) {
  const parts = p.replace(/\\/g, '/').split('/');
  const name = parts[parts.length - 1] || parts[parts.length - 2] || p;
  const parent = parts.slice(0, -1).join('/') || '/';
  const display = parent.startsWith('/Users/') ? parent.replace(/^\/Users\/[^/]+/, '~') : parent;
  return { name, display };
}

function SidebarEmptyHint() {
  const [copied, setCopied] = useState(false);
  const prompt = 'Create a Reqly collection from my routes.';

  return (
    <div className="flex items-start gap-1.5 px-1.5 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
      <span className="leading-tight">Ask your agent: "{prompt}"</span>
      <button
        onClick={() => {
          navigator.clipboard.writeText(prompt).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="flex items-center justify-center rounded shrink-0 mt-0.5"
        style={{ width: '18px', height: '18px', color: copied ? '#4ade80' : 'var(--text-muted)', background: 'transparent', border: 'none' }}
        title="Copy"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </div>
  );
}

function ProjectPathWidget({ projectPath, lastMcpActivityAt, onSwitch }: { projectPath: string; lastMcpActivityAt: number | null; onSwitch: (p: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pendingDir, setPendingDir] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasRecentMcpActivity = !!lastMcpActivityAt && Date.now() - lastMcpActivityAt < 60000;

  const startEdit = () => {
    setInput(projectPath);
    setError('');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 30);
  };

  const cancel = () => { setEditing(false); setError(''); setPendingDir(null); };

  const doSwitch = async (target: string, createIfMissing = false) => {
    setSwitching(true);
    setError('');
    try {
      const res = await fetch('/api/switch-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDir: target, createIfMissing }),
      });
      const data = await res.json();
      if (res.status === 404 && data.notFound) {
        setError('Path not found');
        setSwitching(false);
        return;
      }
      if (!res.ok) { setError(data.error || 'Failed to switch'); setSwitching(false); return; }
      if (data.needsReqlyDir) {
        setPendingDir(target);
        setSwitching(false);
        return;
      }
      onSwitch(target);
      setEditing(false);
      setPendingDir(null);
    } catch {
      setError('Network error');
    }
    setSwitching(false);
  };

  const submit = () => {
    const target = input.trim();
    if (!target || target === projectPath) { cancel(); return; }
    doSwitch(target);
  };

  const openPicker = async () => {
    setPickerBusy(true);
    try {
      const res = await fetch('/api/open-folder-picker');
      const data = await res.json();
      if (data.path) {
        setInput(data.path);
        setError('');
      }
    } catch {
      // ignore - leave input as-is
    }
    setPickerBusy(false);
  };

  const { name, display } = formatProjectPath(projectPath);

  if (pendingDir) {
    return (
      <>
        <div className="shrink-0 rounded-md px-3 py-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="font-mono font-medium truncate" style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{name}</div>
          <div className="font-mono truncate" style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{display}</div>
        </div>
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-md p-4 max-w-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Reqly collections found</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              The folder <span className="font-mono">{pendingDir}</span> doesn't have a <span className="font-mono">.reqly/</span> directory. Reqly uses this folder to store your collections.
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => doSwitch(pendingDir, true)}
                disabled={switching}
                className="flex-1 text-xs rounded px-2 py-1.5 font-medium"
                style={{ background: 'var(--accent)', color: '#000', opacity: switching ? 0.6 : 1 }}
              >
                {switching ? 'Creating…' : `Create .reqly/ here`}
              </button>
              <button
                onClick={async () => { setPendingDir(null); await openPicker(); }}
                disabled={switching}
                className="text-xs rounded px-2 py-1.5"
                style={{ background: 'var(--surface-4)', color: 'var(--text-muted)' }}
              >
                Choose a different folder
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (editing) {
    return (
      <div className="shrink-0 rounded-md" style={{ background: 'var(--surface-2)', border: '1px solid var(--accent)' }}>
        <div className="flex items-center gap-2 px-3 py-2">
          <FolderOpen size={13} style={{ color: '#60a5fa', flexShrink: 0 }} />
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Switch project</span>
        </div>
        <div className="px-3 pb-2 flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel(); }}
              className="input font-mono flex-1"
              style={{ fontSize: '0.7rem', height: '28px' }}
              placeholder="/path/to/project"
              disabled={switching}
              spellCheck={false}
            />
            <button
              onClick={openPicker}
              disabled={switching || pickerBusy}
              title="Browse for folder"
              className="rounded flex items-center justify-center shrink-0"
              style={{ width: '28px', height: '28px', background: 'var(--surface-4)', color: 'var(--text-muted)', opacity: pickerBusy ? 0.6 : 1 }}
            >
              <Folder size={13} />
            </button>
          </div>
          {hasRecentMcpActivity && (
            <p className="text-xs flex items-start gap-1" style={{ color: '#fbbf24' }}>
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              An AI agent may be using this project. Switching will change its context.
            </p>
          )}
          {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
          <div className="flex gap-1.5">
            <button
              onClick={submit}
              disabled={switching}
              className="flex-1 text-xs rounded px-2 py-1 transition-colors font-medium"
              style={{ background: 'var(--accent)', color: '#000', opacity: switching ? 0.6 : 1 }}
            >
              {switching ? 'Switching…' : 'Switch'}
            </button>
            <button
              onClick={cancel}
              disabled={switching}
              className="text-xs rounded px-2 py-1 transition-colors"
              style={{ background: 'var(--surface-4)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="shrink-0 w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors group"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      title={`${projectPath}\nClick to switch project`}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
    >
      <FolderOpen size={13} style={{ color: '#60a5fa', flexShrink: 0 }} />
      <div className="min-w-0 flex-1">
        <div className="font-mono font-medium truncate" style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>{name}</div>
        <div className="font-mono truncate" style={{ fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{display}</div>
      </div>
      <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: 'var(--text-muted)' }}>change</span>
    </button>
  );
}

export function CollectionsPanel({ activeRequest, onSelectRequest, onRunCollection }: CollectionsPanelProps) {
  const [collections, setCollections] = useState<any[]>([]);
  const [projectPath, setProjectPath] = useState<string>('');
  const [lastMcpActivityAt, setLastMcpActivityAt] = useState<number | null>(null);
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({});
  const [expandedReqs, setExpandedReqs] = useState<Record<string, boolean>>({});

  const [creatingCol, setCreatingCol] = useState(false);
  const [newColName, setNewColName] = useState('');

  const [addingReqTo, setAddingReqTo] = useState<string | null>(null);
  const [newReqName, setNewReqName] = useState('');

  const [renaming, setRenaming] = useState<{ col: string; req: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [colRenameValue, setColRenameValue] = useState('');

  const [search, setSearch] = useState('');
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<{ name: string; format: string } | null>(null);

  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; type: 'col'; col: string }
    | { x: number; y: number; type: 'req'; col: string; req: string }
    | { x: number; y: number; type: 'example'; col: string; req: string; exampleId: string }
    | null
  >(null);

  // Drag-and-drop move + "Move to" modal
  const [draggedReq, setDraggedReq] = useState<{ col: string; req: string } | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [moveModal, setMoveModal] = useState<{ col: string; req: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);

  const loadData = () => {
    fetchCollections().then(setCollections).catch(console.error);
    fetch('/api/project').then(r => r.json()).then(d => { setProjectPath(d.path); setLastMcpActivityAt(d.lastMcpActivityAt ?? null); }).catch(() => {});
  };

  useEffect(() => {
    loadData();
    const closeMenu = () => setContextMenu(null);
    const handleExampleSaved = (e: Event) => {
      const { col, req } = (e as CustomEvent).detail;
      setExpandedReqs(p => ({ ...p, [`${col}/${req}`]: true }));
    };
    const handleImportSuccess = (e: Event) => setImportSuccess((e as CustomEvent).detail);
    document.addEventListener('click', closeMenu);
    window.addEventListener('reqly-reload', loadData);
    window.addEventListener('reqly-example-saved', handleExampleSaved);
    window.addEventListener('reqly-import-success', handleImportSuccess);
    return () => {
      document.removeEventListener('click', closeMenu);
      window.removeEventListener('reqly-reload', loadData);
      window.removeEventListener('reqly-example-saved', handleExampleSaved);
      window.removeEventListener('reqly-import-success', handleImportSuccess);
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

  const handleDeleteExample = async (col: string, req: string, exampleId: string) => {
    await deleteExample(col, req, exampleId);
    loadData();
  };

  const handleDuplicateReq = async (col: string, req: string) => {
    await duplicateRequest(col, req, `${req} Copy`);
    loadData();
  };

  const handleMoveReq = async (col: string, req: string, targetCollection: string) => {
    if (col === targetCollection) return;
    try {
      const result = await moveRequest(col, req, targetCollection);
      const updated = await fetchCollections();
      setCollections(updated);
      const targetCol = updated.find((c: any) => c.name === result.collection);
      const movedReq = targetCol?.requests.find((r: any) => r.name === result.name);
      if (movedReq) onSelectRequest(movedReq, result.collection);
    } catch (e) {
      console.error(e);
      alert('Failed to move request');
    }
  };

  const handleDeleteCol = async (col: string) => {
    await deleteCollection(col);
    loadData();
  };

  const handleDuplicateCol = async (col: string) => {
    await duplicateCollection(col);
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

      {/* Active project path - click to switch project */}
      {projectPath && <ProjectPathWidget projectPath={projectPath} lastMcpActivityAt={lastMcpActivityAt} onSwitch={setProjectPath} />}

      {/* Environments section - above collections */}
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

      {/* Sidebar search */}
      {collections.length > 0 && (
        <div className="flex items-center gap-1.5 px-2 rounded shrink-0" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', height: '28px' }}>
          <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search requests..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-xs"
            style={{ color: 'var(--text-secondary)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: 'var(--text-muted)' }} className="text-xs">×</button>
          )}
        </div>
      )}

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

        {/* Search results */}
        {search.trim() && (() => {
          const q = search.toLowerCase();
          const matches = collections.flatMap(col =>
            col.requests
              .filter((r: any) => r.name?.toLowerCase().includes(q) || r.url?.toLowerCase().includes(q))
              .map((r: any) => ({ req: r, col: col.name }))
          );
          if (matches.length === 0) return (
            <p className="text-xs italic px-1 py-2" style={{ color: 'var(--text-muted)' }}>No results for "{search}"</p>
          );
          return matches.map(({ req, col }) => (
            <div
              key={`${col}-${req.name}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors"
              style={{ background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onClick={() => { onSelectRequest(req, col); setSearch(''); }}
            >
              <span className={`${METHOD_BADGE_BASE} ${methodBadgeClass(req.method)} shrink-0`}>{req.method}</span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{req.name}</span>
                <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{col}</span>
              </div>
            </div>
          ));
        })()}

        {/* Normal tree view (hidden when searching) */}
        {!search.trim() && collections.length === 0 && !creatingCol && (
          <SidebarEmptyHint />
        )}

        {!search.trim() && collections.map(col => {
          const isExpanded = expandedCols[col.name] !== false;
          return (
            <div key={col.name} className="select-none">
              <div
                className="flex items-center justify-between group rounded px-1.5 py-1 cursor-pointer transition-colors"
                style={{
                  background: dragOverCol === col.name ? 'rgba(37,99,235,0.18)' : 'transparent',
                  border: dragOverCol === col.name ? '1px solid #3b82f6' : '1px solid transparent',
                }}
                onMouseEnter={e => { if (dragOverCol !== col.name) e.currentTarget.style.background = 'var(--surface-3)'; }}
                onMouseLeave={e => { if (dragOverCol !== col.name) e.currentTarget.style.background = 'transparent'; }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.pageX, y: e.pageY, type: 'col', col: col.name });
                }}
                onDragOver={e => {
                  if (!draggedReq || draggedReq.col === col.name) return;
                  e.preventDefault();
                  setDragOverCol(col.name);
                }}
                onDragLeave={() => setDragOverCol(prev => (prev === col.name ? null : prev))}
                onDrop={e => {
                  e.preventDefault();
                  setDragOverCol(null);
                  const raw = e.dataTransfer.getData('application/json');
                  if (!raw) return;
                  const source = JSON.parse(raw);
                  if (source.col === col.name) return;
                  handleMoveReq(source.col, source.req, col.name);
                  setDraggedReq(null);
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
                <div className="flex items-center gap-0.5">
                  <button
                    className="px-1.5 flex items-center transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    title="Add Request"
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    onClick={(e) => { e.stopPropagation(); setAddingReqTo(col.name); setExpandedCols(p => ({ ...p, [col.name]: true })); }}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    className="px-1.5 flex items-center transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    title="Run Collection"
                    onMouseEnter={e => (e.currentTarget.style.color = '#60a5fa')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    onClick={(e) => { e.stopPropagation(); onRunCollection(col.name); }}
                  >
                    <Play size={14} />
                  </button>
                  <button
                    className="px-1.5 flex items-center transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    title="Export Collection"
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    onClick={(e) => { e.stopPropagation(); exportCollection(col.name, 'postman').catch(console.error); }}
                  >
                    <Download size={13} />
                  </button>
                  <button
                    className="px-1.5 flex items-center transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    title="Collection Settings (variables, auth)"
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    onClick={(e) => { e.stopPropagation(); setSettingsFor(col.name); }}
                  >
                    <Settings size={13} />
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
                    const isActive = activeRequest?.name === req.name && activeRequest?._collection === col.name && !activeRequest?._isExample;
                    const isRenaming = renaming?.col === col.name && renaming?.req === req.name;
                    const reqKey = `${col.name}/${req.name}`;
                    const hasExamples = req.examples && req.examples.length > 0;
                    const reqExpanded = expandedReqs[reqKey];
                    return (
                      <li key={req.name}>
                        <div
                          className="text-sm cursor-pointer py-1 pl-2 pr-1 rounded flex items-center gap-2 group transition-colors"
                          style={{ background: isActive ? 'var(--surface-3)' : 'transparent', color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-3)'; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                          onClick={() => !isRenaming && onSelectRequest(req, col.name)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.pageX, y: e.pageY, type: 'req', col: col.name, req: req.name });
                          }}
                          draggable={!isRenaming}
                          onDragStart={e => {
                            const payload = { col: col.name, req: req.name };
                            e.dataTransfer.setData('application/json', JSON.stringify(payload));
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggedReq(payload);
                          }}
                          onDragEnd={() => { setDraggedReq(null); setDragOverCol(null); }}
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
                            <span className="truncate flex-1">{req.name}</span>
                          )}
                          {hasExamples && !isRenaming && (
                            <button
                              className="shrink-0 flex items-center transition-transform"
                              style={{ color: 'var(--text-muted)', transform: reqExpanded ? 'rotate(90deg)' : 'none' }}
                              title={reqExpanded ? 'Hide examples' : `${req.examples.length} example${req.examples.length > 1 ? 's' : ''}`}
                              onClick={e => { e.stopPropagation(); setExpandedReqs(p => ({ ...p, [reqKey]: !reqExpanded })); }}
                            >
                              <ChevronRight size={12} />
                            </button>
                          )}
                        </div>

                        {/* Examples sub-list */}
                        {hasExamples && reqExpanded && (
                          <ul className="pl-4 ml-1 mt-0.5 space-y-0.5 mb-1" style={{ borderLeft: '1px dashed var(--border)' }}>
                            {req.examples.map((ex: any) => {
                              const isExActive = activeRequest?._isExample && activeRequest?._exampleId === ex.id && activeRequest?._collection === col.name;
                              const statusColor = ex.status >= 500 ? '#ef4444' : ex.status >= 400 ? '#f59e0b' : ex.status >= 300 ? '#3b82f6' : '#22c55e';
                              return (
                                <li
                                  key={ex.id}
                                  className="flex items-center gap-1.5 py-1 pl-2 pr-1 rounded cursor-pointer group transition-colors text-xs"
                                  style={{ background: isExActive ? 'var(--surface-3)' : 'transparent', color: isExActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                                  onMouseEnter={e => { if (!isExActive) e.currentTarget.style.background = 'var(--surface-3)'; }}
                                  onMouseLeave={e => { if (!isExActive) e.currentTarget.style.background = 'transparent'; }}
                                  onClick={() => onSelectRequest({
                                    ...req,
                                    _isExample: true,
                                    _exampleId: ex.id,
                                    _exampleResponse: { status: ex.status, body: ex.body, headers: ex.headers, latency: ex.latency },
                                  }, col.name)}
                                  onContextMenu={e => {
                                    e.preventDefault();
                                    setContextMenu({ x: e.pageX, y: e.pageY, type: 'example', col: col.name, req: req.name, exampleId: ex.id });
                                  }}
                                >
                                  <BookMarked size={11} className="shrink-0" style={{ color: '#a78bfa' }} />
                                  <span className="truncate flex-1">{ex.name}</span>
                                  <span className="shrink-0 font-mono text-[10px] font-semibold" style={{ color: statusColor }}>{ex.status}</span>
                                  <button
                                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-red-400"
                                    style={{ color: 'var(--text-muted)' }}
                                    title="Delete example"
                                    onClick={e => { e.stopPropagation(); handleDeleteExample(col.name, req.name, ex.id); }}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
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
                className="w-full text-left px-4 py-1.5 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { setSettingsFor(contextMenu.col); setContextMenu(null); }}
              >
                Settings
              </button>
              <button
                className="w-full text-left px-4 py-1.5 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { exportCollection(contextMenu.col, 'postman').catch(console.error); setContextMenu(null); }}
              >
                Export as Postman
              </button>
              <button
                className="w-full text-left px-4 py-1.5 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { exportCollection(contextMenu.col, 'openapi').catch(console.error); setContextMenu(null); }}
              >
                Export as OpenAPI
              </button>
              <button
                className="w-full text-left px-4 py-1.5 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { handleDuplicateCol(contextMenu.col); setContextMenu(null); }}
              >
                Duplicate
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
          ) : contextMenu.type === 'example' ? (
            <>
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Example</div>
              <button
                className="w-full text-left px-4 py-1.5 text-red-400 hover:text-red-300 transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { handleDeleteExample(contextMenu.col, contextMenu.req, contextMenu.exampleId); setContextMenu(null); }}
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
                className="w-full text-left px-4 py-1.5 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { setMoveModal({ col: contextMenu.col, req: contextMenu.req }); setContextMenu(null); }}
              >
                Move to...
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

      {importSuccess && importSuccess.format === 'bruno' ? (
        <Modal title="Bruno Script Migration" onClose={() => setImportSuccess(null)} width="w-[500px]">
          <div className="p-2 space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Reqly natively supports Bruno scripts. Here is how your <code>bru.*</code> and <code>res.*</code> aliases map to Reqly's engine:
            </p>
            <table className="w-full text-sm text-left">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="pb-2 font-medium">Bruno</th>
                  <th className="pb-2 font-medium">Reqly equivalent</th>
                </tr>
              </thead>
              <tbody style={{ color: 'var(--text-secondary)' }}>
                <tr><td className="py-1 border-b border-[var(--border)]"><code className="bg-[var(--surface-3)] px-1 rounded">res.getStatus()</code></td><td className="py-1 border-b border-[var(--border)]">Supported natively</td></tr>
                <tr><td className="py-1 border-b border-[var(--border)]"><code className="bg-[var(--surface-3)] px-1 rounded">res.getBody()</code></td><td className="py-1 border-b border-[var(--border)]">Supported natively</td></tr>
                <tr><td className="py-1 border-b border-[var(--border)]"><code className="bg-[var(--surface-3)] px-1 rounded">res.getHeader(name)</code></td><td className="py-1 border-b border-[var(--border)]">Supported natively</td></tr>
                <tr><td className="py-1 border-b border-[var(--border)]"><code className="bg-[var(--surface-3)] px-1 rounded">res.getResponseTime()</code></td><td className="py-1 border-b border-[var(--border)]">Supported natively</td></tr>
                <tr><td className="py-1 border-b border-[var(--border)]"><code className="bg-[var(--surface-3)] px-1 rounded">bru.setEnvVar(k, v)</code></td><td className="py-1 border-b border-[var(--border)]"><code className="bg-[var(--surface-3)] px-1 rounded">reqly.setEnvVar(k, v)</code></td></tr>
                <tr><td className="py-1"><code className="bg-[var(--surface-3)] px-1 rounded">bru.getEnvVar(k)</code></td><td className="py-1"><code className="bg-[var(--surface-3)] px-1 rounded">reqly.getEnvVar(k)</code></td></tr>
              </tbody>
            </table>
          </div>
          <ModalFooter>
            <Button variant="primary" onClick={() => setImportSuccess(null)}>Got it</Button>
          </ModalFooter>
        </Modal>
      ) : importSuccess && (
        <SuccessToast
          message="Collection imported!"
          sub={importSuccess.name}
          onDone={() => setImportSuccess(null)}
        />
      )}

      {settingsFor && (
        <CollectionSettingsModal collectionName={settingsFor} onClose={() => setSettingsFor(null)} />
      )}

      {moveModal && (
        <Modal title="Move to collection" onClose={() => { setMoveModal(null); setMoveTarget(null); }} width="w-[360px]">
          <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
            {collections.filter(c => c.name !== moveModal.col).length === 0 && (
              <p className="text-xs italic px-1" style={{ color: 'var(--text-muted)' }}>No other collections to move to.</p>
            )}
            {collections.filter(c => c.name !== moveModal.col).map(c => (
              <div
                key={c.name}
                onClick={() => setMoveTarget(c.name)}
                className="text-sm px-2 py-1.5 rounded cursor-pointer transition-colors"
                style={{
                  background: moveTarget === c.name ? 'var(--surface-3)' : 'transparent',
                  color: moveTarget === c.name ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
                onMouseEnter={e => { if (moveTarget !== c.name) e.currentTarget.style.background = 'var(--surface-3)'; }}
                onMouseLeave={e => { if (moveTarget !== c.name) e.currentTarget.style.background = 'transparent'; }}
              >
                {c.name}
              </div>
            ))}
          </div>
          <ModalFooter>
            <Button variant="ghost" onClick={() => { setMoveModal(null); setMoveTarget(null); }}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!moveTarget}
              onClick={async () => {
                if (!moveTarget) return;
                await handleMoveReq(moveModal.col, moveModal.req, moveTarget);
                setMoveModal(null);
                setMoveTarget(null);
              }}
            >
              Move
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
