import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { fetchEnvironments, setActiveEnvironment } from '../api';

export function SidebarEnvSection() {
  const [environments, setEnvironments] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const load = () => {
    fetchEnvironments().then(data => {
      setEnvironments(data.environments || []);
      setActive(data.active || null);
    }).catch(console.error);
  };

  useEffect(() => {
    load();
    window.addEventListener('reqly-reload', load);
    return () => window.removeEventListener('reqly-reload', load);
  }, []);

  const handleSelect = async (name: string) => {
    await setActiveEnvironment(name).catch(console.error);
    setActive(name);
    window.dispatchEvent(new Event('reqly-reload'));
  };

  return (
    <div className="px-3 pt-1 pb-3">
      {/* Section header */}
      <div
        className="flex items-center justify-between cursor-pointer mb-1 group"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-1">
          <span
            className="flex items-center transition-transform"
            style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(90deg)' : 'none' }}
          >
            <ChevronRight size={12} />
          </span>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Environments
          </h2>
        </div>
      </div>

      {expanded && (
        <ul className="space-y-0.5">
          {environments.length === 0 && (
            <li className="text-xs italic pl-4" style={{ color: 'var(--text-muted)' }}>
              No environments
            </li>
          )}
          {environments.map(env => {
            const isActive = active === env.name;
            return (
              <li
                key={env.name}
                onClick={() => handleSelect(env.name)}
                className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm transition-colors select-none"
                style={{ background: isActive ? 'var(--surface-3)' : 'transparent', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-3)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: isActive ? '#4ade80' : 'var(--border-strong)' }}
                />
                <span className="truncate">{env.name}</span>
                {isActive && (
                  <span className="ml-auto text-[10px] font-medium shrink-0" style={{ color: '#4ade80' }}>active</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
