import { ChevronRight, Plus, Play, Download, Settings } from 'lucide-react';
import { exportCollection } from '../../api.js';
import { RequestRow } from './RequestRow.js';
import type { ContextMenuState } from './types.js';

interface CollectionRowProps {
  col: any;
  activeRequest: any;
  isExpanded: boolean;
  typeFilter?: string[];
  renamingCol: string | null;
  colRenameValue: string;
  addingReqTo: string | null;
  newReqName: string;
  dragOverCol: string | null;
  renaming: { col: string; req: string } | null;
  renameValue: string;
  expandedReqs: Record<string, boolean>;
  onToggleExpand: () => void;
  onColRenameChange: (v: string) => void;
  onColRenameCommit: () => void;
  onColRenameCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onAddReq: (colName: string) => void;
  onNewReqNameChange: (v: string) => void;
  onNewReqKeyDown: (e: React.KeyboardEvent, colName: string) => void;
  onRunCollection: (name: string) => void;
  onSetSettingsFor: (col: string) => void;
  onSetAddingReqTo: (col: string | null, expand?: boolean) => void;
  onSelectRequest: (req: any, col: string) => void;
  onSelectExample: (req: any, col: string) => void;
  onSetContextMenu: (menu: ContextMenuState) => void;
  onSetDraggedReq: (d: { col: string; req: string } | null) => void;
  onSetDragOverCol: (col: string | null) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onToggleReqExamples: (reqKey: string) => void;
  onDeleteExample: (col: string, req: string, exampleId: string) => void;
}

export function CollectionRow({
  col, activeRequest, isExpanded, typeFilter,
  renamingCol, colRenameValue, addingReqTo, newReqName,
  dragOverCol, renaming, renameValue, expandedReqs,
  onToggleExpand, onColRenameChange, onColRenameCommit, onColRenameCancel,
  onContextMenu, onDragOver, onDragLeave, onDrop,
  onAddReq, onNewReqNameChange, onNewReqKeyDown, onRunCollection,
  onSetSettingsFor, onSetAddingReqTo, onSelectRequest, onSelectExample,
  onSetContextMenu, onSetDraggedReq, onSetDragOverCol,
  onRenameChange, onRenameCommit, onRenameCancel,
  onToggleReqExamples, onDeleteExample,
}: CollectionRowProps) {
  const visibleRequests = typeFilter
    ? col.requests.filter((r: any) => typeFilter.includes(r.type))
    : col.requests;

  return (
    <div
      className="select-none"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className="flex items-center justify-between group rounded px-1.5 py-1 cursor-pointer transition-colors"
        style={{
          background: dragOverCol === col.name ? 'rgba(37,99,235,0.18)' : 'transparent',
          border: dragOverCol === col.name ? '1px solid #3b82f6' : '1px solid transparent',
        }}
        onMouseEnter={e => { if (dragOverCol !== col.name) e.currentTarget.style.background = 'var(--surface-3)'; }}
        onMouseLeave={e => { if (dragOverCol !== col.name) e.currentTarget.style.background = 'transparent'; }}
        onContextMenu={onContextMenu}
      >
        <div
          className="flex items-center gap-1 flex-1 overflow-hidden"
          onClick={onToggleExpand}
        >
          <span className="flex items-center transition-transform" style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
            <ChevronRight size={14} />
          </span>
          {renamingCol === col.name ? (
            <input
              autoFocus
              className="input flex-1 text-sm py-0"
              value={colRenameValue}
              onChange={e => onColRenameChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onColRenameCommit();
                if (e.key === 'Escape') onColRenameCancel();
              }}
              onBlur={onColRenameCommit}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{col.name}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {!typeFilter && (
            <button
              className="px-1.5 flex items-center transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Add Request"
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              onClick={e => { e.stopPropagation(); onSetAddingReqTo(col.name, true); }}
            >
              <Plus size={14} />
            </button>
          )}
          {!typeFilter && (
            <button
              className="px-1.5 flex items-center transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Run Collection"
              onMouseEnter={e => (e.currentTarget.style.color = '#60a5fa')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              onClick={e => { e.stopPropagation(); onRunCollection(col.name); }}
            >
              <Play size={14} />
            </button>
          )}
          <button
            className="px-1.5 flex items-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Export Collection"
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            onClick={e => { e.stopPropagation(); exportCollection(col.name, 'postman').catch(console.error); }}
          >
            <Download size={13} />
          </button>
          <button
            className="px-1.5 flex items-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Collection Settings (variables, auth)"
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            onClick={e => { e.stopPropagation(); onSetSettingsFor(col.name); }}
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <ul className="pl-4 ml-1.5 space-y-0.5 mt-0.5 mb-1" style={{ borderLeft: '1px solid var(--border)' }}>
          {!typeFilter && addingReqTo === col.name && (
            <li className="py-1 pl-2">
              <input
                autoFocus
                className="input w-full text-sm py-0.5"
                placeholder="Request name..."
                value={newReqName}
                onChange={e => onNewReqNameChange(e.target.value)}
                onKeyDown={e => onNewReqKeyDown(e, col.name)}
                onBlur={() => onSetAddingReqTo(null)}
              />
            </li>
          )}
          {visibleRequests.map((req: any) => (
            <RequestRow
              key={req.name}
              req={req}
              colName={col.name}
              activeRequest={activeRequest}
              renaming={renaming}
              renameValue={renameValue}
              expandedReqs={expandedReqs}
              onSelect={onSelectRequest}
              onContextMenu={e => { e.preventDefault(); onSetContextMenu({ x: e.pageX, y: e.pageY, type: 'req', col: col.name, req: req.name }); }}
              onDragStart={e => {
                const payload = { col: col.name, req: req.name };
                e.dataTransfer.setData('application/json', JSON.stringify(payload));
                e.dataTransfer.effectAllowed = 'move';
                onSetDraggedReq(payload);
              }}
              onDragEnd={() => { onSetDraggedReq(null); onSetDragOverCol(null); }}
              onRenameChange={onRenameChange}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onToggleExamples={onToggleReqExamples}
              onDeleteExample={onDeleteExample}
              onSelectExample={onSelectExample}
              onExampleContextMenu={(e, exampleId) => {
                e.preventDefault();
                onSetContextMenu({ x: e.pageX, y: e.pageY, type: 'example', col: col.name, req: req.name, exampleId });
              }}
            />
          ))}
          {visibleRequests.length === 0 && !addingReqTo && (
            <li className="text-xs text-gray-600 italic py-1 pl-2">No requests</li>
          )}
        </ul>
      )}
    </div>
  );
}
