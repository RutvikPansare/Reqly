import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';

interface ScriptEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export function ScriptEditor({ value, onChange, placeholder }: ScriptEditorProps) {
  return (
    <div className="flex-1 rounded border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden focus-within:border-blue-500 transition-colors">
      <CodeMirror
        value={value}
        height="100%"
        theme="dark"
        extensions={[javascript()]}
        onChange={onChange}
        placeholder={placeholder}
        className="h-full text-sm font-mono [&_.cm-scroller]:overflow-auto"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
        }}
      />
    </div>
  );
}
