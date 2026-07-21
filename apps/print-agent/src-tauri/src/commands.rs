use crate::api_client::ApiClient;
use crate::print::{generate_test_label, print_image};
use crate::processor;
use crate::runtime::AgentRuntime;
use crate::state::{AppSnapshot, AppState};
use crate::storage;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

/// Comandos expostos ao front. Cada um só fala com `/print-agent/*` (via
/// `ApiClient`) e com o próprio sistema (impressora/disco/keyring) — nunca
/// com Mercado Pago, Melhor Envio ou qualquer outra parte do backend.

#[tauri::command]
pub async fn get_state(state: State<'_, AppState>) -> Result<AppSnapshot, String> {
    Ok(state.lock().await.snapshot())
}

#[tauri::command]
pub async fn pair(
    app: AppHandle,
    state: State<'_, AppState>,
    runtime: State<'_, AgentRuntime>,
    api_url: String,
    code: String,
) -> Result<AppSnapshot, String> {
    let api = ApiClient::new(&api_url);
    let response = api.pair(&code).await.map_err(|e| e.to_string())?;

    storage::save_token(&response.token).map_err(|e| e.to_string())?;

    let config = {
        let mut guard = state.lock().await;
        guard.config.api_url = Some(api_url.clone());
        guard.config.device_id = Some(response.device_id.clone());
        guard.config.device_name = Some(response.device_name.clone());
        guard.config.pickup_printer = response.pickup_printer.clone();
        guard.config.shipping_printer = response.shipping_printer.clone();
        guard.config.clone()
    };
    storage::save_config(&app, &config).map_err(|e| e.to_string())?;

    runtime.start(app.clone(), state.inner().clone(), api_url, response.token).await;

    let snapshot = state.lock().await.snapshot();
    let _ = app.emit("state-changed", snapshot.clone());
    Ok(snapshot)
}

#[tauri::command]
pub async fn connect(
    app: AppHandle,
    state: State<'_, AppState>,
    runtime: State<'_, AgentRuntime>,
) -> Result<(), String> {
    let api_url = state
        .lock()
        .await
        .config
        .api_url
        .clone()
        .ok_or_else(|| "Dispositivo ainda não pareado.".to_string())?;
    let token =
        storage::load_token().ok_or_else(|| "Token não encontrado — pareie novamente.".to_string())?;
    runtime.start(app, state.inner().clone(), api_url, token).await;
    Ok(())
}

#[tauri::command]
pub async fn disconnect(runtime: State<'_, AgentRuntime>) -> Result<(), String> {
    runtime.stop().await;
    Ok(())
}

#[tauri::command]
pub async fn pause(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.lock().await;
    guard.paused = true;
    let _ = app.emit("state-changed", guard.snapshot());
    Ok(())
}

#[tauri::command]
pub async fn resume(
    app: AppHandle,
    state: State<'_, AppState>,
    runtime: State<'_, AgentRuntime>,
) -> Result<(), String> {
    {
        let mut guard = state.lock().await;
        guard.paused = false;
        let _ = app.emit("state-changed", guard.snapshot());
    }
    reprocess(app, state, runtime).await
}

#[tauri::command]
pub async fn reprocess(
    app: AppHandle,
    state: State<'_, AppState>,
    runtime: State<'_, AgentRuntime>,
) -> Result<(), String> {
    let api_url = state
        .lock()
        .await
        .config
        .api_url
        .clone()
        .ok_or_else(|| "Dispositivo ainda não pareado.".to_string())?;
    let api = ApiClient::new(&api_url);
    let token_provider: processor::TokenProvider = Arc::new(storage::load_token);
    processor::reprocess_pending(&app, state.inner(), &api, &token_provider, &runtime.paths).await;
    Ok(())
}

#[tauri::command]
pub async fn test_print(
    state: State<'_, AppState>,
    runtime: State<'_, AgentRuntime>,
    target: String,
) -> Result<(), String> {
    let (printer, copies) = {
        let guard = state.lock().await;
        let printer = if target == "shipping" {
            guard.config.shipping_printer.clone()
        } else {
            guard.config.pickup_printer.clone()
        };
        (printer, guard.config.copies)
    };
    let printer =
        printer.ok_or_else(|| "Nenhuma impressora configurada para este tipo.".to_string())?;
    let cache_dir = runtime.paths.cache_dir.clone();
    let sumatra_path = runtime.paths.sumatra_path.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let path = generate_test_label(&cache_dir).map_err(|e| e.to_string())?;
        print_image(&sumatra_path, &path, &printer, copies.max(1)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(())
}

#[tauri::command]
pub fn list_printers() -> Vec<String> {
    crate::printers::list_printers()
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsInput {
    pub pickup_printer: Option<String>,
    pub shipping_printer: Option<String>,
    pub copies: u32,
    pub autostart: bool,
}

#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    input: SettingsInput,
) -> Result<AppSnapshot, String> {
    let config = {
        let mut guard = state.lock().await;
        guard.config.pickup_printer = input.pickup_printer;
        guard.config.shipping_printer = input.shipping_printer;
        guard.config.copies = input.copies.max(1);
        guard.config.autostart = input.autostart;
        guard.config.clone()
    };
    storage::save_config(&app, &config).map_err(|e| e.to_string())?;

    use tauri_plugin_autostart::ManagerExt;
    let auto = app.autolaunch();
    let result = if config.autostart { auto.enable() } else { auto.disable() };
    result.map_err(|e| e.to_string())?;

    let snapshot = state.lock().await.snapshot();
    let _ = app.emit("state-changed", snapshot.clone());
    Ok(snapshot)
}

#[tauri::command]
pub fn open_logs_folder(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::process::Command::new("explorer").arg(dir).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
