import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface VariableItem {
  name: string;
  /** 'env' | 'collection' or any other source type */
  sourceType: string;
  /** human-readable source name, e.g. "Tellero Local" */
  sourceName: string;
  /** resolved value of the variable */
  value?: string;
}

interface VariableInputProps {
  value: string;
  onChange: (val: string) => void;
  variables: VariableItem[];
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  spellCheck?: boolean;
}

interface VarTooltipState {
  varName: string;
  resolvedValue: string | undefined;
  x: number;
  y: number;
}

function VarTooltip({ state }: { state: VarTooltipState }) {
  return createPortal(
    <div
      className="pointer-events-none fixed z-[9999] whitespace-nowrap rounded px-2 py-1 text-xs font-sans"
      style={{
        left: state.x,
        top: state.y,
        transform: 'translateX(-50%) translateY(-100%)',
        background: '#1e1e2e',
        border: '1px solid rgba(96,165,250,0.4)',
        color: '#e2e8f0',
        boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
        marginTop: '-6px',
      }}
    >
      <span style={{ color: '#a78bfa' }}>{state.varName}</span>
      <span style={{ color: '#64748b' }}> = </span>
      <span style={{ color: state.resolvedValue !== undefined ? '#86efac' : '#f87171' }}>
        {state.resolvedValue !== undefined ? state.resolvedValue : 'not set'}
      </span>
    </div>,
    document.body
  );
}

function VarPill({
  varName,
  resolvedValue,
}: {
  varName: string;
  resolvedValue: string | undefined;
}) {
  const [tooltip, setTooltip] = useState<VarTooltipState | null>(null);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({
      varName,
      resolvedValue,
      x: rect.left + rect.width / 2,
      y: rect.top - 4,
    });
  }, [varName, resolvedValue]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <>
      <span
        className="inline-flex items-center px-1.5 rounded font-mono shrink-0"
        style={{
          fontSize: '0.75rem',
          lineHeight: '1.4',
          background: resolvedValue !== undefined ? 'rgba(96, 165, 250, 0.15)' : 'rgba(239, 68, 68, 0.12)',
          color: resolvedValue !== undefined ? '#60a5fa' : '#f87171',
          border: `1px solid ${resolvedValue !== undefined ? 'rgba(96, 165, 250, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          verticalAlign: 'middle',
          marginTop: '1px',
          marginBottom: '1px',
          cursor: 'default',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {varName || '…'}
      </span>
      {tooltip && <VarTooltip state={tooltip} />}
    </>
  );
}

function TokenDisplay({
  value,
  placeholder,
  className,
  multiline,
  onClick,
  disabled,
  variableValues,
}: {
  value: string;
  placeholder: string;
  className: string;
  multiline: boolean;
  onClick: () => void;
  disabled: boolean;
  variableValues: Record<string, string>;
}) {
  if (!value) {
    return (
      <div
        className={`${className} cursor-text`}
        style={{ color: 'var(--text-muted)', userSelect: 'none' }}
        onClick={disabled ? undefined : onClick}
      >
        {placeholder}
      </div>
    );
  }

  const parts = value.split(/({{[^}]*}})/g);
  const rendered = parts.map((part, i) => {
    const match = part.match(/^{{(.*)}}$/);
    if (match) {
      const varName = match[1] || '';
      const resolvedValue = variableValues[varName];
      return <VarPill key={i} varName={varName} resolvedValue={resolvedValue} />;
    }
    return part ? (
      <span key={i} style={{ verticalAlign: 'middle' }}>
        {part}
      </span>
    ) : null;
  });

  return (
    <div
      className={`${className} ${multiline ? 'flex flex-wrap gap-x-0.5 content-start' : 'flex items-center gap-x-0.5 overflow-hidden whitespace-nowrap'} cursor-text`}
      style={{ userSelect: 'none' }}
      onClick={disabled ? undefined : onClick}
    >
      {rendered}
    </div>
  );
}

export function VariableInput({
  value,
  onChange,
  variables,
  multiline = false,
  className = '',
  placeholder = '',
  disabled = false,
  type = 'text',
  spellCheck = false,
}: VariableInputProps) {
  const [focused, setFocused] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuItems, setMenuItems] = useState<VariableItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [matchStart, setMatchStart] = useState(-1);
  const [cursorPos, setCursorPos] = useState(-1);

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focused && inputRef.current) {
      inputRef.current.focus();
      // Place cursor at end
      const len = (inputRef.current.value || '').length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [focused]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);

    const pos = e.target.selectionStart || 0;
    setCursorPos(pos);

    const textBeforeCursor = val.slice(0, pos);
    const match = textBeforeCursor.match(/\{\{([a-zA-Z0-9_-]*)$/);

    if (match) {
      const query = match[1];
      const filtered = variables.filter(v => v.name.toLowerCase().includes(query.toLowerCase()));
      if (filtered.length > 0) {
        setMenuItems(filtered);
        setActiveIndex(0);
        setMatchStart(pos - query.length - 2);
        setShowMenu(true);
      } else {
        setShowMenu(false);
      }
    } else {
      setShowMenu(false);
    }
  };

  const insertVariable = (item: VariableItem) => {
    const before = value.slice(0, matchStart);
    const after = value.slice(cursorPos);
    const newValue = before + '{{' + item.name + '}}' + after;
    onChange(newValue);
    setShowMenu(false);

    const newCursorPos = matchStart + item.name.length + 4;
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (showMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, menuItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertVariable(menuItems[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowMenu(false);
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const pos = e.currentTarget.selectionStart || 0;
    if (pos !== cursorPos) {
      const val = e.currentTarget.value;
      const textBeforeCursor = val.slice(0, pos);
      const match = textBeforeCursor.match(/\{\{([a-zA-Z0-9_-]*)$/);
      if (!match) setShowMenu(false);
      setCursorPos(pos);
    }
  };

  const handleBlur = () => {
    // Small delay so menu clicks register before hiding the input
    setTimeout(() => {
      if (!showMenu) setFocused(false);
    }, 150);
  };

  if (!focused && !disabled) {
    return (
      <div className="relative flex-1 flex">
        <TokenDisplay
          value={value}
          placeholder={placeholder}
          className={className}
          multiline={multiline}
          onClick={() => setFocused(true)}
          disabled={disabled}
          variableValues={Object.fromEntries(variables.map(v => [v.name, v.value ?? '']))}
        />
      </div>
    );
  }

  const commonProps = {
    ref: inputRef as any,
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onKeyUp: handleKeyUp,
    onBlur: handleBlur,
    className,
    placeholder,
    disabled,
    spellCheck,
  };

  return (
    <div className="relative flex-1 flex">
      {multiline ? (
        <textarea {...commonProps} className={`${className} w-full`} />
      ) : (
        <input {...commonProps} type={type} className={`${className} w-full`} />
      )}

      {showMenu && (
        <div
          ref={menuRef}
          className="absolute z-50 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-48 overflow-y-auto w-full min-w-[200px]"
          style={{ top: '100%', left: 0, marginTop: '4px' }}
        >
          {menuItems.map((item, index) => {
            const isActive = index === activeIndex;
            const typeColor =
              item.sourceType === 'env'
                ? isActive ? 'bg-emerald-500 text-white' : 'bg-emerald-900 text-emerald-300'
                : item.sourceType === 'collection'
                ? isActive ? 'bg-violet-500 text-white' : 'bg-violet-900 text-violet-300'
                : isActive ? 'bg-gray-500 text-white' : 'bg-gray-700 text-gray-400';
            return (
              <div
                key={item.name + ':' + item.sourceType + ':' + item.sourceName}
                className={`flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => insertVariable(item)}
              >
                <span className="font-mono">{`{{${item.name}}}`}</span>
                <span className="flex items-center gap-1 ml-3 shrink-0">
                  <span className={`text-xs rounded px-1.5 py-0.5 font-semibold ${typeColor}`}>
                    {item.sourceType}
                  </span>
                  {item.sourceName && item.sourceName !== item.sourceType && (
                    <span className={`text-xs ${isActive ? 'text-blue-200' : 'text-gray-500'}`}>
                      {item.sourceName}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

