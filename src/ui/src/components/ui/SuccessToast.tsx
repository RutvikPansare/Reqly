import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  sub?: string;
  duration?: number;
  onDone: () => void;
}

export function SuccessToast({ message, sub, duration = 2200, onDone }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const show = requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300); // wait for fade-out
    }, duration);
    return () => { cancelAnimationFrame(show); clearTimeout(timer); };
  }, [duration, onDone]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[200] pointer-events-none"
    >
      <div
        className="flex flex-col items-center gap-3 px-8 py-6 pointer-events-auto"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid rgba(74,222,128,0.3)',
          borderRadius: '8px',
          minWidth: '260px',
          maxWidth: '340px',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.97)',
          transition: 'opacity 0.25s ease, transform 0.25s ease',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(74,222,128,0.12)' }}
        >
          <CheckCircle size={24} style={{ color: '#4ade80' }} />
        </div>
        <div className="text-center">
          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{message}</p>
          {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
        </div>
      </div>
    </div>
  );
}
