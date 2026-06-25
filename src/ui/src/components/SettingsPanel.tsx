import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  return (
    <Modal title="Settings" onClose={onClose}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>More settings coming soon.</p>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}
