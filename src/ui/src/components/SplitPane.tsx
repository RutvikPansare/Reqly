import { useRef, useState, useCallback, useEffect } from 'react';

interface SplitPaneProps {
  top: React.ReactNode;
  bottom: React.ReactNode;
  defaultSplit?: number; // 0-100, initial percentage for top pane
  minTop?: number;
  minBottom?: number;
  // When set and the user hasn't manually dragged the divider yet, the split
  // re-syncs to this value - e.g. give the bottom pane less room while it has
  // nothing to show, then expand it back once content (a response) arrives.
  autoSplit?: number;
}

export function SplitPane({ top, bottom, defaultSplit = 50, minTop = 15, minBottom = 15, autoSplit }: SplitPaneProps) {
  const [split, setSplit] = useState(autoSplit ?? defaultSplit);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const userDragged = useRef(false);

  useEffect(() => {
    if (autoSplit !== undefined && !userDragged.current) {
      setSplit(autoSplit);
    }
  }, [autoSplit]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    userDragged.current = true;
    setIsDragging(true);

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setSplit(Math.min(100 - minBottom, Math.max(minTop, pct)));
    };

    const onUp = () => {
      dragging.current = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [minTop, minBottom]);

  return (
    <div ref={containerRef} className={`flex flex-col h-full ${isDragging ? 'select-none' : ''}`}>
      {/* Top pane */}
      <div style={{ flex: `${split} 1 0%` }} className="min-h-0 overflow-hidden flex flex-col">
        {top}
      </div>

      {/* Drag handle - thickens and turns blue on hover/drag like VS Code */}
      <div
        onMouseDown={handleMouseDown}
        className="shrink-0 flex items-center justify-center cursor-row-resize group relative z-10"
        style={{ height: '6px', margin: '-2px 0' }}
      >
        <div
          className={`absolute inset-x-0 top-1/2 -translate-y-1/2 transition-all duration-75 ${isDragging ? 'bg-blue-500 h-[2px]' : 'bg-[var(--border)] h-[1px] group-hover:bg-blue-500 group-hover:h-[2px]'}`}
        />
      </div>

      {/* Bottom pane */}
      <div style={{ flex: `${100 - split} 1 0%` }} className="min-h-0 overflow-hidden flex flex-col">
        {bottom}
      </div>
    </div>
  );
}
