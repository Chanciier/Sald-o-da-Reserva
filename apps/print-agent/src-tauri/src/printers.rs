use std::process::Command;

/// Lista as impressoras instaladas no Windows via PowerShell (`Get-Printer`)
/// — sempre disponível no Windows 10/11, sem dependência de crate extra.
pub fn list_printers() -> Vec<String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-Printer | Select-Object -ExpandProperty Name",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}
