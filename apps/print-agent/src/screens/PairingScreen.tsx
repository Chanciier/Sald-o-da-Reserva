import { useState } from 'react';
import { pair } from '../lib/tauri';
import type { AppSnapshot } from '../types';

export function PairingScreen({ onPaired }: { onPaired: (snapshot: AppSnapshot) => void }) {
  const [apiUrl, setApiUrl] = useState('http://localhost:3001');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const snapshot = await pair(apiUrl.trim(), code.trim().toUpperCase());
      onPaired(snapshot);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pairing-screen">
      <div className="pairing-card">
        <h1>Saldão Print Agent</h1>
        <p>
          Primeiro acesso: informe o endereço da API e o código de pareamento gerado em Print Center
          → Dispositivos no painel admin.
        </p>
        {error && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="api-url">URL da API</label>
            <input
              id="api-url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://api.saldaodareserva.com.br"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pairing-code">Código temporário</label>
            <input
              id="pairing-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCD1234"
              maxLength={16}
              required
              style={{ textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center' }}
            />
          </div>
          <button type="submit" className="primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Parear...' : 'Parear dispositivo'}
          </button>
        </form>
      </div>
    </div>
  );
}
