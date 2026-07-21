use crate::state::{ConnectionStatus, PrintJob};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::time::Duration;
use tokio::sync::mpsc::Sender;
use tokio::sync::watch;
use tokio::time::sleep;
use tokio_tungstenite::tungstenite::Message;
use tracing::{info, warn};

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(25);
const MIN_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum ServerMessage {
    Connected {
        #[serde(rename = "deviceId")]
        #[allow(dead_code)]
        device_id: String,
    },
    Job {
        job: PrintJob,
    },
    Pong,
}

/// Conecta em `{ws_base_url}?token=...`, reconecta com backoff exponencial
/// (1s → 30s) sempre que a conexão cai, e manda heartbeat de aplicação a
/// cada 25s (além do ping/pong de protocolo que o `tokio-tungstenite` já
/// responde sozinho). Nunca loga o token — só monta a URL com ele.
///
/// Deliberadamente sem nenhuma dependência do Tauri (`AppHandle`/`AppState`)
/// — só reporta mudanças de status via `status_tx`. Quem gerencia o estado
/// visível (`runtime.rs`) assina esse canal e ponte para `AppState`/eventos.
/// Isso deixa a lógica de reconexão testável sem precisar mockar o Tauri.
pub async fn run(
    status_tx: watch::Sender<ConnectionStatus>,
    ws_base_url: String,
    token: String,
    job_tx: Sender<PrintJob>,
    mut stop_rx: watch::Receiver<bool>,
) {
    let mut backoff = MIN_BACKOFF;

    loop {
        if *stop_rx.borrow() {
            return;
        }

        let _ = status_tx.send(ConnectionStatus::Connecting);
        let url = format!("{ws_base_url}?token={token}");

        match tokio_tungstenite::connect_async(url).await {
            Ok((stream, _)) => {
                info!("Print Agent WS conectado");
                backoff = MIN_BACKOFF;
                let _ = status_tx.send(ConnectionStatus::Connected);

                let (mut write, mut read) = stream.split();
                let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
                heartbeat.tick().await; // primeiro tick é imediato — descarta

                'connection: loop {
                    tokio::select! {
                        _ = heartbeat.tick() => {
                            let ping = Message::Text(r#"{"type":"heartbeat"}"#.to_string().into());
                            if write.send(ping).await.is_err() {
                                warn!("Print Agent WS: falha ao enviar heartbeat");
                                break 'connection;
                            }
                        }
                        msg = read.next() => {
                            match msg {
                                Some(Ok(Message::Text(text))) => handle_message(&text, &job_tx).await,
                                Some(Ok(Message::Close(_))) | None => {
                                    warn!("Print Agent WS: conexão encerrada pelo servidor");
                                    break 'connection;
                                }
                                Some(Err(err)) => {
                                    warn!("Print Agent WS: erro de leitura: {err}");
                                    break 'connection;
                                }
                                _ => {}
                            }
                        }
                        changed = stop_rx.changed() => {
                            if changed.is_ok() && *stop_rx.borrow() {
                                let _ = write.send(Message::Close(None)).await;
                                let _ = status_tx.send(ConnectionStatus::Disconnected);
                                return;
                            }
                        }
                    }
                }
            }
            Err(err) => {
                warn!("Print Agent WS: falha ao conectar: {err}");
            }
        }

        if *stop_rx.borrow() {
            let _ = status_tx.send(ConnectionStatus::Disconnected);
            return;
        }

        let _ = status_tx.send(ConnectionStatus::Reconnecting);
        sleep(backoff).await;
        backoff = (backoff * 2).min(MAX_BACKOFF);
    }
}

async fn handle_message(text: &str, job_tx: &Sender<PrintJob>) {
    match serde_json::from_str::<ServerMessage>(text) {
        Ok(ServerMessage::Job { job }) => {
            let _ = job_tx.send(job).await;
        }
        Ok(ServerMessage::Connected { .. }) | Ok(ServerMessage::Pong) => {}
        Err(err) => warn!("Print Agent WS: mensagem não reconhecida: {err}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::net::TcpListener;
    use tokio::sync::mpsc;
    use tokio_tungstenite::tungstenite::Message as WsMessage;

    /// Servidor WS mínimo: aceita conexões, manda `{"type":"connected",...}`,
    /// e fecha logo em seguida — simula quedas de conexão para forçar
    /// reconexão. Conta quantas vezes aceitou uma conexão.
    async fn spawn_flaky_server(accepts_before_stable: usize) -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let accept_count = Arc::new(AtomicUsize::new(0));
        let counter = accept_count.clone();

        tokio::spawn(async move {
            loop {
                let Ok((socket, _)) = listener.accept().await else { break };
                let n = counter.fetch_add(1, Ordering::SeqCst);
                let mut ws = match tokio_tungstenite::accept_async(socket).await {
                    Ok(ws) => ws,
                    Err(_) => continue,
                };
                let _ = ws
                    .send(WsMessage::Text(r#"{"type":"connected","deviceId":"d1"}"#.to_string().into()))
                    .await;

                if n + 1 < accepts_before_stable {
                    // Derruba a conexão de propósito — o client deve reconectar.
                    let _ = ws.close(None).await;
                } else {
                    // Estabiliza: mantém a conexão aberta lendo mensagens (heartbeat) indefinidamente.
                    while ws.next().await.is_some() {}
                }
            }
        });

        // Precisa de um path antes do `?token=...` que `run()` acrescenta —
        // sem isso o request-target fica malformado (`GET ?token=... HTTP/1.1`).
        (format!("ws://{addr}/"), accept_count)
    }

    /// Espera até `predicate(*status_rx.borrow())` ser verdadeiro, com timeout —
    /// nunca deixa um teste travar o processo inteiro se algo no ambiente
    /// (firewall, DNS, o que for) fizer a conexão nunca progredir.
    async fn wait_for_status(
        status_rx: &mut watch::Receiver<ConnectionStatus>,
        predicate: impl Fn(ConnectionStatus) -> bool,
        timeout: Duration,
    ) -> Result<(), &'static str> {
        tokio::time::timeout(timeout, async {
            loop {
                if predicate(*status_rx.borrow()) {
                    return;
                }
                if status_rx.changed().await.is_err() {
                    return; // canal fechado — o loop de fora falha ao checar o predicate
                }
            }
        })
        .await
        .map_err(|_| "timeout esperando o status esperado")
    }

    #[tokio::test]
    async fn reconecta_automaticamente_apos_conexao_cair() {
        let (ws_url, accept_count) = spawn_flaky_server(3).await;

        let (status_tx, mut status_rx) = watch::channel(ConnectionStatus::Disconnected);
        let (job_tx, _job_rx) = mpsc::channel(8);
        let (_stop_tx, stop_rx) = watch::channel(false);

        let handle = tokio::spawn(run(status_tx, ws_url, "token".to_string(), job_tx, stop_rx));

        // 1ª conexão (será derrubada pelo server).
        wait_for_status(&mut status_rx, |s| s == ConnectionStatus::Connected, Duration::from_secs(10))
            .await
            .unwrap();
        // Depois de cair, o client deve voltar a tentar conectar — prova de reconexão.
        wait_for_status(&mut status_rx, |s| s == ConnectionStatus::Connecting, Duration::from_secs(10))
            .await
            .unwrap();
        // E conectar de novo.
        wait_for_status(&mut status_rx, |s| s == ConnectionStatus::Connected, Duration::from_secs(10))
            .await
            .unwrap();

        assert!(accept_count.load(Ordering::SeqCst) >= 2, "esperava pelo menos 2 tentativas de conexão");

        handle.abort();
    }

    #[tokio::test]
    async fn recebe_job_pusheado_pelo_servidor() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            if let Ok((socket, _)) = listener.accept().await {
                let mut ws = tokio_tungstenite::accept_async(socket).await.unwrap();
                let job = r#"{"type":"job","job":{"id":"job-1","orderId":"order-1","type":"PICKUP","documentUrl":"https://cdn.example.com/x.png","copies":1}}"#;
                let _ = ws.send(WsMessage::Text(job.to_string().into())).await;
                while ws.next().await.is_some() {}
            }
        });

        let (status_tx, _status_rx) = watch::channel(ConnectionStatus::Disconnected);
        let (job_tx, mut job_rx) = mpsc::channel(8);
        let (_stop_tx, stop_rx) = watch::channel(false);

        let handle = tokio::spawn(run(status_tx, format!("ws://{addr}/"), "token".to_string(), job_tx, stop_rx));

        let job = tokio::time::timeout(Duration::from_secs(5), job_rx.recv())
            .await
            .expect("timeout esperando job")
            .expect("canal fechado sem job");

        assert_eq!(job.id, "job-1");
        handle.abort();
    }

    #[tokio::test]
    async fn stop_encerra_a_conexao_de_forma_limpa() {
        let (ws_url, _accept_count) = spawn_flaky_server(100).await; // nunca derruba sozinho

        let (status_tx, mut status_rx) = watch::channel(ConnectionStatus::Disconnected);
        let (job_tx, _job_rx) = mpsc::channel(8);
        let (stop_tx, stop_rx) = watch::channel(false);

        let handle = tokio::spawn(run(status_tx, ws_url, "token".to_string(), job_tx, stop_rx));

        // Espera conectar antes de pedir para parar.
        wait_for_status(&mut status_rx, |s| s == ConnectionStatus::Connected, Duration::from_secs(10))
            .await
            .unwrap();

        stop_tx.send(true).unwrap();

        tokio::time::timeout(Duration::from_secs(5), handle)
            .await
            .expect("run() não encerrou a tempo depois do stop")
            .unwrap();
    }
}
