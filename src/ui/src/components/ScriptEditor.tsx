import { useRef } from 'react';

const MONO_STYLE = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.875rem',
  lineHeight: '1.5rem',
  padding: '0.75rem',
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-all' as const,
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightLine(line: string): string {
  const commentIdx = line.indexOf('//');
  const codePart = commentIdx === -1 ? line : line.slice(0, commentIdx);
  const commentPart = commentIdx === -1 ? '' : line.slice(commentIdx);

  let highlighted = escapeHtml(codePart)
    .replace(/\b(env)\b/g, '<span style="color:#fbbf24;font-weight:600">$1</span>')
    .replace(/\b(request|response)\b/g, '<span style="color:#93c5fd;font-weight:600">$1</span>');

  if (commentPart) {
    highlighted += `<span style="color:#6b7280;font-style:italic">${escapeHtml(commentPart)}</span>`;
  }
  return highlighted;
}

function buildHighlightedHtml(code: string): string {
  return code.split('\n').map(highlightLine).join('\n');
}

interface ScriptEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export function ScriptEditor({ value, onChange, placeholder }: ScriptEditorProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncScroll = () => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  return (
    <div className="relative flex-1 rounded border border-gray-800 bg-gray-950 overflow-hidden focus-within:border-blue-500 transition-colors">
      {/* Highlight overlay - sits behind the transparent textarea */}
      <div
        ref={overlayRef}
        aria-hidden
        className="absolute inset-0 overflow-hidden pointer-events-none select-none"
        style={{ ...MONO_STYLE, color: '#d1d5db' }}
        dangerouslySetInnerHTML={{ __html: buildHighlightedHtml(value) + '\u200b' }}
      />
      {/* Transparent textarea on top - captures input */}
      <textarea
        ref={textareaRef}
        className="absolute inset-0 w-full h-full resize-none focus:outline-none bg-transparent"
        style={{ ...MONO_STYLE, color: 'transparent', caretColor: '#f1f5f9', border: 'none' }}
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );
}
