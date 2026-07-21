import { useEffect, useState } from 'react';
import { listPrinters, openLogsFolder, saveSettings } from '../lib/tauri';
import type { AppSnapshot } from '../types';

export function SettingsScreen({
  snapshot,
  onSaved,
  onBack,
}: {
  snapshot: AppSnapshot;
  onSaved: (snapshot: AppSnapshot) => void;
  onBack: () => void;
}) {
  const [printers, setPrinters] = useState<string[]>([]);
  const [pickupPrinter, setPickupPrinter] = useState(snapshot.pickupPrinter ?? '');
  const [shippingPrinter, setShippingPrinter] = useState(snapshot.shippingPrinter ?? '');
  const [copies, setCopies] = useState(snapshot.copies);
  const [autostart, setAutostart] = useState(snapshot.autostart);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPrinters()
      .then(setPrinters)
      .catch(() => setPrinters([]));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await saveSettings({
        pickupPrinter: pickupPrinter || null,
        shippingPrinter: shippingPrinter || null,
        copies,
        autostart,
      });
      onSaved(updated);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-body">
      <button onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        ← Voltar
      </button>

      {error && <div className="error-banner">{error}</div>}

      <form className="card" onSubmit={handleSave}>
        <h2>Impressoras</h2>
        <div className="field">
          <label htmlFor="pickup-printer">Impressora de retirada</label>
          <select
            id="pickup-printer"
            value={pickupPrinter}
            onChange={(e) => setPickupPrinter(e.target.value)}
          >
            <option value="">Nenhuma</option>
            {printers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="shipping-printer">Impressora de envio</label>
          <select
            id="shipping-printer"
            value={shippingPrinter}
            onChange={(e) => setShippingPrinter(e.target.value)}
          >
            <option value="">Nenhuma</option>
            {printers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="copies">Quantidade de cópias</label>
          <input
            id="copies"
            type="number"
            min={1}
            max={10}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id="autostart"
            type="checkbox"
            style={{ width: 'auto' }}
            checked={autostart}
            onChange={(e) => setAutostart(e.target.checked)}
          />
          <label htmlFor="autostart" style={{ margin: 0 }}>
            Iniciar automaticamente com o Windows
          </label>
        </div>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
          <button type="button" onClick={() => openLogsFolder()}>
            Abrir pasta de logs
          </button>
        </div>
      </form>
    </div>
  );
}
