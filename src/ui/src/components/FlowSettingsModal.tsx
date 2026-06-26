import { useState } from 'react';
import { Settings, Trash2, Plus } from 'lucide-react';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { KeyValueEditor } from './KeyValueEditor';
import type { KeyValuePair } from './KeyValueEditor';
import { updateFlowMeta, setFlowData } from '../api';

interface FlowSettingsModalProps {
  flow: any;
  onClose: () => void;
  onSaved: () => void;
}

const rowToPairs = (row: Record<string, string>): KeyValuePair[] =>
  Object.entries(row || {}).map(([key, value]) => ({ key, value, enabled: true }));

const pairsToRow = (pairs: KeyValuePair[]): Record<string, string> => {
  const row: Record<string, string> = {};
  pairs.forEach(p => { if (p.key.trim() && p.enabled) row[p.key.trim()] = p.value; });
  return row;
};

export function FlowSettingsModal({ flow, onClose, onSaved }: FlowSettingsModalProps) {
  const [name, setName] = useState(flow.name);
  const [description, setDescription] = useState(flow.description || '');
  const [rows, setRows] = useState<KeyValuePair[][]>((flow.data || []).map(rowToPairs));
  const [saving, setSaving] = useState(false);

  const addRow = () => setRows([...rows, []]);
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));
  const updateRow = (i: number, pairs: KeyValuePair[]) => setRows(rows.map((r, idx) => idx === i ? pairs : r));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (name.trim() !== flow.name || description !== (flow.description || '')) {
        await updateFlowMeta(flow.name, { name: name.trim(), description });
      }
      const data = rows.map(pairsToRow).filter(row => Object.keys(row).length > 0);
      await setFlowData(name.trim(), data);
      window.dispatchEvent(new Event('reqly-reload'));
      onSaved();
    } catch (e) {
      console.error(e);
      alert('Failed to save flow settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Flow settings" onClose={onClose} icon={<Settings size={16} />} width="w-[520px]">
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Description</label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this flow test?" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Data rows</label>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            When data rows are set, the flow runs once per row with these key/value pairs in flow-local scope.
          </p>
          <div className="flex flex-col gap-2">
            {rows.map((pairs, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-xs shrink-0 pt-1.5" style={{ color: 'var(--text-muted)' }}>Row {i + 1}</span>
                <div className="flex-1">
                  <KeyValueEditor pairs={pairs} onChange={p => updateRow(i, p)} />
                </div>
                <button onClick={() => removeRow(i)} className="shrink-0 pt-1.5" style={{ color: 'var(--text-muted)' }} title="Remove row">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addRow}
            className="mt-2 flex items-center gap-1 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <Plus size={12} /> Add row
          </button>
        </div>
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </ModalFooter>
    </Modal>
  );
}
