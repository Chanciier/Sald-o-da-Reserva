use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;

const HISTORY_CAP: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum JobType {
    Pickup,
    Shipping,
}

/// Mesmo formato devolvido pelo backend em `GET/POST /print-agent/*` e no
/// push `{"type":"job","job":{...}}` do WebSocket.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PrintJob {
    pub id: String,
    #[serde(rename = "orderId")]
    pub order_id: String,
    #[serde(rename = "type")]
    pub job_type: JobType,
    #[serde(rename = "documentUrl")]
    pub document_url: Option<String>,
    #[serde(default = "default_copies")]
    pub copies: i32,
}

fn default_copies() -> i32 {
    1
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub job_id: String,
    pub order_id: String,
    pub job_type: JobType,
    /// "PRINTED" ou "FAILED"
    pub status: String,
    pub message: Option<String>,
    pub at: DateTime<Utc>,
}

/// Configuração não-secreta, persistida via `tauri-plugin-store`. O token do
/// device NUNCA fica aqui — vai só para o `keyring` (ver `storage.rs`).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentConfig {
    pub api_url: Option<String>,
    pub device_id: Option<String>,
    pub device_name: Option<String>,
    pub pickup_printer: Option<String>,
    pub shipping_printer: Option<String>,
    #[serde(default = "default_copies_u32")]
    pub copies: u32,
    #[serde(default)]
    pub autostart: bool,
}

fn default_copies_u32() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub connection: ConnectionStatus,
    pub paired: bool,
    pub device_name: Option<String>,
    pub pickup_printer: Option<String>,
    pub shipping_printer: Option<String>,
    pub copies: u32,
    pub autostart: bool,
    pub paused: bool,
    pub pending: Vec<PrintJob>,
    pub history: Vec<HistoryEntry>,
    pub last_print: Option<HistoryEntry>,
}

pub struct AppStateInner {
    pub connection: ConnectionStatus,
    pub config: AgentConfig,
    pub paused: bool,
    pub pending: Vec<PrintJob>,
    pub history: VecDeque<HistoryEntry>,
    pub last_print: Option<HistoryEntry>,
}

impl AppStateInner {
    pub fn new(config: AgentConfig) -> Self {
        Self {
            connection: ConnectionStatus::Disconnected,
            config,
            paused: false,
            pending: Vec::new(),
            history: VecDeque::new(),
            last_print: None,
        }
    }

    pub fn snapshot(&self) -> AppSnapshot {
        AppSnapshot {
            connection: self.connection,
            paired: self.config.device_id.is_some(),
            device_name: self.config.device_name.clone(),
            pickup_printer: self.config.pickup_printer.clone(),
            shipping_printer: self.config.shipping_printer.clone(),
            copies: self.config.copies,
            autostart: self.config.autostart,
            paused: self.paused,
            pending: self.pending.clone(),
            history: self.history.iter().cloned().collect(),
            last_print: self.last_print.clone(),
        }
    }

    pub fn push_pending(&mut self, job: PrintJob) {
        if self.pending.iter().any(|j| j.id == job.id) {
            return; // já está na lista — evita duplicar na UI
        }
        self.pending.push(job);
    }

    pub fn remove_pending(&mut self, job_id: &str) {
        self.pending.retain(|j| j.id != job_id);
    }

    pub fn record_result(&mut self, entry: HistoryEntry) {
        self.remove_pending(&entry.job_id);
        self.last_print = Some(entry.clone());
        self.history.push_front(entry);
        while self.history.len() > HISTORY_CAP {
            self.history.pop_back();
        }
    }
}

pub type AppState = Arc<Mutex<AppStateInner>>;
