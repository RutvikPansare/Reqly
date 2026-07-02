import { exportCollection } from '../../api.js';
import type { ContextMenuState, MoveModalState } from './types.js';

interface ContextMenuProps {
  contextMenu: ContextMenuState;
  onClose: () => void;
  onStartRenameCol: (col: string) => void;
  onStartRenameReq: (col: string, req: string) => void;
  onDeleteCol: (col: string) => void;
  onDuplicateCol: (col: string) => void;
  onDeleteReq: (col: string, req: string) => void;
  onDuplicateReq: (col: string, req: string) => void;
  onDeleteExample: (col: string, req: string, exampleId: string) => void;
  onSetSettingsFor: (col: string) => void;
  onSetAddingReqTo: (col: string | null, expand?: boolean) => void;
  onSetMoveModal: (m: MoveModalState) => void;
}

function MenuBtn({ onClick, danger = false, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      className={`w-full text-left px-4 py-1.5 transition-colors ${danger ? 'text-red-400 hover:text-red-300' : ''}`}
      style={danger ? {} : { color: 'var(--text-secondary)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ContextMenu({
  contextMenu, onClose,
  onStartRenameCol, onStartRenameReq,
  onDeleteCol, onDuplicateCol,
  onDeleteReq, onDuplicateReq, onDeleteExample,
  onSetSettingsFor, onSetAddingReqTo, onSetMoveModal,
}: ContextMenuProps) {
  if (!contextMenu) return null;

  return (
    <div
      className="fixed rounded py-1 z-50 text-sm min-w-[130px]"
      style={{
        top: contextMenu.y,
        left: contextMenu.x,
        background: 'var(--surface-2)',
        border: '1px solid var(--border-strong)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {contextMenu.type === 'col' ? (
        <>
          <MenuBtn onClick={() => { onSetAddingReqTo(contextMenu.col, true); onClose(); }}>Add Request</MenuBtn>
          <MenuBtn onClick={() => { onStartRenameCol(contextMenu.col); onClose(); }}>Rename</MenuBtn>
          <MenuBtn onClick={() => { onSetSettingsFor(contextMenu.col); onClose(); }}>Settings</MenuBtn>
          <MenuBtn onClick={() => { exportCollection(contextMenu.col, 'postman').catch(console.error); onClose(); }}>Export as Postman</MenuBtn>
          <MenuBtn onClick={() => { exportCollection(contextMenu.col, 'openapi').catch(console.error); onClose(); }}>Export as OpenAPI</MenuBtn>
          <MenuBtn onClick={() => { onDuplicateCol(contextMenu.col); onClose(); }}>Duplicate</MenuBtn>
          <MenuBtn danger onClick={() => { onDeleteCol(contextMenu.col); onClose(); }}>Delete</MenuBtn>
        </>
      ) : contextMenu.type === 'example' ? (
        <>
          <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Example</div>
          <MenuBtn danger onClick={() => { onDeleteExample(contextMenu.col, contextMenu.req, contextMenu.exampleId); onClose(); }}>Delete</MenuBtn>
        </>
      ) : (
        <>
          <MenuBtn onClick={() => { onStartRenameReq(contextMenu.col, contextMenu.req); onClose(); }}>Rename</MenuBtn>
          <MenuBtn onClick={() => { onDuplicateReq(contextMenu.col, contextMenu.req); onClose(); }}>Duplicate</MenuBtn>
          <MenuBtn onClick={() => { onSetMoveModal({ col: contextMenu.col, req: contextMenu.req }); onClose(); }}>Move to...</MenuBtn>
          <MenuBtn danger onClick={() => { onDeleteReq(contextMenu.col, contextMenu.req); onClose(); }}>Delete</MenuBtn>
        </>
      )}
    </div>
  );
}
