import { useState } from 'react';
import { connect, pause, reprocess, resume, testPrint } from '../lib/tauri';
import type { AppSnapshot } from '../types';

const TYPE_LABEL = { PICKUP: 'Retirada', SHIPPING: 'Envio' } as const;

export function DashboardScreen({
  snapshot,
  onOpenSettings,
}: {
  snapshot: AppSnapshot;
  onOpenSettings: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app-body">
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Status</h2>
        <div className="info-grid">
          <div className="info-item">
            <div className="label">Dispositivo</div>
            <div className="value">{snapshot.deviceName ?? '—'}</div>
          </div>
          <div className="info-item">
            <div className="label">Impressora de retirada</div>
            <div className="value">{snapshot.pickupPrinter ?? 'Não configurada'}</div>
          </div>
          <div className="info-item">
            <div className="label">Impressora de envio</div>
            <div className="value">{snapshot.shippingPrinter ?? 'Não configurada'}</div>
          </div>
          <div className="info-item">
            <div className="label">Última impressão</div>
            <div className="value">
              {snapshot.lastPrint
                ? `${TYPE_LABEL[snapshot.lastPrint.jobType]} · ${new Date(
                    snapshot.lastPrint.at,
                  ).toLocaleTimeString('pt-BR')}`
                : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Ações</h2>
        <div className="actions">
          <button
            className="primary"
            disabled={busy !== null || snapshot.connection === 'connected'}
            onClick={() => run('connect', connect)}
          >
            {busy === 'connect' ? 'Conectando...' : 'Conectar'}
          </button>
          <button
            disabled={busy !== null || !snapshot.pickupPrinter}
            onClick={() => run('test-pickup', () => testPrint('pickup'))}
          >
            {busy === 'test-pickup' ? 'Imprimindo...' : 'Testar retirada'}
          </button>
          <button
            disabled={busy !== null || !snapshot.shippingPrinter}
            onClick={() => run('test-shipping', () => testPrint('shipping'))}
          >
            {busy === 'test-shipping' ? 'Imprimindo...' : 'Testar envio'}
          </button>
          <button
            disabled={busy !== null}
            onClick={() =>
              run(snapshot.paused ? 'resume' : 'pause', snapshot.paused ? resume : pause)
            }
          >
            {snapshot.paused ? 'Retomar' : 'Pausar'}
          </button>
          <button disabled={busy !== null} onClick={() => run('reprocess', reprocess)}>
            {busy === 'reprocess' ? 'Reprocessando...' : 'Reprocessar'}
          </button>
          <button onClick={onOpenSettings}>Configurações</button>
        </div>
        {snapshot.paused && (
          <p style={{ marginTop: 10, fontSize: 12, color: '#b45309' }}>
            Agente pausado — jobs recebidos ficam em Pendentes até você clicar em Retomar.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Pendentes ({snapshot.pending.length})</h2>
        {snapshot.pending.length === 0 ? (
          <p className="empty">Nenhum job pendente.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.pending.map((job) => (
                <tr key={job.id}>
                  <td>#{job.orderId.slice(-8).toUpperCase()}</td>
                  <td>{TYPE_LABEL[job.type]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Histórico</h2>
        {snapshot.history.length === 0 ? (
          <p className="empty">Nenhuma impressão registrada ainda.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.history.slice(0, 30).map((entry) => (
                <tr key={`${entry.jobId}-${entry.at}`}>
                  <td>#{entry.orderId.slice(-8).toUpperCase()}</td>
                  <td>{TYPE_LABEL[entry.jobType]}</td>
                  <td>
                    <span className={`badge badge-${entry.status.toLowerCase()}`}>
                      {entry.status === 'PRINTED' ? 'Impresso' : 'Falhou'}
                    </span>
                    {entry.message && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                        {entry.message}
                      </div>
                    )}
                  </td>
                  <td>{new Date(entry.at).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
