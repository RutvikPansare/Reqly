import React, { useState, useRef, useEffect } from 'react';

export interface VariableItem {
  name: string;
  /** 'env' | 'collection' or any other source type */
  sourceType: string;
  /** human-readable source name, e.g. "Tellero Local" */
  sourceName: string;
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

function TokenDisplay({
  value,
  placeholder,
  className,
  multiline,
  onClick,
  disabled,
}: {
  value: string;
  placeholder: string;
  className: string;
  multiline: boolean;
  onClick: () => void;
  disabled: boolean;
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
      return (
        <span
          key={i}
          className="inline-flex items-center px-1.5 rounded font-mono shrink-0"
          style={{
            fontSize: '0.75rem',
            lineHeight: '1.4',
            background: 'rgba(96, 165, 250, 0.15)',
            color: '#60a5fa',
            border: '1px solid rgba(96, 165, 250, 0.3)',
            verticalAlign: 'middle',
            marginTop: '1px',
            marginBottom: '1px',
          }}
        >
          {match[1] || '…'}
        </span>
      );
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
      title={value}
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

