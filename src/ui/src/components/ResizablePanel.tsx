import { useCallback, useEffect, useRef, useState } from 'react';

interface ResizablePanelProps {
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * A left-hand panel with a draggable right edge. Width is clamped between
 * minWidth (default 0 - fully collapsible) and maxWidth (default: the
 * panel's own designed width, so it can shrink but never grow past what the
 * layout was built for). The handle stays interactive even at width 0 so a
 * collapsed panel can always be dragged back open.
 */
export function ResizablePanel({
  defaultWidth,
  minWidth = 0,
  maxWidth,
  storageKey,
  className = '',
  style,
  children,
}: ResizablePanelProps) {
  const cap = maxWidth ?? defaultWidth;
  const [width, setWidth] = useState<number>(() => {
    if (storageKey) {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) {
        const saved = Number(raw);
        if (!Number.isNaN(saved) && saved >= 0) return Math.min(Math.max(saved, minWidth), cap);
      }
    }
    return defaultWidth;
  });
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    setIsDragging(true);
  }, [width]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(Math.max(startWidthRef.current + (e.clientX - startXRef.current), minWidth), cap);
      setWidth(next);
    };
    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      setWidth(w => {
        if (storageKey) localStorage.setItem(storageKey, String(w));
        return w;
      });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [minWidth, cap, storageKey]);

  return (
    <div className={`relative shrink-0 flex ${className} ${isDragging ? 'select-none' : ''}`} style={{ ...style, width, transition: isDragging ? 'none' : 'width 0.1s ease-out' }}>
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col min-w-0">
        {children}
      </div>
      {/* Drag handle - thickens and turns blue on hover/drag, matching SplitPane's request/response divider (no glow) */}
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 -right-0.5 h-full w-[6px] cursor-col-resize group z-10 flex justify-center"
        title="Drag to resize"
      >
        <div
          className={`h-full w-px transition-all duration-75 ${isDragging ? 'bg-blue-500 w-[2px]' : 'bg-[var(--border)] group-hover:bg-blue-500 group-hover:w-[2px]'}`}
        />
      </div>
    </div>
  );
}
