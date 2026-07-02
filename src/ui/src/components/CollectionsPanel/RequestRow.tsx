import { BookMarked, Trash2, ChevronRight } from 'lucide-react';
import { requestBadgeInfo } from '../../lib/colors.js';

interface RequestRowProps {
  req: any;
  colName: string;
  activeRequest: any;
  renaming: { col: string; req: string } | null;
  renameValue: string;
  expandedReqs: Record<string, boolean>;
  onSelect: (req: any, colName: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onToggleExamples: (reqKey: string) => void;
  onDeleteExample: (col: string, req: string, exampleId: string) => void;
  onSelectExample: (req: any, col: string) => void;
  onExampleContextMenu: (e: React.MouseEvent, exampleId: string) => void;
}

export function RequestRow({
  req, colName, activeRequest, renaming, renameValue, expandedReqs,
  onSelect, onContextMenu, onDragStart, onDragEnd,
  onRenameChange, onRenameCommit, onRenameCancel,
  onToggleExamples, onDeleteExample, onSelectExample, onExampleContextMenu,
}: RequestRowProps) {
  const isActive = activeRequest?.name === req.name && activeRequest?._collection === colName && !activeRequest?._isExample;
  const isRenaming = renaming?.col === colName && renaming?.req === req.name;
  const reqKey = `${colName}/${req.name}`;
  const hasExamples = req.examples && req.examples.length > 0;
  const reqExpanded = expandedReqs[reqKey];
  const badge = requestBadgeInfo(req.type, req.method);

  return (
    <li key={req.name}>
      <div
        className="text-sm cursor-pointer py-1 pl-2 pr-1 rounded flex items-center gap-2 group transition-colors"
        style={{ background: isActive ? 'var(--surface-3)' : 'transparent', color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-3)'; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
        onClick={() => !isRenaming && onSelect(req, colName)}
        onContextMenu={onContextMenu}
        draggable={!isRenaming}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <span className={badge.className} style={badge.style}>{badge.label}</span>
        {isRenaming ? (
          <input
            autoFocus
            className="input flex-1 text-sm py-0"
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onRenameCommit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            onBlur={onRenameCommit}
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
            onClick={e => { e.stopPropagation(); onToggleExamples(reqKey); }}
          >
            <ChevronRight size={12} />
          </button>
        )}
      </div>

      {hasExamples && reqExpanded && (
        <ul className="pl-4 ml-1 mt-0.5 space-y-0.5 mb-1" style={{ borderLeft: '1px dashed var(--border)' }}>
          {req.examples.map((ex: any) => {
            const isExActive = activeRequest?._isExample && activeRequest?._exampleId === ex.id && activeRequest?._collection === colName;
            const statusColor = ex.status >= 500 ? '#ef4444' : ex.status >= 400 ? '#f59e0b' : ex.status >= 300 ? '#3b82f6' : '#22c55e';
            return (
              <li
                key={ex.id}
                className="flex items-center gap-1.5 py-1 pl-2 pr-1 rounded cursor-pointer group transition-colors text-xs"
                style={{ background: isExActive ? 'var(--surface-3)' : 'transparent', color: isExActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                onMouseEnter={e => { if (!isExActive) e.currentTarget.style.background = 'var(--surface-3)'; }}
                onMouseLeave={e => { if (!isExActive) e.currentTarget.style.background = 'transparent'; }}
                onClick={() => onSelectExample({
                  ...req,
                  _isExample: true,
                  _exampleId: ex.id,
                  _exampleResponse: { status: ex.status, body: ex.body, headers: ex.headers, latency: ex.latency },
                }, colName)}
                onContextMenu={e => { e.preventDefault(); onExampleContextMenu(e, ex.id); }}
              >
                <BookMarked size={11} className="shrink-0" style={{ color: '#a78bfa' }} />
                <span className="truncate flex-1">{ex.name}</span>
                <span className="shrink-0 font-mono text-[10px] font-semibold" style={{ color: statusColor }}>{ex.status}</span>
                <button
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-red-400"
                  style={{ color: 'var(--text-muted)' }}
                  title="Delete example"
                  onClick={e => { e.stopPropagation(); onDeleteExample(colName, req.name, ex.id); }}
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
}
