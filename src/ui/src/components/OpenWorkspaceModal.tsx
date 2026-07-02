import { useState } from 'react';
import { Folder, Github, ArrowLeft, FolderOpen } from 'lucide-react';
import { Modal, ModalFooter } from './ui/Modal';

interface OpenWorkspaceModalProps {
  onSwitch: (path: string) => void;
  onClose: () => void;
}

export function OpenWorkspaceModal({ onSwitch, onClose }: OpenWorkspaceModalProps) {
  const [mode, setMode] = useState<'select' | 'clone'>('select');
  const [githubUrl, setGithubUrl] = useState('');
  const [destination, setDestination] = useState('~/.reqly/workspaces');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleOpenLocal = async () => {
    try {
      const res = await fetch('/api/open-folder-picker');
      const data = await res.json();
      if (data.path) {
        onSwitch(data.path);
        onClose();
      }
    } catch (e: any) {
      setError(e.message || 'Failed to open folder picker');
    }
  };

  const handleBrowseDestination = async () => {
    try {
      const res = await fetch('/api/open-folder-picker');
      const data = await res.json();
      if (data.path) {
        setDestination(data.path);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to open folder picker');
    }
  };

  const handleClone = async () => {
    if (!githubUrl.trim()) {
      setError('Please enter a GitHub URL');
      return;
    }
    if (!destination.trim()) {
      setError('Please enter a destination folder');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      const res = await fetch('/api/clone-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: githubUrl.trim(), destination: destination.trim() })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clone repository');
      
      onSwitch(data.path);
      onClose();
    } catch (e: any) {
      setError(e.message || 'An error occurred during clone');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Open Workspace" onClose={onClose} icon={<FolderOpen size={16} style={{ color: 'var(--accent)' }} />}>
      {mode === 'select' ? (
        <div className="flex flex-col gap-3 pb-2">
          <button
            onClick={handleOpenLocal}
            className="flex items-start gap-3 p-4 rounded-md transition-colors text-left"
            style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
          >
            <Folder size={24} style={{ color: '#60a5fa', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div className="font-medium text-sm text-white mb-1">Open Local Folder</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>For developers with an existing repository already on their machine.</div>
            </div>
          </button>

          <button
            onClick={() => setMode('clone')}
            className="flex items-start gap-3 p-4 rounded-md transition-colors text-left"
            style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
          >
            <Github size={24} style={{ color: '#fff', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div className="font-medium text-sm text-white mb-1">Clone from GitHub</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Automatically download and open a repository from GitHub.</div>
            </div>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex items-center gap-2 mb-2">
            <button 
              onClick={() => { setMode('select'); setError(''); }}
              className="p-1 rounded hover:bg-white/10 transition-colors flex items-center justify-center"
              title="Back"
            >
              <ArrowLeft size={16} />
            </button>
            <span className="text-sm font-medium">Clone Repository</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>GitHub Repository URL</label>
            <input
              autoFocus
              className="input font-mono text-sm"
              placeholder="https://github.com/user/repo.git"
              value={githubUrl}
              onChange={e => { setGithubUrl(e.target.value); setError(''); }}
              disabled={loading}
              spellCheck={false}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Destination Folder</label>
            <div className="flex gap-1.5">
              <input
                className="input font-mono text-sm flex-1"
                value={destination}
                onChange={e => { setDestination(e.target.value); setError(''); }}
                disabled={loading}
                spellCheck={false}
              />
              <button
                onClick={handleBrowseDestination}
                disabled={loading}
                title="Browse for folder"
                className="rounded flex items-center justify-center shrink-0 transition-colors"
                style={{ width: '32px', height: '32px', background: 'var(--surface-4)', color: 'var(--text-muted)' }}
              >
                <Folder size={15} />
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button
              className="btn btn-primary min-w-[80px]"
              onClick={handleClone}
              disabled={!githubUrl.trim() || !destination.trim() || loading}
            >
              {loading ? 'Cloning...' : 'Clone'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
