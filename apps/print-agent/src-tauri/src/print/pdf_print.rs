use super::{run_copies, PrintError};
use std::path::Path;
use std::process::Command;

/// Imprime um PDF via SumatraPDF bundlado (`resources/SumatraPDF.exe`) — sem
/// diálogo, sem alterar o PDF, sem adicionar elementos. Usado tanto pra
/// etiqueta de envio (PDF já vem no tamanho certo do Melhor Envio) quanto
/// pra etiqueta de retirada (PDF gerado localmente já do tamanho físico da
/// etiqueta; ver `image_print.rs`) — em ambos os casos a página do PDF já
/// bate com o papel configurado no driver, então imprime na escala padrão
/// do Sumatra (sem "-print-settings").
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
