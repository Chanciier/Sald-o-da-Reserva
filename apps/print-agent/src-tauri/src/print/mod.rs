mod image_print;
mod pdf_print;
mod test_label;

pub use image_print::print_image;
pub use pdf_print::print_pdf;
pub use test_label::generate_test_label;

use std::process::Command;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PrintError {
    #[error("falha ao iniciar o processo de impressão: {0}")]
    Spawn(#[from] std::io::Error),
    #[error("impressora retornou erro (código {0:?})")]
    NonZeroExit(Option<i32>),
    #[error("nenhuma impressora configurada para este tipo de etiqueta")]
    NoPrinterConfigured,
}

/// Executa `build()` uma vez por cópia, parando na primeira falha — spawn
/// (ex.: "impressora offline"/driver ausente) ou saída não-zero (ex.: "falha
/// de impressão"). Compartilhado por `print_image`/`print_pdf` e testável
/// isoladamente com qualquer `Command`, sem depender de uma impressora real.
pub(crate) fn run_copies(mut build: impl FnMut() -> Command, copies: u32) -> Result<(), PrintError> {
    for _ in 0..copies.max(1) {
        let status = build().status()?;
        if !status.success() {
            return Err(PrintError::NonZeroExit(status.code()));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn falha_de_impressao_saida_nao_zero() {
        // Simula "impressora retornou erro" sem depender de hardware real.
        let result = run_copies(|| {
            let mut cmd = Command::new("cmd");
            cmd.args(["/c", "exit", "1"]);
            cmd
        }, 1);
        assert!(matches!(result, Err(PrintError::NonZeroExit(Some(1)))));
    }

    #[test]
    fn impressora_offline_binario_inexistente() {
        // Simula "impressora offline" / driver ausente: o processo nem inicia.
        let result = run_copies(|| Command::new("saldao-print-agent-binario-que-nao-existe.exe"), 1);
        assert!(matches!(result, Err(PrintError::Spawn(_))));
    }

    #[test]
    fn sucesso_repete_por_copia() {
        use std::sync::atomic::{AtomicU32, Ordering};
        static CALLS: AtomicU32 = AtomicU32::new(0);

        let result = run_copies(
            || {
                CALLS.fetch_add(1, Ordering::SeqCst);
                let mut cmd = Command::new("cmd");
                cmd.args(["/c", "exit", "0"]);
                cmd
            },
            3,
        );
        assert!(result.is_ok());
        assert_eq!(CALLS.load(Ordering::SeqCst), 3);
    }
}
