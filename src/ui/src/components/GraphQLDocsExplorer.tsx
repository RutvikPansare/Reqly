import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, AlertTriangle, Search } from 'lucide-react';

interface GqlField {
  name: string;
  description?: string;
  isDeprecated?: boolean;
  deprecationReason?: string;
  type: any;
  args?: Array<{ name: string; type: any; description?: string }>;
}

interface GqlType {
  kind: string;
  name: string;
  description?: string;
  fields?: GqlField[];
  inputFields?: GqlField[];
  enumValues?: Array<{ name: string; description?: string; isDeprecated?: boolean; deprecationReason?: string }>;
}

interface Props {
  schema: any; // raw __schema introspection object
  onInsertField?: (fieldName: string, hasSubfields: boolean) => void;
}

function typeToString(type: any): string {
  if (!type) return '';
  if (type.kind === 'NON_NULL') return `${typeToString(type.ofType)}!`;
  if (type.kind === 'LIST') return `[${typeToString(type.ofType)}]`;
  return type.name ?? '?';
}

function isObjectType(type: any, allTypes: GqlType[]): boolean {
  const base = unwrapType(type);
  const found = allTypes.find(t => t.name === base);
  return found?.kind === 'OBJECT' || found?.kind === 'INTERFACE';
}

function unwrapType(type: any): string {
  if (!type) return '';
  if (type.kind === 'NON_NULL' || type.kind === 'LIST') return unwrapType(type.ofType);
  return type.name ?? '';
}

const KIND_ORDER = ['OBJECT', 'INPUT_OBJECT', 'ENUM', 'SCALAR', 'INTERFACE', 'UNION'];

const KIND_LABEL: Record<string, string> = {
  OBJECT: 'Objects',
  INPUT_OBJECT: 'Inputs',
  ENUM: 'Enums',
  SCALAR: 'Scalars',
  INTERFACE: 'Interfaces',
  UNION: 'Unions',
};

function TypeRow({ type, allTypes, onInsertField }: { type: GqlType; allTypes: GqlType[]; onInsertField?: Props['onInsertField'] }) {
  const [expanded, setExpanded] = useState(false);
  const fields = type.fields ?? type.inputFields ?? [];
  const values = type.enumValues ?? [];
  const hasChildren = fields.length > 0 || values.length > 0;

  return (
    <div>
      <button
        className="flex items-center gap-1 w-full text-left px-2 py-1 text-xs font-semibold text-gray-300 hover:bg-[var(--surface-3)] transition-colors rounded"
        onClick={() => setExpanded(v => !v)}
        disabled={!hasChildren}
      >
        {hasChildren
          ? expanded ? <ChevronDown size={12} className="shrink-0 text-gray-500" /> : <ChevronRight size={12} className="shrink-0 text-gray-500" />
          : <span className="w-3 shrink-0" />
        }
        <span className="truncate">{type.name}</span>
        {type.description && (
          <span className="ml-1 text-[10px] text-gray-600 truncate flex-1">{type.description}</span>
        )}
      </button>
      {expanded && hasChildren && (
        <div className="ml-4 border-l border-[var(--border)]">
          {fields.map(f => (
            <FieldRow key={f.name} field={f} allTypes={allTypes} onInsertField={onInsertField} />
          ))}
          {values.map(v => (
            <div key={v.name} className="flex items-center gap-1 px-2 py-0.5">
              <span className={`text-xs text-purple-400 ${v.isDeprecated ? 'line-through opacity-60' : ''}`}>{v.name}</span>
              {v.isDeprecated && (
                <span title={v.deprecationReason ?? 'Deprecated'}>
                  <AlertTriangle size={10} className="text-amber-400" />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRow({ field, allTypes, onInsertField }: { field: GqlField; allTypes: GqlType[]; onInsertField?: Props['onInsertField'] }) {
  const hasSubfields = isObjectType(field.type, allTypes);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 w-full text-left px-2 py-0.5 hover:bg-[var(--surface-3)] transition-colors rounded group"
        onClick={() => onInsertField?.(field.name, hasSubfields)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={field.description ?? undefined}
      >
        <span className={`text-xs text-blue-300 flex-1 truncate ${field.isDeprecated ? 'line-through opacity-60' : ''}`}>
          {field.name}
        </span>
        <span className="text-[10px] text-gray-600 shrink-0">{typeToString(field.type)}</span>
        {field.isDeprecated && (
          <span title={field.deprecationReason ?? 'Deprecated'}>
            <AlertTriangle size={10} className="text-amber-400 shrink-0" />
          </span>
        )}
      </button>
      {showTooltip && field.description && (
        <div className="absolute left-full top-0 ml-2 z-50 w-48 p-2 text-[10px] text-gray-300 bg-[var(--surface-4)] border border-[var(--border)] rounded shadow-lg pointer-events-none">
          {field.description}
        </div>
      )}
    </div>
  );
}

export function GraphQLDocsExplorer({ schema, onInsertField }: Props) {
  const [search, setSearch] = useState('');

  const { rootTypes, groupedTypes } = useMemo(() => {
    if (!schema?.types) return { rootTypes: [], groupedTypes: {} };

    const rootTypeNames = new Set([
      schema.queryType?.name,
      schema.mutationType?.name,
      schema.subscriptionType?.name,
    ].filter(Boolean));

    const visibleTypes: GqlType[] = schema.types.filter(
      (t: GqlType) => !t.name.startsWith('__') && t.kind !== 'SCALAR'
    );

    const q = search.toLowerCase();
    const filtered = q
      ? visibleTypes.filter((t: GqlType) => {
          if (t.name.toLowerCase().includes(q)) return true;
          const fields = t.fields ?? t.inputFields ?? [];
          return fields.some((f: GqlField) => f.name.toLowerCase().includes(q));
        })
      : visibleTypes;

    const roots = filtered.filter((t: GqlType) => rootTypeNames.has(t.name));
    const rest = filtered.filter((t: GqlType) => !rootTypeNames.has(t.name));

    const groups: Record<string, GqlType[]> = {};
    for (const t of rest) {
      if (!groups[t.kind]) groups[t.kind] = [];
      groups[t.kind].push(t);
    }

    return { rootTypes: roots, groupedTypes: groups };
  }, [schema, search]);

  const allTypes: GqlType[] = schema?.types ?? [];

  return (
    <div className="flex flex-col h-full text-xs" style={{ background: 'var(--surface-2)', borderLeft: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 px-2 py-2 border-b border-[var(--border)] shrink-0">
        <Search size={12} className="text-gray-500 shrink-0" />
        <input
          className="flex-1 bg-transparent text-gray-300 text-xs focus:outline-none placeholder-gray-600"
          placeholder="Search types and fields..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {rootTypes.length > 0 && (
          <div className="mb-2">
            <div className="px-2 py-1 text-[10px] text-gray-600 font-semibold uppercase tracking-wider">Root Types</div>
            {rootTypes.map(t => (
              <TypeRow key={t.name} type={t} allTypes={allTypes} onInsertField={onInsertField} />
            ))}
          </div>
        )}
        {KIND_ORDER.filter(k => groupedTypes[k]?.length).map(kind => (
          <div key={kind} className="mb-2">
            <div className="px-2 py-1 text-[10px] text-gray-600 font-semibold uppercase tracking-wider">{KIND_LABEL[kind] ?? kind}</div>
            {groupedTypes[kind].map(t => (
              <TypeRow key={t.name} type={t} allTypes={allTypes} onInsertField={onInsertField} />
            ))}
          </div>
        ))}
        {rootTypes.length === 0 && Object.keys(groupedTypes).length === 0 && (
          <div className="px-2 py-4 text-gray-600 text-center">No types found</div>
        )}
      </div>
    </div>
  );
}
