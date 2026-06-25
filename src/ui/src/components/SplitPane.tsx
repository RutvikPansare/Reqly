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

      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="shrink-0 h-2 flex items-center justify-center cursor-row-resize group my-1"
      >
        <div className="w-12 h-1 rounded-full bg-gray-700 group-hover:bg-blue-500 transition-colors" />
      </div>

      {/* Bottom pane */}
      <div style={{ flex: `${100 - split} 1 0` }} className="min-h-0 overflow-hidden flex flex-col">
        {bottom}
      </div>
    </div>
  );
}
