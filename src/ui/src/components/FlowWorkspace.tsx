import { useEffect, useState } from 'react';
import { Table, Settings as SettingsIcon, Play, Plus } from 'lucide-react';
import { getFlow, addFlowStep, deleteFlowStep, runFlow } from '../api';
import { fetchCollections } from '../api';
import { FlowStepCard } from './FlowStepCard';
import { FlowSettingsModal } from './FlowSettingsModal';
import { AssertionEditor } from './AssertionEditor';

const STEP_TYPES = ['run', 'extract', 'assert', 'poll', 'conditional'] as const;

interface FlowWorkspaceProps {
  flowName: string;
  lastResult: any | null;
  onRunComplete: (flowName: string, result: any) => void;
}

export function FlowWorkspace({ flowName, lastResult, onRunComplete }: FlowWorkspaceProps) {
  const [flow, setFlow] = useState<any | null>(null);
  const [collections, setCollections] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDataPanel, setShowDataPanel] = useState(true);
  const [selectedRow, setSelectedRow] = useState(0);
  const [addingStep, setAddingStep] = useState(false);
  const [newStepType, setNewStepType] = useState<typeof STEP_TYPES[number]>('run');
  const [newStep, setNewStep] = useState<any>({ id: '', collection: '', request: '' });

  const load = () => {
    getFlow(flowName).then(setFlow).catch(console.error);
    fetchCollections().then(setCollections).catch(console.error);
  };

  useEffect(() => {
    load();
    setSelectedRow(0);
    window.addEventListener('reqly-reload', load);
    return () => window.removeEventListener('reqly-reload', load);
  }, [flowName]);

  if (!flow) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>;
  }

  const hasData = flow.data && flow.data.length > 0;

  const stepsForView: any[] = hasData && lastResult?.dataRows
    ? (lastResult.dataRows[selectedRow]?.steps || [])
    : (lastResult?.steps || []);

  const resultFor = (stepId: string) => stepsForView.find((s: any) => s.stepId === stepId);

  const allResults = hasData && lastResult?.dataRows ? lastResult.dataRows.flatMap((r: any) => r.steps) : (lastResult?.steps || []);
  const passedCount = allResults.filter((s: any) => s.passed).length;
  const failedCount = allResults.filter((s: any) => !s.passed).length;
  const pendingCount = flow.steps.length * (hasData ? flow.data.length : 1) - allResults.length;

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await runFlow(flowName);
      onRunComplete(flowName, result);
    } catch (e) {
      console.error(e);
      alert('Failed to run flow');
    } finally {
      setRunning(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    await deleteFlowStep(flowName, stepId);
    load();
  };

  const startAddStep = () => {
    setNewStepType('run');
    setNewStep({ id: '', collection: '', request: '' });
    setAddingStep(true);
  };

  const handleAddStep = async () => {
    if (!newStep.id?.trim()) return;
    const step = { ...newStep, type: newStepType, id: newStep.id.trim() };
    await addFlowStep(flowName, step);
    setAddingStep(false);
    load();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div
        className="flex items-center shrink-0"
        style={{ padding: '0 16px', height: 40, borderBottom: '1px solid var(--border)', background: 'var(--surface-1)', gap: 10 }}
      >
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{flow.name}</span>
        {flow.description && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{flow.description}</span>}
        <div className="flex-1" />
        {hasData && (
          <button className="btn" onClick={() => setShowDataPanel(s => !s)}>
            <Table size={13} /> Data ({flow.data.length} rows)
          </button>
        )}
        <button className="btn" onClick={() => setShowSettings(true)}>
          <SettingsIcon size={13} /> Settings
        </button>
        <button className="btn btn-primary" onClick={handleRun} disabled={running}>
          <Play size={13} /> {running ? 'Running…' : 'Run flow'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ padding: '12px 16px', gap: 6 }}>
          {flow.steps.map((step: any) => (
            <FlowStepCard
              key={step.id}
              step={step}
              result={resultFor(step.id)}
              expanded={!!expanded[step.id]}
              onToggleExpand={() => setExpanded(prev => ({ ...prev, [step.id]: !prev[step.id] }))}
              onDelete={() => handleDeleteStep(step.id)}
            />
          ))}

          {!addingStep ? (
            <button
              onClick={startAddStep}
              style={{
                padding: '0 10px', height: 26, borderRadius: 'var(--radius-lg)', fontSize: '11px',
                border: '1px dashed var(--border-strong)', background: 'transparent', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-start',
              }}
            >
              <Plus size={12} /> Add step
            </button>
          ) : (
            <AddStepForm
              type={newStepType}
              setType={setNewStepType}
              step={newStep}
              setStep={setNewStep}
              collections={collections}
              onAdd={handleAddStep}
              onCancel={() => setAddingStep(false)}
            />
          )}
        </div>

        {hasData && showDataPanel && (
          <div className="flex flex-col shrink-0 min-h-0" style={{ width: 196, borderLeft: '1px solid var(--border)', background: 'var(--surface-1)' }}>
            <div
              className="flex items-center shrink-0"
              style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', gap: 6 }}
            >
              <Table size={13} /> Data rows
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
            {flow.data.map((row: any, i: number) => {
              const rowResult = lastResult?.dataRows?.[i];
              const rowPassed = rowResult ? rowResult.steps.filter((s: any) => s.passed).length : 0;
              const rowFailed = rowResult ? rowResult.steps.filter((s: any) => !s.passed).length : 0;
              const isActive = selectedRow === i;
              return (
                <div
                  key={i}
                  onClick={() => setSelectedRow(i)}
                  className="cursor-pointer"
                  style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', background: isActive ? 'var(--surface-1)' : 'transparent' }}
                >
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '11px', marginBottom: 2 }}>Row {i + 1}</div>
                  <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {Object.values(row).join(' · ')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: '10px', color: 'var(--text-muted)' }}>
                    <span className={rowResult ? (rowFailed > 0 ? 'dot-fail' : 'dot-pass') : 'dot-pending'} />
                    {rowResult ? `${rowPassed} pass · ${rowFailed} fail` : 'not run'}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center shrink-0" style={{ padding: '6px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface-1)', gap: 12 }}>
        <ResultStat dot="pass" label={`${passedCount} passed`} />
        <ResultStat dot="fail" label={`${failedCount} failed`} />
        <ResultStat dot="pending" label={`${pendingCount} pending`} muted />
        {lastResult && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {lastResult.duration}ms total{hasData ? ` · row ${selectedRow + 1} of ${flow.data.length}` : ''}
          </span>
        )}
      </div>

      {showSettings && (
        <FlowSettingsModal flow={flow} onClose={() => setShowSettings(false)} onSaved={() => { setShowSettings(false); load(); }} />
      )}
    </div>
  );
}

function ResultStat({ dot, label, muted }: { dot: 'pass' | 'fail' | 'pending'; label: string; muted?: boolean }) {
  return (
    <div className="flex items-center" style={{ gap: 4, fontSize: '11px', color: muted ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
      <span className={`dot-${dot}`} />
      {label}
    </div>
  );
}

function AddStepForm({ type, setType, step, setStep, collections, onAdd, onCancel }: {
  type: typeof STEP_TYPES[number];
  setType: (t: typeof STEP_TYPES[number]) => void;
  step: any;
  setStep: (s: any) => void;
  collections: any[];
  onAdd: () => void;
  onCancel: () => void;
}) {
  const selectedCol = collections.find(c => c.name === step.collection);
  const requests = selectedCol?.requests || [];

  const handleTypeChange = (t: typeof STEP_TYPES[number]) => {
    setType(t);
    const base = { id: step.id || '' };
    if (t === 'run' || t === 'poll') setStep({ ...base, collection: '', request: '', ...(t === 'poll' ? { until: '', maxAttempts: 5, delay: 1000 } : {}) });
    else if (t === 'extract') setStep({ ...base, from: '', into: '' });
    else if (t === 'assert') setStep({ ...base, assertions: [] });
    else setStep({ ...base, if: '', then: '' });
  };

  return (
    <div style={{ border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="flex items-center gap-2">
        {STEP_TYPES.map(t => (
          <button
            key={t}
            onClick={() => handleTypeChange(t)}
            className="capitalize"
            style={{
              fontSize: '11px', padding: '2px 8px', borderRadius: 10,
              background: type === t ? 'var(--accent)' : 'var(--surface-3)',
              color: type === t ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {t === 'conditional' ? 'if' : t}
          </button>
        ))}
      </div>

      <input className="input text-xs" placeholder="step id (e.g. login)" value={step.id || ''} onChange={e => setStep({ ...step, id: e.target.value })} />

      {(type === 'run' || type === 'poll') && (
        <div className="flex gap-2">
          <select className="input text-xs" value={step.collection || ''} onChange={e => setStep({ ...step, collection: e.target.value, request: '' })}>
            <option value="">Collection…</option>
            {collections.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <select className="input text-xs" value={step.request || ''} onChange={e => setStep({ ...step, request: e.target.value })}>
            <option value="">Request…</option>
            {requests.map((r: any) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </div>
      )}
      {type === 'poll' && (
        <div className="flex gap-2">
          <input className="input text-xs flex-1" placeholder="until expression" value={step.until || ''} onChange={e => setStep({ ...step, until: e.target.value })} />
          <input className="input text-xs w-20" type="number" placeholder="max" value={step.maxAttempts ?? 5} onChange={e => setStep({ ...step, maxAttempts: Number(e.target.value) })} />
          <input className="input text-xs w-24" type="number" placeholder="delay ms" value={step.delay ?? 1000} onChange={e => setStep({ ...step, delay: Number(e.target.value) })} />
        </div>
      )}

      {type === 'extract' && (
        <div className="flex gap-2">
          <input className="input text-xs flex-1" placeholder="from (response.body.token)" value={step.from || ''} onChange={e => setStep({ ...step, from: e.target.value })} />
          <input className="input text-xs flex-1" placeholder="into (varName or env.varName)" value={step.into || ''} onChange={e => setStep({ ...step, into: e.target.value })} />
        </div>
      )}

      {type === 'assert' && (
        <AssertionEditor assertions={step.assertions || []} onChange={(assertions) => setStep({ ...step, assertions })} />
      )}

      {type === 'conditional' && (
        <div className="flex flex-col gap-2">
          <input className="input text-xs" placeholder="if expression (response.body.role === 'admin')" value={step.if || ''} onChange={e => setStep({ ...step, if: e.target.value })} />
          <div className="flex gap-2">
            <input className="input text-xs flex-1" placeholder="then (stepId / skip / abort)" value={step.then || ''} onChange={e => setStep({ ...step, then: e.target.value })} />
            <input className="input text-xs flex-1" placeholder="else (optional)" value={step.else || ''} onChange={e => setStep({ ...step, else: e.target.value || undefined })} />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={onAdd}>Add</button>
      </div>
    </div>
  );
}
