use crate::api_client::ApiClient;
use crate::download::download_document;
use crate::print::{print_image, print_pdf, PrintError};
use crate::state::{AppState, HistoryEntry, JobType, PrintJob};
use chrono::Utc;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::Receiver;
use tracing::{info, warn};

#[derive(Clone)]
pub struct ProcessorPaths {
    pub cache_dir: PathBuf,
    pub sumatra_path: PathBuf,
}

pub type TokenProvider = Arc<dyn Fn() -> Option<String> + Send + Sync>;

#[derive(Debug, thiserror::Error)]
enum ProcessError {
    #[error("{0}")]
    Api(#[from] crate::api_client::ApiError),
    #[error("{0}")]
    Download(#[from] crate::download::DownloadError),
    #[error("{0}")]
    Print(#[from] PrintError),
    #[error("documento não recebido para este job")]
    MissingDocument,
    #[error("dispositivo ainda não pareado")]
    NotPaired,
}

/// Consome jobs recebidos do `ws_client` (via canal) um de cada vez — nunca
/// concorrente, para não disputar a mesma impressora física. Se o agente
/// estiver pausado, o job fica visível em "Pendentes" mas não é processado
/// até "Retomar"/"Reprocessar".
pub async fn run(
    app: AppHandle,
    state: AppState,
    api: ApiClient,
    token_provider: TokenProvider,
    paths: ProcessorPaths,
    mut job_rx: Receiver<PrintJob>,
) {
    while let Some(job) = job_rx.recv().await {
        {
            let mut guard = state.lock().await;
            guard.push_pending(job.clone());
            emit(&app, guard.snapshot());
        }

        let paused = state.lock().await.paused;
        if paused {
            info!("Job {} recebido, mas o agente está pausado — mantido em pendentes", job.id);
            continue;
        }

        process_job(&state, &api, &token_provider, &paths, job).await;
        emit(&app, state.lock().await.snapshot());
    }
}

/// Usado por "Reprocessar"/"Retomar": consulta a fila do servidor de novo
/// (cobre o caso de ter perdido um push por estar offline) e tenta processar
/// tudo que estiver em pendentes agora.
pub async fn reprocess_pending(
    app: &AppHandle,
    state: &AppState,
    api: &ApiClient,
    token_provider: &TokenProvider,
    paths: &ProcessorPaths,
) {
    if let Some(token) = token_provider() {
        match api.list_claimable(&token).await {
            Ok(jobs) => {
                let mut guard = state.lock().await;
                for job in jobs {
                    guard.push_pending(job);
                }
                emit(app, guard.snapshot());
            }
            Err(err) => warn!("Falha ao consultar jobs pendentes no servidor: {err}"),
        }
    }

    let pending = state.lock().await.pending.clone();
    for job in pending {
        process_job(state, api, token_provider, paths, job).await;
        emit(app, state.lock().await.snapshot());
    }
}

/// Núcleo testável: reivindica, baixa, imprime e reporta o resultado — sem
/// nenhuma dependência do Tauri (`AppHandle`). Quem chama e tem acesso ao
/// `AppHandle` (`run`/`reprocess_pending`) é responsável por emitir o
/// snapshot atualizado pro front depois.
///
/// Importante: só reportamos status (`PATCH .../status`) para o servidor
/// **depois** que o `claim` teve sucesso — antes disso o device não é dono
/// do job (ex.: outro device já reivindicou primeiro, caso de duplicidade),
/// e tentar reportar status geraria uma segunda requisição sem sentido e
/// que o servidor rejeitaria de qualquer forma.
pub async fn process_job(
    state: &AppState,
    api: &ApiClient,
    token_provider: &TokenProvider,
    paths: &ProcessorPaths,
    job: PrintJob,
) -> HistoryEntry {
    let entry = match token_provider() {
        None => {
            warn!("Job {} ignorado: dispositivo ainda não pareado", job.id);
            finished(&job, Err(ProcessError::NotPaired))
        }
        Some(token) => match api.claim(&token, &job.id).await {
            Err(err) => {
                warn!("Job {} não pôde ser reivindicado: {err}", job.id);
                finished(&job, Err(ProcessError::Api(err)))
            }
            Ok(claimed) => {
                let result = finish_processing(api, &token, paths, state, &claimed).await;
                if let Err(err) = &result {
                    warn!("Job {} falhou: {err}", job.id);
                }
                let (status, message) = status_and_message(&result);
                // Best-effort — se a rede cair bem aqui, o job já foi
                // reivindicado por este device e o admin consegue reimprimir
                // pelo painel de qualquer forma.
                let _ = api.set_status(&token, &job.id, &status, message.as_deref()).await;
                finished(&job, result)
            }
        },
    };

    state.lock().await.record_result(entry.clone());
    entry
}

fn status_and_message(result: &Result<(), ProcessError>) -> (String, Option<String>) {
    match result {
        Ok(()) => ("PRINTED".to_string(), None),
        Err(err) => ("FAILED".to_string(), Some(err.to_string())),
    }
}

fn finished(job: &PrintJob, result: Result<(), ProcessError>) -> HistoryEntry {
    let (status, message) = status_and_message(&result);
    HistoryEntry {
        job_id: job.id.clone(),
        order_id: job.order_id.clone(),
        job_type: job.job_type,
        status,
        message,
        at: Utc::now(),
    }
}

/// Baixa e imprime um job **já reivindicado** (o `claim` já aconteceu em
/// `process_job`) — o device já é dono do job a partir daqui.
async fn finish_processing(
    api: &ApiClient,
    token: &str,
    paths: &ProcessorPaths,
    state: &AppState,
    claimed: &PrintJob,
) -> Result<(), ProcessError> {
    let document_url = claimed.document_url.as_deref().ok_or(ProcessError::MissingDocument)?;

    let _ = api.set_status(token, &claimed.id, "PRINTING", None).await;

    let path =
        download_document(api.http(), document_url, claimed.job_type, &paths.cache_dir, &claimed.id)
            .await?;

    let (printer, copies) = {
        let guard = state.lock().await;
        let printer = match claimed.job_type {
            JobType::Pickup => guard.config.pickup_printer.clone(),
            JobType::Shipping => guard.config.shipping_printer.clone(),
        };
        (printer, guard.config.copies)
    };
    let printer = printer.ok_or(PrintError::NoPrinterConfigured)?;

    match claimed.job_type {
        JobType::Pickup => {
            let sumatra = paths.sumatra_path.clone();
            let path = path.clone();
            let printer = printer.clone();
            tokio::task::spawn_blocking(move || print_image(&sumatra, &path, &printer, copies))
                .await
                .expect("thread de impressão travou")?;
        }
        JobType::Shipping => {
            let sumatra = paths.sumatra_path.clone();
            let printer = printer.clone();
            tokio::task::spawn_blocking(move || print_pdf(&sumatra, &path, &printer, copies))
                .await
                .expect("thread de impressão travou")?;
        }
    }

    Ok(())
}

fn emit(app: &AppHandle, snapshot: crate::state::AppSnapshot) {
    let _ = app.emit("state-changed", snapshot);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AgentConfig, AppStateInner};
    use tokio::sync::Mutex;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn test_state(config: AgentConfig) -> AppState {
        Arc::new(Mutex::new(AppStateInner::new(config)))
    }

    fn test_paths() -> ProcessorPaths {
        ProcessorPaths {
            cache_dir: std::env::temp_dir().join(format!("print-agent-proc-test-{}", std::process::id())),
            sumatra_path: PathBuf::from("does-not-matter-for-these-tests.exe"),
        }
    }

    fn token_provider() -> TokenProvider {
        Arc::new(|| Some("test-token".to_string()))
    }

    fn sample_job() -> PrintJob {
        PrintJob {
            id: "job-1".to_string(),
            order_id: "order-1".to_string(),
            job_type: JobType::Pickup,
            document_url: Some("/doc.png".to_string()),
            copies: 1,
        }
    }

    #[tokio::test]
    async fn duplicidade_claim_ja_reivindicado_nao_imprime() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/v1/print-agent/jobs/job-1/claim"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "message": "Job já foi reivindicado por outro dispositivo (status atual: SENT)."
            })))
            .mount(&server)
            .await;

        let api = ApiClient::new(&server.uri());
        let state = test_state(AgentConfig {
            pickup_printer: Some("Impressora Teste".to_string()),
            ..Default::default()
        });

        let entry = process_job(&state, &api, &token_provider(), &test_paths(), sample_job()).await;

        assert_eq!(entry.status, "FAILED");
        assert!(entry.message.unwrap().contains("reivindicado"));
        // Nenhuma chamada de status (PRINTING/PRINTED/FAILED) foi feita — o
        // claim falhou antes de qualquer outra requisição.
        assert_eq!(server.received_requests().await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn sem_impressora_configurada_reporta_falha_ao_servidor() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/v1/print-agent/jobs/job-1/claim"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": "job-1",
                "orderId": "order-1",
                "type": "PICKUP",
                "documentUrl": format!("{}/doc.png", server.uri()),
                "copies": 1,
            })))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/doc.png"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![0x89, 0x50, 0x4E, 0x47, 1, 2, 3]))
            .mount(&server)
            .await;
        Mock::given(method("PATCH"))
            .and(path("/api/v1/print-agent/jobs/job-1/status"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;

        let api = ApiClient::new(&server.uri());
        // Sem pickup_printer configurada — deve falhar em NoPrinterConfigured
        // sem nunca chamar um processo de impressão real.
        let state = test_state(AgentConfig::default());

        let entry = process_job(&state, &api, &token_provider(), &test_paths(), sample_job()).await;

        assert_eq!(entry.status, "FAILED");
        assert!(entry.message.unwrap().contains("impressora"));

        let requests = server.received_requests().await.unwrap();
        let statuses: Vec<_> = requests
            .iter()
            .filter(|r| r.url.path().ends_with("/status"))
            .collect();
        assert!(
            statuses.iter().any(|r| {
                let body: serde_json::Value = serde_json::from_slice(&r.body).unwrap();
                body["status"] == "FAILED"
            }),
            "esperava um PATCH .../status com status=FAILED"
        );

        let _ = std::fs::remove_dir_all(&test_paths().cache_dir);
    }

    #[tokio::test]
    async fn documento_ausente_no_job_reivindicado_falha_sem_baixar_nada() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/v1/print-agent/jobs/job-1/claim"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": "job-1",
                "orderId": "order-1",
                "type": "PICKUP",
                "documentUrl": null,
                "copies": 1,
            })))
            .mount(&server)
            .await;
        Mock::given(method("PATCH"))
            .and(path("/api/v1/print-agent/jobs/job-1/status"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;

        let api = ApiClient::new(&server.uri());
        let state = test_state(AgentConfig {
            pickup_printer: Some("Impressora Teste".to_string()),
            ..Default::default()
        });

        let entry = process_job(&state, &api, &token_provider(), &test_paths(), sample_job()).await;

        assert_eq!(entry.status, "FAILED");
        // claim + status(FAILED) — nunca um GET de download.
        let requests = server.received_requests().await.unwrap();
        assert!(requests.iter().all(|r| r.method.as_str() != "GET"));
    }

    #[tokio::test]
    async fn job_pendente_e_removido_da_lista_apos_processar() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/v1/print-agent/jobs/job-1/claim"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;

        let api = ApiClient::new(&server.uri());
        let state = test_state(AgentConfig::default());
        state.lock().await.push_pending(sample_job());
        assert_eq!(state.lock().await.pending.len(), 1);

        process_job(&state, &api, &token_provider(), &test_paths(), sample_job()).await;

        assert_eq!(state.lock().await.pending.len(), 0);
        assert_eq!(state.lock().await.history.len(), 1);
    }
}
