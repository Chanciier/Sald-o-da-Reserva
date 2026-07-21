use crate::state::AgentConfig;
use keyring::Entry;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use tracing::warn;

const KEYRING_SERVICE: &str = "SaldaoPrintAgent";
const KEYRING_TOKEN_KEY: &str = "device-token";
const CONFIG_STORE_FILE: &str = "config.json";
const CONFIG_KEY: &str = "config";

/// Token do device: SEMPRE no Windows Credential Manager, nunca em disco em
/// texto puro. `keyring` cuida da criptografia/isolamento por usuário do SO.
pub fn save_token(token: &str) -> Result<(), keyring::Error> {
    Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_KEY)?.set_password(token)
}

pub fn load_token() -> Option<String> {
    match Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_KEY) {
        Ok(entry) => entry.get_password().ok(),
        Err(err) => {
            warn!("Falha ao acessar o keyring: {err}");
            None
        }
    }
}

/// Configuração não-secreta (URL da API, impressoras, cópias, device
/// id/nome) — JSON simples via `tauri-plugin-store`, sem nada sensível.
pub fn load_config(app: &AppHandle) -> AgentConfig {
    let store = match app.store(CONFIG_STORE_FILE) {
        Ok(store) => store,
        Err(err) => {
            warn!("Falha ao abrir o config store: {err}");
            return AgentConfig::default();
        }
    };
    match store.get(CONFIG_KEY) {
        Some(value) => serde_json::from_value(value).unwrap_or_else(|err| {
            warn!("Falha ao interpretar config salva, usando padrão: {err}");
            AgentConfig::default()
        }),
        None => AgentConfig::default(),
    }
}

pub fn save_config(app: &AppHandle, config: &AgentConfig) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.store(CONFIG_STORE_FILE)?;
    store.set(CONFIG_KEY.to_string(), serde_json::to_value(config)?);
    store.save()?;
    Ok(())
}
