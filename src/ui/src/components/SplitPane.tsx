import { useRef, useState, useCallback } from 'react';

interface SplitPaneProps {
  top: React.ReactNode;
  bottom: React.ReactNode;
  defaultSplit?: number; // 0-100, initial percentage for top pane
  minTop?: number;
  minBottom?: number;
}

export function SplitPane({ top, bottom, defaultSplit = 50, minTop = 15, minBottom = 15 }: SplitPaneProps) {
  const [split, setSplit] = useState(defaultSplit);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setSplit(Math.min(100 - minBottom, Math.max(minTop, pct)));
    };

    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [minTop, minBottom]);

  return (
    <div ref={containerRef} className="flex flex-col h-full select-none">
      {/* Top pane */}
      <div style={{ flex: `${split} 1 0` }} className="min-h-0 overflow-hidden flex flex-col">
        {top}
      </div>

      {/* Drag handle - full-width divider with centered pill */}
      <div
        onMouseDown={handleMouseDown}
        className="shrink-0 flex items-center justify-center cursor-row-resize group relative"
        style={{ height: '12px' }}
      >
        {/* Full-width line */}
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 transition-colors"
          style={{ height: '1px', background: 'var(--border-strong)' }}
        />
        {/* Center handle indicator */}
        <div
          className="relative z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full transition-colors group-hover:bg-blue-500"
          style={{ background: 'var(--surface-4)', border: '1px solid var(--border-strong)' }}
        >
          <div className="w-3 h-0.5 rounded-full" style={{ background: 'var(--text-muted)' }} />
          <div className="w-3 h-0.5 rounded-full" style={{ background: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Bottom pane */}
      <div style={{ flex: `${100 - split} 1 0` }} className="min-h-0 overflow-hidden flex flex-col">
        {bottom}
      </div>
    </div>
  );
}
