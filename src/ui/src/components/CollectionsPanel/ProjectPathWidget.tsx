import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { OpenWorkspaceModal } from '../OpenWorkspaceModal.js';

export function formatProjectPath(p: string) {
  const parts = p.replace(/\\/g, '/').split('/');
  const name = parts[parts.length - 1] || parts[parts.length - 2] || p;
  const parent = parts.slice(0, -1).join('/') || '/';
  const display = parent.startsWith('/Users/') ? parent.replace(/^\/Users\/[^/]+/, '~') : parent;
  return { name, display };
}

interface ProjectPathWidgetProps {
  projectPath: string;
  onSwitch: (p: string) => void;
}

export function ProjectPathWidget({ projectPath, onSwitch }: ProjectPathWidgetProps) {
  const [editing, setEditing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pendingDir, setPendingDir] = useState<string | null>(null);

  const doSwitch = async (target: string, createIfMissing = false) => {
    setSwitching(true);
    try {
      const res = await fetch('/api/switch-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDir: target, createIfMissing }),
      });
      const data = await res.json();
      if (res.status === 404 && data.notFound) { setSwitching(false); return; }
      if (!res.ok) { setSwitching(false); return; }
      if (data.needsReqlyDir) { setPendingDir(target); setSwitching(false); return; }
      onSwitch(target);
      setEditing(false);
      setPendingDir(null);
    } catch {
      // ignore
    }
    setSwitching(false);
  };

  const { name, display } = formatProjectPath(projectPath);

  if (pendingDir) {
    return (
      <>
        <div className="shrink-0 rounded-md px-3 py-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="font-mono font-medium truncate" style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{name}</div>
          <div className="font-mono truncate" style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{display}</div>
        </div>
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-md p-4 max-w-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Reqly collections found</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              The folder <span className="font-mono">{pendingDir}</span> doesn't have a <span className="font-mono">.reqly/</span> directory.
              Reqly uses this folder to store your collections.
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => doSwitch(pendingDir, true)}
                disabled={switching}
                className="flex-1 text-xs rounded px-2 py-1.5 font-medium"
                style={{ background: 'var(--accent)', color: '#000', opacity: switching ? 0.6 : 1 }}
              >
                {switching ? 'Creating...' : `Create .reqly/ here`}
              </button>
              <button
                onClick={() => { setPendingDir(null); setEditing(true); }}
                disabled={switching}
                className="text-xs rounded px-2 py-1.5"
                style={{ background: 'var(--surface-4)', color: 'var(--text-muted)' }}
              >
                Choose a different folder
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (editing) {
    return (
      <OpenWorkspaceModal
        onClose={() => setEditing(false)}
        onSwitch={(path) => { doSwitch(path); setEditing(false); }}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="shrink-0 w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors group"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      title={`${projectPath}\nClick to switch project`}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
    >
      <FolderOpen size={13} style={{ color: '#60a5fa', flexShrink: 0 }} />
      <div className="min-w-0 flex-1">
        <div className="font-mono font-medium truncate" style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>{name}</div>
        <div className="font-mono truncate" style={{ fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{display}</div>
      </div>
      <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: 'var(--text-muted)' }}>change</span>
    </button>
  );
}
