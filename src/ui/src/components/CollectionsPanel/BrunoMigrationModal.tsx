import { Modal, ModalFooter } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';

interface BrunoMigrationModalProps {
  onClose: () => void;
}

const MAPPINGS = [
  { bruno: 'res.getStatus()', reqly: 'Supported natively' },
  { bruno: 'res.getBody()', reqly: 'Supported natively' },
  { bruno: 'res.getHeader(name)', reqly: 'Supported natively' },
  { bruno: 'res.getResponseTime()', reqly: 'Supported natively' },
  { bruno: 'bru.setEnvVar(k, v)', reqly: 'reqly.setEnvVar(k, v)' },
  { bruno: 'bru.getEnvVar(k)', reqly: 'reqly.getEnvVar(k)' },
];

export function BrunoMigrationModal({ onClose }: BrunoMigrationModalProps) {
  return (
    <Modal title="Bruno Script Migration" onClose={onClose} width="w-[500px]">
      <div className="p-2 space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Reqly natively supports Bruno scripts. Here is how your <code>bru.*</code> and <code>res.*</code>
          aliases map to Reqly's engine:
        </p>
        <table className="w-full text-sm text-left">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th className="pb-2 font-medium">Bruno</th>
              <th className="pb-2 font-medium">Reqly equivalent</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {MAPPINGS.map((m, i) => (
              <tr key={i}>
                <td className={`py-1 ${i < MAPPINGS.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
                  <code className="bg-[var(--surface-3)] px-1 rounded">{m.bruno}</code>
                </td>
                <td className={`py-1 ${i < MAPPINGS.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
                  {m.reqly.startsWith('reqly.') ? (
                    <code className="bg-[var(--surface-3)] px-1 rounded">{m.reqly}</code>
                  ) : m.reqly}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ModalFooter>
        <Button variant="primary" onClick={onClose}>Got it</Button>
      </ModalFooter>
    </Modal>
  );
}
