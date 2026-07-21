use crate::api_client::ApiClient;
use crate::processor::{self, ProcessorPaths, TokenProvider};
use crate::state::{AppState, ConnectionStatus, PrintJob};
use crate::{storage, ws_client};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, watch, Mutex};
use tracing::warn;

/// Dono dos handles das tasks de background (WS + processador de fila).
/// `start`/`stop` são idempotentes — chamar `start` com a conexão já de pé
/// não abre uma segunda.
pub struct AgentRuntime {
    stop_tx: Mutex<Option<watch::Sender<bool>>>,
    job_tx: Mutex<Option<mpsc::Sender<PrintJob>>>,
    pub paths: ProcessorPaths,
}

impl AgentRuntime {
    pub fn new(paths: ProcessorPaths) -> Self {
        Self {
            stop_tx: Mutex::new(None),
            job_tx: Mutex::new(None),
            paths,
        }
    }

    pub async fn is_running(&self) -> bool {
        self.stop_tx.lock().await.is_some()
    }

    pub async fn start(&self, app: AppHandle, state: AppState, api_url: String, token: String) {
        if self.is_running().await {
            return;
        }

        let ws_url = to_ws_url(&api_url);
        let (stop_tx, stop_rx) = watch::channel(false);
        let (job_tx, job_rx) = mpsc::channel::<PrintJob>(64);
        let (status_tx, status_rx) = watch::channel(ConnectionStatus::Disconnected);

        *self.stop_tx.lock().await = Some(stop_tx);
        *self.job_tx.lock().await = Some(job_tx.clone());

        let api = ApiClient::new(&api_url);
        let token_provider: TokenProvider = Arc::new(storage::load_token);
        let paths = self.paths.clone();

        tokio::spawn(ws_client::run(status_tx, ws_url, token, job_tx, stop_rx));
        tokio::spawn(bridge_status(
            app.clone(),
            state.clone(),
            status_rx,
            api.clone(),
            token_provider.clone(),
            paths.clone(),
        ));
        tokio::spawn(processor::run(app, state, api, token_provider, paths, job_rx));
    }

    pub async fn stop(&self) {
        if let Some(tx) = self.stop_tx.lock().await.take() {
            let _ = tx.send(true);
        }
        *self.job_tx.lock().await = None;
    }
}

/// Ponte entre o status do `ws_client` (desacoplado do Tauri, testável sozinho)
/// e `AppState`/eventos do front. Também é quem cobre o "buraco" do push:
/// se o WS cair (ex.: instabilidade de rede) bem no momento em que um job é
/// criado no servidor, o push daquele job se perde — `pushJobReady` só manda
/// pra sockets conectados *naquele instante*, sem fila de retry. Sem isso
/// aqui, o job só seria pego na próxima vez que alguém clicasse em
/// "Reprocessar" manualmente. Por isso, toda vez que o status vira
/// `Connected` (primeira conexão OU reconexão depois de queda), dispara o
/// mesmo `reprocess_pending` do botão, em background.
async fn bridge_status(
    app: AppHandle,
    state: AppState,
    mut status_rx: watch::Receiver<ConnectionStatus>,
    api: ApiClient,
    token_provider: TokenProvider,
    paths: ProcessorPaths,
) {
    loop {
        let status = *status_rx.borrow();
        let snapshot = {
            let mut guard = state.lock().await;
            guard.connection = status;
            guard.snapshot()
        };
        if let Err(err) = app.emit("state-changed", snapshot) {
            warn!("Falha ao emitir state-changed na mudança de conexão: {err}");
        }

        if status == ConnectionStatus::Connected {
            let app = app.clone();
            let state = state.clone();
            let api = api.clone();
            let token_provider = token_provider.clone();
            let paths = paths.clone();
            tokio::spawn(async move {
                processor::reprocess_pending(&app, &state, &api, &token_provider, &paths).await;
            });
        }

        if status_rx.changed().await.is_err() {
            return; // ws_client encerrou, o sender foi dropado
        }
    }
}

fn to_ws_url(api_url: &str) -> String {
    let trimmed = api_url.trim_end_matches('/');
    let ws_base = if let Some(rest) = trimmed.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        format!("ws://{trimmed}")
    };
    format!("{ws_base}/print-agent/ws")
}
