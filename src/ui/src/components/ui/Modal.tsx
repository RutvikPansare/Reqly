import React from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  icon?: React.ReactNode;
}

export function Modal({ title, onClose, children, width = 'w-[480px]', icon }: ModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card ${width} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-base font-semibold text-white">{title}</h2>
          </div>
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
