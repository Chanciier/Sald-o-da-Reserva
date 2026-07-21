use super::{run_copies, PrintError};
use std::path::Path;
use std::process::Command;

/// Imprime um PDF (etiqueta de envio, do Melhor Envio) via SumatraPDF
/// bundlado (`resources/SumatraPDF.exe`) — sem diálogo, sem alterar o PDF,
/// sem adicionar elementos.
pub fn print_pdf(sumatra_path: &Path, path: &Path, printer: &str, copies: u32) -> Result<(), PrintError> {
    if !sumatra_path.exists() {
        return Err(PrintError::Spawn(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("SumatraPDF não encontrado em {}", sumatra_path.display()),
        )));
    }

    let sumatra_path = sumatra_path.to_path_buf();
    let path = path.to_path_buf();
    let printer = printer.to_string();

    run_copies(
        move || {
            let mut cmd = Command::new(&sumatra_path);
            cmd.arg("-print-to").arg(&printer).arg("-silent").arg(&path);
            cmd
        },
        copies,
    )
}
