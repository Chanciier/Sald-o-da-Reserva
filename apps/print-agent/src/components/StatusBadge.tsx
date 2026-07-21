import type { ConnectionStatus } from '../types';

const LABEL: Record<ConnectionStatus, string> = {
  connected: 'Conectado',
  connecting: 'Conectando...',
  reconnecting: 'Reconectando...',
  disconnected: 'Desconectado',
};

export function StatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" />
      {LABEL[status]}
    </span>
  );
}
