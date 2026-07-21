use crate::state::PrintJob;
use serde::Deserialize;
use serde_json::json;
use thiserror::Error;

const DEVICE_TOKEN_HEADER: &str = "X-Print-Device-Token";

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("erro de rede: {0}")]
    Network(#[from] reqwest::Error),
    #[error("erro da API ({status}): {message}")]
    Api { status: u16, message: String },
}

#[derive(Debug, Clone, Deserialize)]
pub struct PairResponse {
    pub token: String,
    #[serde(rename = "deviceId")]
    pub device_id: String,
    #[serde(rename = "deviceName")]
    pub device_name: String,
    #[serde(rename = "pickupPrinter")]
    pub pickup_printer: Option<String>,
    #[serde(rename = "shippingPrinter")]
    pub shipping_printer: Option<String>,
}

/// Fala só com `/print-agent/*` — nunca com pedido, pagamento ou frete
/// diretamente. Nunca loga o token (nem em `Debug`, que não é derivado
/// para os headers/campos que o carregam).
#[derive(Clone)]
pub struct ApiClient {
    http: reqwest::Client,
    base_url: String,
}

impl ApiClient {
    pub fn new(api_url: &str) -> Self {
        Self {
            // Timeout explícito: sem ele, uma conexão que trava depois do TCP
            // connect (não só "sem internet"/recusada, mas um peer que aceita
            // e nunca responde) prenderia o processador de jobs pra sempre.
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
            base_url: format!("{}/api/v1", api_url.trim_end_matches('/')),
        }
    }

    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    pub async fn pair(&self, code: &str) -> Result<PairResponse, ApiError> {
        let res = self
            .http
            .post(format!("{}/print-agent/pair", self.base_url))
            .json(&json!({ "code": code }))
            .send()
            .await?;
        Self::parse(res).await
    }

    pub async fn list_claimable(&self, token: &str) -> Result<Vec<PrintJob>, ApiError> {
        let res = self
            .http
            .get(format!("{}/print-agent/jobs?status=READY", self.base_url))
            .header(DEVICE_TOKEN_HEADER, token)
            .send()
            .await?;
        Self::parse(res).await
    }

    pub async fn claim(&self, token: &str, job_id: &str) -> Result<PrintJob, ApiError> {
        let res = self
            .http
            .post(format!("{}/print-agent/jobs/{job_id}/claim", self.base_url))
            .header(DEVICE_TOKEN_HEADER, token)
            .send()
            .await?;
        Self::parse(res).await
    }

    pub async fn set_status(
        &self,
        token: &str,
        job_id: &str,
        status: &str,
        error: Option<&str>,
    ) -> Result<(), ApiError> {
        let mut body = json!({ "status": status });
        if let Some(err) = error {
            body["error"] = json!(err);
        }
        let res = self
            .http
            .patch(format!("{}/print-agent/jobs/{job_id}/status", self.base_url))
            .header(DEVICE_TOKEN_HEADER, token)
            .json(&body)
            .send()
            .await?;
        Self::parse::<serde_json::Value>(res).await?;
        Ok(())
    }

    async fn parse<T: for<'de> Deserialize<'de>>(res: reqwest::Response) -> Result<T, ApiError> {
        let status = res.status();
        if status.is_success() {
            Ok(res.json::<T>().await?)
        } else {
            let message = res.text().await.unwrap_or_default();
            Err(ApiError::Api { status: status.as_u16(), message })
        }
    }
}
