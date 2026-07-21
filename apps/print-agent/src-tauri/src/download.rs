use crate::state::JobType;
use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use thiserror::Error;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Error)]
pub enum DownloadError {
    #[error("erro de rede: {0}")]
    Network(#[from] reqwest::Error),
    #[error("erro de E/S: {0}")]
    Io(#[from] std::io::Error),
    #[error("documento inválido: {0}")]
    InvalidDocument(String),
}

/// Baixa `documentUrl` para a pasta de cache do app. Grava num `.part`
/// primeiro e só promove pro nome final depois de validar a assinatura do
/// arquivo — uma conexão cortada no meio nunca deixa um documento corrompido
/// pronto para ser impresso.
pub async fn download_document(
    client: &reqwest::Client,
    url: &str,
    job_type: JobType,
    cache_dir: &Path,
    job_id: &str,
) -> Result<PathBuf, DownloadError> {
    let ext = match job_type {
        JobType::Pickup => "png",
        JobType::Shipping => "pdf",
    };
    let dest = cache_dir.join(format!("{job_id}.{ext}"));
    let tmp = cache_dir.join(format!("{job_id}.{ext}.part"));

    tokio::fs::create_dir_all(cache_dir).await?;

    if let Err(err) = fetch_to_file(client, url, &tmp).await {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(err);
    }

    if let Err(err) = validate_document(&tmp, job_type).await {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(err);
    }

    tokio::fs::rename(&tmp, &dest).await?;
    Ok(dest)
}

async fn fetch_to_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
) -> Result<(), DownloadError> {
    let res = client.get(url).send().await?;
    if !res.status().is_success() {
        return Err(DownloadError::InvalidDocument(format!("HTTP {}", res.status())));
    }

    let mut file = tokio::fs::File::create(dest).await?;
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        file.write_all(&chunk?).await?;
    }
    file.flush().await?;
    Ok(())
}

async fn validate_document(path: &Path, job_type: JobType) -> Result<(), DownloadError> {
    let bytes = tokio::fs::read(path).await?;
    if bytes.is_empty() {
        return Err(DownloadError::InvalidDocument("arquivo vazio".into()));
    }

    let valid = match job_type {
        JobType::Pickup => bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]), // assinatura PNG
        JobType::Shipping => bytes.starts_with(b"%PDF"),
    };
    if !valid {
        return Err(DownloadError::InvalidDocument(
            "assinatura de arquivo inesperada (documento corrompido ou tipo errado)".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path as path_matcher};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn temp_cache_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("print-agent-test-{name}-{}", std::process::id()))
    }

    /// Timeout curto em todo cliente de teste — nunca deixa um teste de rede
    /// travar o processo inteiro se algo no ambiente impedir a conexão de
    /// progredir (visto na prática: um hang real em CI sem isso).
    fn test_client() -> reqwest::Client {
        reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build().unwrap()
    }

    fn png_bytes() -> Vec<u8> {
        vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3]
    }

    #[tokio::test]
    async fn baixa_e_valida_png_com_sucesso() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path_matcher("/label.png"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(png_bytes()))
            .mount(&server)
            .await;

        let cache_dir = temp_cache_dir("ok");
        let client = test_client();
        let result = download_document(
            &client,
            &format!("{}/label.png", server.uri()),
            JobType::Pickup,
            &cache_dir,
            "job-ok",
        )
        .await;

        assert!(result.is_ok());
        assert!(result.unwrap().exists());
        let _ = std::fs::remove_dir_all(&cache_dir);
    }

    #[tokio::test]
    async fn documento_invalido_conteudo_nao_e_png() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path_matcher("/not-a-png"))
            .respond_with(ResponseTemplate::new(200).set_body_string("isso não é uma imagem"))
            .mount(&server)
            .await;

        let cache_dir = temp_cache_dir("invalid");
        let client = test_client();
        let result = download_document(
            &client,
            &format!("{}/not-a-png", server.uri()),
            JobType::Pickup,
            &cache_dir,
            "job-invalid",
        )
        .await;

        assert!(matches!(result, Err(DownloadError::InvalidDocument(_))));
        assert!(!cache_dir.join("job-invalid.png").exists());
        assert!(!cache_dir.join("job-invalid.png.part").exists());
        let _ = std::fs::remove_dir_all(&cache_dir);
    }

    #[tokio::test]
    async fn sem_internet_porta_fechada_retorna_erro_de_rede() {
        // Reserva uma porta e fecha o listener na hora — a próxima conexão
        // recebe "connection refused" quase instantaneamente (simula "sem
        // internet"/servidor inalcançável).
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        drop(listener);

        let cache_dir = temp_cache_dir("no-internet");
        let client = test_client();
        let result = download_document(
            &client,
            &format!("http://{addr}/label.png"),
            JobType::Pickup,
            &cache_dir,
            "job-no-internet",
        )
        .await;

        assert!(matches!(result, Err(DownloadError::Network(_))));
        let _ = std::fs::remove_dir_all(&cache_dir);
    }

    #[tokio::test]
    async fn download_interrompido_nao_deixa_arquivo_parcial() {
        use tokio::io::AsyncWriteExt;
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let _ = socket
                    .write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 1000\r\nConnection: close\r\n\r\n",
                    )
                    .await;
                let _ = socket.write_all(&[0x89, 0x50, 0x4E, 0x47, 1, 2, 3, 4, 5, 6]).await;
                let _ = socket.flush().await;
                // Fecha antes de completar os 1000 bytes prometidos no Content-Length.
                drop(socket);
            }
        });

        let cache_dir = temp_cache_dir("interrupted");
        let client = test_client();
        let result = download_document(
            &client,
            &format!("http://{addr}/label.png"),
            JobType::Pickup,
            &cache_dir,
            "job-interrupted",
        )
        .await;

        assert!(result.is_err());
        assert!(!cache_dir.join("job-interrupted.png").exists());
        assert!(!cache_dir.join("job-interrupted.png.part").exists());
        let _ = std::fs::remove_dir_all(&cache_dir);
    }
}
