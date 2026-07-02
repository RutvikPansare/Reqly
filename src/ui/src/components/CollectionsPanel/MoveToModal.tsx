import { useState } from 'react';
import { Modal, ModalFooter } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';

interface MoveToModalProps {
  collections: any[];
  source: { col: string; req: string };
  onMove: (targetCollection: string) => Promise<void>;
  onClose: () => void;
}

export function MoveToModal({ collections, source, onMove, onClose }: MoveToModalProps) {
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const candidates = collections.filter(c => c.name !== source.col);

  return (
    <Modal title="Move to collection" onClose={onClose} width="w-[360px]">
      <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
        {candidates.length === 0 && (
          <p className="text-xs italic px-1" style={{ color: 'var(--text-muted)' }}>No other collections to move to.</p>
        )}
        {candidates.map(c => (
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
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!moveTarget}
          onClick={async () => {
            if (!moveTarget) return;
            await onMove(moveTarget);
            onClose();
          }}
        >
          Move
        </Button>
      </ModalFooter>
    </Modal>
  );
}
