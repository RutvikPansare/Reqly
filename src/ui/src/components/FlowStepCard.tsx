import { Check, X, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';

const TYPE_BADGE_STYLE: Record<string, { bg: string; color: string }> = {
  run: { bg: 'var(--bg-accent)', color: 'var(--text-accent)' },
  extract: { bg: 'rgba(83,74,183,0.15)', color: '#a89be8' },
  assert: { bg: 'var(--bg-success)', color: 'var(--text-success)' },
  poll: { bg: 'rgba(186,117,23,0.15)', color: '#d4a44c' },
  conditional: { bg: 'var(--bg-warning)', color: 'var(--text-warning)' },
};

const TYPE_LABEL: Record<string, string> = {
  run: 'run',
  extract: 'extract',
  assert: 'assert',
  poll: 'poll',
  conditional: 'if',
};

function describeAssertions(assertions: any[]): string {
  return assertions
    .map(a => `${a.field}${a.path ? '.' + a.path : ''} ${a.operator} ${a.value}`)
    .join(', ');
}

function stepMeta(step: any): string {
  switch (step.type) {
    case 'run':
      return `${step.collection} / ${step.request}`;
    case 'extract':
      return `${step.from} → ${step.into}`;
    case 'assert':
      return describeAssertions(step.assertions || []);
    case 'poll':
      return `until ${step.until} · max ${step.maxAttempts} attempts`;
    case 'conditional':
      return `${step.if} → ${step.then}${step.else ? ` else ${step.else}` : ''}`;
    default:
      return '';
  }
}

interface FlowStepCardProps {
  step: any;
  result?: any;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
}

export function FlowStepCard({ step, result, expanded, onToggleExpand, onDelete }: FlowStepCardProps) {
  const status: 'pass' | 'fail' | 'pending' = !result ? 'pending' : result.passed ? 'pass' : 'fail';
  const badgeStyle = TYPE_BADGE_STYLE[step.type] || TYPE_BADGE_STYLE.run;
  const borderLeft = status === 'pass' ? '3px solid #3B6D11' : status === 'fail' ? '3px solid #A32D2D' : undefined;

  return (
    <div
      className="group"
      style={{
        border: '1px solid var(--border)',
        borderLeft,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-2)',
        overflow: 'hidden',
      }}
    >
      <div
        className="flex items-center cursor-pointer"
        style={{ padding: '8px 10px', gap: '8px' }}
        onClick={onToggleExpand}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: status === 'pass' ? 'var(--bg-success)' : status === 'fail' ? 'var(--bg-danger)' : 'var(--surface-0)',
            border: status === 'pending' ? '1px solid var(--border-strong)' : 'none',
            color: status === 'pass' ? 'var(--text-success)' : status === 'fail' ? 'var(--text-danger)' : 'transparent',
          }}
        >
          {status === 'pass' && <Check size={10} />}
          {status === 'fail' && <X size={10} />}
        </div>

        <span
          className="shrink-0 font-medium"
          style={{ fontSize: '10px', padding: '2px 6px', borderRadius: 10, background: badgeStyle.bg, color: badgeStyle.color }}
        >
          {TYPE_LABEL[step.type] || step.type}
        </span>

        <span className="font-medium shrink-0" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
          {step.id}
        </span>

        <span className="flex-1 truncate" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {stepMeta(step)}
        </span>

        {result && (
          <span className="shrink-0" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {result.duration}ms
          </span>
        )}

        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
          title="Delete step"
        >
          <Trash2 size={13} />
        </button>

        {expanded ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
      </div>

      {expanded && (
        <div style={{ padding: '0 10px 8px', borderTop: '1px solid var(--border)' }}>
          <div className="flex flex-col gap-1" style={{ paddingTop: 8 }}>
            <StepFields step={step} result={result} />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-start" style={{ gap: 6 }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: 52, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span
        style={{
          fontSize: '11px',
          fontFamily: 'var(--font-mono, monospace)',
          color: danger ? 'var(--text-danger)' : 'var(--text-secondary)',
          background: 'var(--surface-0)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '2px 6px',
          flex: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ResponseSnippet({ body }: { body: unknown }) {
  let text: string;
  try {
    text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  } catch {
    text = String(body);
  }
  if (text && text.length > 400) text = text.slice(0, 400) + '...';
  return (
    <div
      style={{
        marginTop: 6,
        background: 'var(--surface-0)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '6px 8px',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '11px',
        color: 'var(--text-muted)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {text}
    </div>
  );
}

function StepFields({ step, result }: { step: any; result?: any }) {
  if (step.type === 'run') {
    return (
      <>
        <Field label="request" value={`${step.collection} / ${step.request}`} />
        {step.retry && <Field label="retry" value={`${step.retry.times}x on ${JSON.stringify(step.retry.on)}, ${step.retry.delay}ms delay`} />}
        {result?.response && (
          <>
            <Field label="status" value={String(result.response.status)} danger={!result.passed} />
            <ResponseSnippet body={result.response.body} />
          </>
        )}
        {result?.error && <Field label="error" value={result.error} danger />}
      </>
    );
  }

  if (step.type === 'extract') {
    return (
      <>
        <Field label="from" value={step.from} />
        <Field label="into" value={step.into} />
      </>
    );
  }

  if (step.type === 'assert') {
    return (
      <>
        <Field label="expected" value={describeAssertions(step.assertions || [])} />
        {result && !result.passed && result.error && <Field label="received" value={result.error} danger />}
      </>
    );
  }

  if (step.type === 'poll') {
    return (
      <>
        <Field label="request" value={`${step.collection} / ${step.request}`} />
        <Field label="until" value={step.until} />
        <Field label="attempts" value={`max ${step.maxAttempts}, ${step.delay}ms delay`} />
        {result?.response && <ResponseSnippet body={result.response.body} />}
      </>
    );
  }

  if (step.type === 'conditional') {
    return (
      <>
        <Field label="if" value={step.if} />
        <Field label="then" value={step.then} />
        {step.else && <Field label="else" value={step.else} />}
      </>
    );
  }

  return null;
}
