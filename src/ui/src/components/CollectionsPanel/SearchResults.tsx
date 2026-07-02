import { requestBadgeInfo } from '../../lib/colors.js';

interface SearchResultsProps {
  search: string;
  collections: any[];
  typeFilter?: string[];
  onSelectRequest: (req: any, col: string) => void;
  onClearSearch: () => void;
}

export function SearchResults({ search, collections, typeFilter, onSelectRequest, onClearSearch }: SearchResultsProps) {
  const q = search.toLowerCase();
  const matches = collections.flatMap(col =>
    col.requests
      .filter((r: any) => !typeFilter || typeFilter.includes(r.type))
      .filter((r: any) => r.name?.toLowerCase().includes(q) || r.url?.toLowerCase().includes(q))
      .map((r: any) => ({ req: r, col: col.name }))
  );

  if (matches.length === 0) {
    return <p className="text-xs italic px-1 py-2" style={{ color: 'var(--text-muted)' }}>No results for "{search}"</p>;
  }

  return (
    <>
      {matches.map(({ req, col }) => {
        const b = requestBadgeInfo(req.type, req.method);
        return (
          <div
            key={`${col}-${req.name}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors"
            style={{ background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { onSelectRequest(req, col); onClearSearch(); }}
          >
            <span className={b.className} style={b.style}>{b.label}</span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{req.name}</span>
              <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{col}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}
