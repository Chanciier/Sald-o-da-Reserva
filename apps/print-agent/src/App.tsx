import { useEffect, useState } from 'react';
import './App.css';
import { StatusBadge } from './components/StatusBadge';
import { getState, onStateChanged } from './lib/tauri';
import { DashboardScreen } from './screens/DashboardScreen';
import { PairingScreen } from './screens/PairingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import type { AppSnapshot } from './types';

type View = 'dashboard' | 'settings';

function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [view, setView] = useState<View>('dashboard');

  useEffect(() => {
    getState().then(setSnapshot);
    const unlisten = onStateChanged(setSnapshot);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  if (!snapshot) {
    return (
      <div className="app">
        <div className="app-body">
          <p className="empty">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!snapshot.paired) {
    return <PairingScreen onPaired={setSnapshot} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Saldão Print Agent</h1>
        <StatusBadge status={snapshot.connection} />
      </header>

      {view === 'dashboard' ? (
        <DashboardScreen snapshot={snapshot} onOpenSettings={() => setView('settings')} />
      ) : (
        <SettingsScreen
          snapshot={snapshot}
          onSaved={(next) => {
            setSnapshot(next);
            setView('dashboard');
          }}
          onBack={() => setView('dashboard')}
        />
      )}
    </div>
  );
}

export default App;
