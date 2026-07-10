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
  const [isHover, setIsHover] = useState(false);
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

  const glowing = isDragging || isHover;

  return (
    <div className={`relative shrink-0 flex ${className}`} style={{ ...style, width, transition: isDragging ? 'none' : 'width 0.1s ease-out' }}>
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col min-w-0">
        {children}
      </div>
      <div
        onMouseDown={onMouseDown}
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
        className="absolute top-0 -right-1.5 h-full w-3 cursor-col-resize z-10 flex justify-center"
        title="Drag to resize"
      >
        <div
          className="h-full w-px"
          style={{
            background: glowing ? '#3b82f6' : 'var(--border)',
            boxShadow: glowing ? '0 0 6px 1px rgba(59, 130, 246, 0.8)' : 'none',
            transition: 'background 0.1s ease-out, box-shadow 0.1s ease-out',
          }}
        />
      </div>
    </div>
  );
}
