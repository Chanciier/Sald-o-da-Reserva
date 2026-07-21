use super::{run_copies, PrintError};
use std::path::Path;
use std::process::Command;

/// Imprime uma imagem (etiqueta de retirada, PNG) via o pipeline nativo do
/// Windows — `rundll32 shimgvw.dll,ImageView_PrintTo` — sem diálogo, sem
/// dependência nova, sem alterar o arquivo.
pub fn print_image(path: &Path, printer: &str, copies: u32) -> Result<(), PrintError> {
    let path = path.to_path_buf();
    let printer = printer.to_string();

    run_copies(
        move || {
            let mut cmd = Command::new("rundll32.exe");
            cmd.arg("shimgvw.dll,ImageView_PrintTo").arg(&path).arg(&printer);
            cmd
        },
        copies,
    )
}
