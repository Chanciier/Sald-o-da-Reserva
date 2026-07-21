mod api_client;
mod commands;
mod download;
mod logging;
mod print;
mod printers;
mod processor;
mod runtime;
mod state;
mod storage;
mod tray;
mod ws_client;

use runtime::AgentRuntime;
use state::{AppState, AppStateInner};
use std::sync::Arc;
use tauri::{Manager, WindowEvent};
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();

            let log_dir = app.path().app_log_dir()?;
            let guard = logging::init(&log_dir);
            app.manage(guard);

            let config = storage::load_config(&handle);
            let app_state: AppState = Arc::new(Mutex::new(AppStateInner::new(config.clone())));
            app.manage(app_state.clone());

            let cache_dir = app.path().app_cache_dir()?.join("documents");
            let resource_dir = app.path().resource_dir()?;
            let sumatra_path = resource_dir.join("resources").join("SumatraPDF.exe");
            app.manage(AgentRuntime::new(processor::ProcessorPaths { cache_dir, sumatra_path }));

            tray::build(&handle)?;

            // Fechar a janela só esconde — o agente continua rodando em
            // segundo plano (bandeja) recebendo e imprimindo PrintJobs.
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            // Já pareado de uma sessão anterior (config + token no keyring)?
            // Conecta sozinho, sem esperar clique em "Conectar".
            if let (Some(api_url), Some(token)) = (config.api_url.clone(), storage::load_token()) {
                let handle2 = handle.clone();
                let state2 = app_state.clone();
                tauri::async_runtime::spawn(async move {
                    let runtime = handle2.state::<AgentRuntime>();
                    runtime.start(handle2.clone(), state2, api_url, token).await;
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::pair,
            commands::connect,
            commands::disconnect,
            commands::pause,
            commands::resume,
            commands::reprocess,
            commands::test_print,
            commands::list_printers,
            commands::save_settings,
            commands::open_logs_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
