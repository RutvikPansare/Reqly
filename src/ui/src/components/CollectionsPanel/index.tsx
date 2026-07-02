import { useState } from 'react';
import { Search } from 'lucide-react';
import { SidebarEnvSection } from '../SidebarEnvSection.js';
import { SuccessToast } from '../ui/SuccessToast.js';
import { CollectionSettingsModal } from '../CollectionSettingsModal.js';

import type { CollectionsPanelProps } from './types.js';
import { useCollectionState } from './useCollectionState.js';
import { SidebarEmptyHint } from './SidebarEmptyHint.js';
import { ProjectPathWidget, formatProjectPath } from './ProjectPathWidget.js';
import { SearchResults } from './SearchResults.js';
import { CollectionRow } from './CollectionRow.js';
import { ContextMenu } from './ContextMenu.js';
import { BrunoMigrationModal } from './BrunoMigrationModal.js';
import { MoveToModal } from './MoveToModal.js';

export function CollectionsPanel({ activeRequest, onSelectRequest, onRunCollection, typeFilter, defaultRequestType }: CollectionsPanelProps) {
  const [search, setSearch] = useState('');
  const s = useCollectionState(onSelectRequest, defaultRequestType);

  const visibleCollections = typeFilter
    ? s.collections.filter(col => col.requests.some((r: any) => typeFilter.includes(r.type)))
    : s.collections;

  const grouped = visibleCollections.reduce<Record<string, any[]>>((acc, col) => {
    const p = col.projectDir || s.projectPath;
    if (!acc[p]) acc[p] = [];
    acc[p].push(col);
    return acc;
  }, {});

  return (
    <div className="p-3 flex flex-col gap-3 relative min-h-full">
      {s.projectPath && <ProjectPathWidget projectPath={s.projectPath} onSwitch={s.setProjectPath} />}

      <div className="-mx-3 -mt-1" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <SidebarEnvSection />
      </div>

      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Collections</h2>
        {!typeFilter && (
          <button
            onClick={() => s.setCreatingCol(true)}
            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded transition-colors"
            title="New collection"
          >
            + New
          </button>
        )}
      </div>

      {s.collections.length > 0 && (
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
          {search && <button onClick={() => setSearch('')} style={{ color: 'var(--text-muted)' }} className="text-xs">x</button>}
        </div>
      )}

      <div className="space-y-1">
        {s.creatingCol && (
          <input
            autoFocus
            className="input w-full mb-2 text-sm"
            placeholder="Collection name..."
            value={s.newColName}
            onChange={e => s.setNewColName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') s.handleCreateCol();
              if (e.key === 'Escape') s.setCreatingCol(false);
            }}
            onBlur={() => s.setCreatingCol(false)}
          />
        )}

        {search.trim() && (
          <SearchResults
            search={search}
            collections={s.collections}
            typeFilter={typeFilter}
            onSelectRequest={onSelectRequest}
            onClearSearch={() => setSearch('')}
          />
        )}

        {!search.trim() && visibleCollections.length === 0 && !s.creatingCol && <SidebarEmptyHint />}

        {!search.trim() && Object.entries(grouped).map(([pPath, cols]) => {
          const pInfo = formatProjectPath(pPath);
          return (
            <div key={pPath} className="mb-4 last:mb-0">
              <div className="text-xs font-semibold px-2 py-1 mb-1 sticky top-0 bg-transparent" style={{ color: 'var(--text-primary)', zIndex: 10 }}>
                <span
                  className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                  title={pPath}
                  onClick={() => s.setProjectPath(pPath)}
                >
                  {pInfo.name}
                </span>
              </div>
              {(cols as any[]).map(col => (
                <CollectionRow
                  key={col.name}
                  col={col}
                  activeRequest={activeRequest}
                  isExpanded={s.expandedCols[col.name] !== false}
                  typeFilter={typeFilter}
                  renamingCol={s.renamingCol}
                  colRenameValue={s.colRenameValue}
                  addingReqTo={s.addingReqTo}
                  newReqName={s.newReqName}
                  dragOverCol={s.dragOverCol}
                  renaming={s.renaming}
                  renameValue={s.renameValue}
                  expandedReqs={s.expandedReqs}
                  onToggleExpand={() => s.setExpandedCols(prev => ({ ...prev, [col.name]: !(s.expandedCols[col.name] !== false) }))}
                  onColRenameChange={s.setColRenameValue}
                  onColRenameCommit={s.commitRenameCol}
                  onColRenameCancel={() => { s.setRenamingCol(null); s.setColRenameValue(''); }}
                  onContextMenu={e => { e.preventDefault(); s.setContextMenu({ x: e.pageX, y: e.pageY, type: 'col', col: col.name }); }}
                  onDragOver={e => { if (s.draggedReq?.col === col.name) return; e.preventDefault(); s.setDragOverCol(col.name); }}
                  onDragLeave={() => s.setDragOverCol(prev => prev === col.name ? null : prev)}
                  onDrop={e => {
                    e.preventDefault();
                    s.setDragOverCol(null);
                    const raw = e.dataTransfer.getData('application/json');
                    if (!raw) return;
                    const source = JSON.parse(raw);
                    if (source.col === col.name) return;
                    s.handleMoveReq(source.col, source.req, col.name);
                    s.setDraggedReq(null);
                  }}
                  onAddReq={s.handleAddReq}
                  onNewReqNameChange={s.setNewReqName}
                  onNewReqKeyDown={(e, colName) => {
                    if (e.key === 'Enter') s.handleAddReq(colName);
                    if (e.key === 'Escape') s.handleSetAddingReqTo(null);
                  }}
                  onRunCollection={onRunCollection}
                  onSetSettingsFor={s.setSettingsFor}
                  onSetAddingReqTo={s.handleSetAddingReqTo}
                  onSelectRequest={onSelectRequest}
                  onSelectExample={onSelectRequest}
                  onSetContextMenu={s.setContextMenu}
                  onSetDraggedReq={s.setDraggedReq}
                  onSetDragOverCol={s.setDragOverCol}
                  onRenameChange={s.setRenameValue}
                  onRenameCommit={s.commitRename}
                  onRenameCancel={() => { s.setRenaming(null); s.setRenameValue(''); }}
                  onToggleReqExamples={reqKey => s.setExpandedReqs(p => ({ ...p, [reqKey]: !p[reqKey] }))}
                  onDeleteExample={s.handleDeleteExample}
                />
              ))}
            </div>
          );
        })}
      </div>

      <ContextMenu
        contextMenu={s.contextMenu}
        onClose={() => s.setContextMenu(null)}
        onStartRenameCol={s.startRenameCol}
        onStartRenameReq={s.startRename}
        onDeleteCol={s.handleDeleteCol}
        onDuplicateCol={s.handleDuplicateCol}
        onDeleteReq={s.handleDeleteReq}
        onDuplicateReq={s.handleDuplicateReq}
        onDeleteExample={s.handleDeleteExample}
        onSetSettingsFor={s.setSettingsFor}
        onSetAddingReqTo={s.handleSetAddingReqTo}
        onSetMoveModal={s.setMoveModal}
      />

      {s.importSuccess?.format === 'bruno' ? (
        <BrunoMigrationModal onClose={() => s.setImportSuccess(null)} />
      ) : s.importSuccess ? (
        <SuccessToast message="Collection imported!" sub={s.importSuccess.name} onDone={() => s.setImportSuccess(null)} />
      ) : null}

      {s.settingsFor && <CollectionSettingsModal collectionName={s.settingsFor} onClose={() => s.setSettingsFor(null)} />}

      {s.moveModal && (
        <MoveToModal
          collections={s.collections}
          source={s.moveModal}
          onMove={target => s.handleMoveReq(s.moveModal!.col, s.moveModal!.req, target)}
          onClose={() => s.setMoveModal(null)}
        />
      )}
    </div>
  );
}
