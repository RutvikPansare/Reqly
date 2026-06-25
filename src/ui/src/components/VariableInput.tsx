import React, { useState, useRef, useEffect } from 'react';

interface VariableInputProps {
  value: string;
  onChange: (val: string) => void;
  variables: string[];
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  spellCheck?: boolean;
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
  const [showMenu, setShowMenu] = useState(false);
  const [menuItems, setMenuItems] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [matchStart, setMatchStart] = useState(-1);
  const [cursorPos, setCursorPos] = useState(-1);

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
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
      const filtered = variables.filter(v => v.toLowerCase().includes(query.toLowerCase()));
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

  const insertVariable = (variableName: string) => {
    const before = value.slice(0, matchStart);
    const after = value.slice(cursorPos);
    const newValue = before + '{{' + variableName + '}}' + after;
    onChange(newValue);
    setShowMenu(false);
    
    // Set cursor position after the inserted variable
    const newCursorPos = matchStart + variableName.length + 4; // 4 for {{ and }}
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
    // Also update cursor position and match on arrow keys to close menu if cursor moves away
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

  const commonProps = {
    ref: inputRef as any,
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onKeyUp: handleKeyUp,
    className,
    placeholder,
    disabled,
    spellCheck
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
          // Position it below the input. If multiline, it just attaches to the bottom of the textarea wrapper.
          style={{ top: '100%', left: 0, marginTop: '4px' }}
        >
          {menuItems.map((item, index) => (
            <div
              key={item}
              className={`px-3 py-1.5 text-sm cursor-pointer ${
                index === activeIndex ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
              }`}
              onMouseDown={(e) => {
                // Prevent input blur
                e.preventDefault();
              }}
              onClick={() => insertVariable(item)}
            >
              <span className="font-mono">{`{{${item}}}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
