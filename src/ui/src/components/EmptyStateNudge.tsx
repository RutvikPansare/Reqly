import { useEffect, useState } from 'react';
import { Copy, Check, X } from 'lucide-react';

interface ProjectInfo {
  framework: string | null;
  hasEverConnectedAgent: boolean;
}

const AGENT_TABS: { key: string; label: string }[] = [
  { key: 'cursor', label: 'Cursor' },
  { key: 'claude', label: 'Claude Desktop' },
  { key: 'claudecode', label: 'Claude Code' },
  { key: 'gemini', label: 'Gemini' },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="flex items-center justify-center rounded transition-colors shrink-0"
      style={{ width: '24px', height: '24px', color: copied ? '#4ade80' : 'var(--text-muted)', background: 'transparent', border: 'none' }}
      title="Copy"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function PromptCard({ label, prompt }: { label: string; prompt: string }) {
  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-md"
      style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <CopyButton text={prompt} />
      </div>
      <p className="text-xs font-mono leading-relaxed" style={{ color: 'var(--text-muted)' }}>{prompt}</p>
    </div>
  );
}

export function EmptyStateNudge({ onCreateManually, onDismiss }: { onCreateManually: () => void; onDismiss: () => void }) {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [setupTab, setSetupTab] = useState('cursor');

  const loadProject = () => {
    fetch('/api/project').then(r => r.json()).then(setProject).catch(() => {});
  };

  useEffect(() => {
    loadProject();
    const interval = setInterval(loadProject, 5000);
    window.addEventListener('reqly-reload', loadProject);
    return () => {
      clearInterval(interval);
      window.removeEventListener('reqly-reload', loadProject);
    };
  }, []);

  const framework = project?.framework || 'API';
  const showSetupNudge = project?.hasEverConnectedAgent === false;

  const prompts = [
    {
      label: 'Build from routes',
      prompt: `Read my ${framework} routes and create a Reqly collection for every endpoint. Add assertions for expected status codes.`,
    },
    {
      label: 'Import from OpenAPI spec',
      prompt: 'Import my OpenAPI spec at ./openapi.yaml and create a Reqly collection. Set the base URL from the servers field.',
    },
    {
      label: 'Write an e2e flow',
      prompt: 'Write a Reqly flow that tests the complete login-to-dashboard journey and asserts the response at each step.',
    },
  ];

  return (
    <div className="flex-1 flex justify-center overflow-y-auto">
      <div className="flex flex-col gap-4 w-full max-w-md px-6 py-10 relative">
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 icon-btn"
          title="Dismiss"
        >
          <X size={16} />
        </button>
        {showSetupNudge && (
          <div className="flex flex-col gap-2 p-3 rounded-md" style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>First, connect your agent (one-time setup):</span>
            <div className="flex gap-1">
              {AGENT_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setSetupTab(tab.key)}
                  className="text-xs rounded px-2 py-1 transition-colors"
                  style={{
                    background: setupTab === tab.key ? 'var(--surface-4)' : 'transparent',
                    color: setupTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 rounded px-2 py-1.5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
              <code className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>reqly setup {setupTab}</code>
              <CopyButton text={`reqly setup ${setupTab}`} />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1 text-center">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Your agent can build this for you.</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Paste one of these prompts into Cursor, Claude Code, or any MCP-connected agent:</p>
        </div>

        <div className="flex flex-col gap-2">
          {prompts.map(p => <PromptCard key={p.label} label={p.label} prompt={p.prompt} />)}
        </div>

        <button
          onClick={onCreateManually}
          className="text-xs text-center transition-colors"
          style={{ color: 'var(--text-muted)', opacity: 0.6 }}
        >
          or create a collection manually →
        </button>
      </div>
    </div>
  );
}
