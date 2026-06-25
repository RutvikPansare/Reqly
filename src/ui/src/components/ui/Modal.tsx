interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}

export function Modal({ title, onClose, children, width = 'w-[480px]' }: ModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card ${width} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="btn btn-ghost w-7 h-7 p-0 flex items-center justify-center text-lg leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface ModalFooterProps {
  children: React.ReactNode;
}
export function ModalFooter({ children }: ModalFooterProps) {
  return (
    <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[var(--border)]">
      {children}
    </div>
  );
}
