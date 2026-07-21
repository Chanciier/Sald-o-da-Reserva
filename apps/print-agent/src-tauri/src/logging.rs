use std::path::Path;
use tracing_appender::non_blocking::WorkerGuard;

/// Logs em arquivo rotativo diário na pasta de logs do app (conexão, erro,
/// impressão, tempo). Regra: nenhum call site em todo o projeto deve logar o
/// device token ou o header `X-Print-Device-Token` — `api_client.rs` e
/// `ws_client.rs` nunca passam esse valor para `tracing`.
///
/// O `WorkerGuard` retornado precisa ficar vivo pelo tempo de vida do app
/// (guardado em `AppState`/contexto do `main.rs`); se for descartado, o
/// writer não-bloqueante para de escrever.
pub fn init(log_dir: &Path) -> WorkerGuard {
    let _ = std::fs::create_dir_all(log_dir);
    let file_appender = tracing_appender::rolling::daily(log_dir, "print-agent.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::fmt()
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    guard
}
