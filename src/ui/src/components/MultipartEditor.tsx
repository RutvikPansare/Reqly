import { useRef, useState } from 'react';
import { Trash2, MoreHorizontal } from 'lucide-react';
import { VariableInput } from './VariableInput';
import type { VariableItem } from './VariableInput';

export interface MultipartPartState {
  name: string;
  type: 'text' | 'file';
  value?: string;
  filePath?: string;
  contentType?: string;
  // Ephemeral browser File object - not persisted to YAML / request config.
  _file?: File;
}

interface MultipartEditorProps {
  parts: MultipartPartState[];
  onChange: (parts: MultipartPartState[]) => void;
  variables?: VariableItem[];
}

export function MultipartEditor({ parts, onChange, variables = [] }: MultipartEditorProps) {
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [expandedContentType, setExpandedContentType] = useState<Record<number, boolean>>({});

  const update = (index: number, patch: Partial<MultipartPartState>) => {
    const next = parts.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(parts.filter((_, i) => i !== index));
  };

  const addPart = () => {
    onChange([...parts, { name: '', type: 'text', value: '' }]);
  };

  const toggleContentType = (index: number) => {
    setExpandedContentType(prev => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      {parts.length > 0 && (
        <div
          className="grid text-xs font-semibold uppercase tracking-widest px-2 py-1.5"
          style={{
            gridTemplateColumns: '1fr 90px 1fr 28px',
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span>Name</span>
          <span>Type</span>
          <span>Value</span>
          <span />
        </div>
      )}

      {parts.map((part, i) => {
        const ctExpanded = !!expandedContentType[i];
        return (
          <div key={i} className="group">
            <div
              className="grid items-center gap-2 px-1 py-1"
              style={{ gridTemplateColumns: '1fr 90px 1fr 28px' }}
            >
              {/* Name */}
              <VariableInput
                variables={variables}
                className="input text-sm py-0.5 px-2"
                placeholder="name"
                value={part.name}
                onChange={val => update(i, { name: val })}
              />

              {/* Type toggle */}
              <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {(['text', 'file'] as const).map(t => (
                  <button
                    key={t}
                    className="flex-1 text-xs py-1 transition-colors capitalize"
                    style={{
                      background: part.type === t ? 'var(--accent)' : 'var(--surface-3)',
                      color: part.type === t ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                    }}
                    onClick={() => update(i, { type: t, value: t === 'text' ? (part.value ?? '') : undefined, _file: t === 'text' ? undefined : part._file })}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Value / file picker */}
              <div className="flex items-center gap-1 min-w-0">
                {part.type === 'text' ? (
                  <VariableInput
                    variables={variables}
                    className="input text-sm flex-1 min-w-0 py-0.5 px-2"
                    placeholder="value"
                    value={part.value ?? ''}
                    onChange={val => update(i, { value: val })}
                  />
                ) : (
                  <>
                    <button
                      className="btn btn-ghost rounded text-xs shrink-0"
                      style={{ padding: '3px 10px', border: '1px solid var(--border)' }}
                      onClick={() => fileInputRefs.current[i]?.click()}
                    >
                      {part._file ? 'Change' : 'Choose file'}
                    </button>
                    {part._file || part.filePath ? (
                      <span
                        className="text-xs truncate min-w-0 flex-1"
                        style={{ color: 'var(--text-secondary)' }}
                        title={part._file?.name ?? part.filePath}
                      >
                        {part._file?.name ?? part.filePath}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No file chosen</span>
                    )}
                    <input
                      ref={el => { fileInputRefs.current[i] = el; }}
                      type="file"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) update(i, { _file: file, filePath: file.name });
                        e.target.value = '';
                      }}
                    />
                  </>
                )}

                {/* Content-type toggle button */}
                <button
                  className="shrink-0 rounded transition-colors opacity-0 group-hover:opacity-100"
                  style={{
                    padding: '2px 4px',
                    color: ctExpanded ? 'var(--accent)' : 'var(--text-muted)',
                    border: 'none',
                    background: 'transparent',
                  }}
                  onClick={() => toggleContentType(i)}
                  title="Toggle content-type override"
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>

              {/* Remove */}
              <button
                className="flex justify-center items-center rounded transition-colors opacity-0 group-hover:opacity-100"
                style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none' }}
                onClick={() => remove(i)}
                title="Remove part"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Content-type override row */}
            {ctExpanded && (
              <div
                className="grid items-center gap-2 px-1 pb-1.5"
                style={{ gridTemplateColumns: '1fr 90px 1fr 28px' }}
              >
                <span />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Content-Type</span>
                <input
                  className="input text-xs"
                  style={{ padding: '3px 8px' }}
                  placeholder="auto-detected"
                  value={part.contentType ?? ''}
                  onChange={e => update(i, { contentType: e.target.value || undefined })}
                />
                <span />
              </div>
            )}
          </div>
        );
      })}

      <button
        className="btn btn-ghost rounded text-xs mt-1 self-start"
        style={{ padding: '4px 12px', border: '1px solid var(--border)' }}
        onClick={addPart}
      >
        + Add part
      </button>
    </div>
  );
}
