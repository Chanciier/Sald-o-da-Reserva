use image::{Rgb, RgbImage};
use std::path::{Path, PathBuf};

const WIDTH: u32 = 600;
const HEIGHT: u32 = 300;
const BORDER: u32 = 6;

/// Gera uma etiqueta de teste simples (borda + X) em PNG para o botão
/// "Impressão teste" — não depende do backend, só confirma que a impressora
/// configurada está recebendo e imprimindo jobs.
pub fn generate_test_label(cache_dir: &Path) -> std::io::Result<PathBuf> {
    let mut img = RgbImage::from_pixel(WIDTH, HEIGHT, Rgb([255, 255, 255]));
    draw_border(&mut img);
    draw_x(&mut img);

    std::fs::create_dir_all(cache_dir)?;
    let dest = cache_dir.join("test-label.png");
    img.save(&dest)
        .map_err(|e| std::io::Error::other(format!("falha ao gerar etiqueta de teste: {e}")))?;
    Ok(dest)
}

fn draw_border(img: &mut RgbImage) {
    let (w, h) = img.dimensions();
    for y in 0..h {
        for x in 0..w {
            if x < BORDER || y < BORDER || x >= w - BORDER || y >= h - BORDER {
                img.put_pixel(x, y, Rgb([0, 0, 0]));
            }
        }
    }
}

fn draw_x(img: &mut RgbImage) {
    let (w, h) = img.dimensions();
    let thickness: i64 = 3;
    for x in 0..w {
        let t = x as f64 / w as f64;
        let y1 = (t * h as f64) as i64;
        let y2 = ((1.0 - t) * h as f64) as i64;
        for dy in -thickness..=thickness {
            plot(img, x as i64, y1 + dy);
            plot(img, x as i64, y2 + dy);
        }
    }
}

fn plot(img: &mut RgbImage, x: i64, y: i64) {
    let (w, h) = img.dimensions();
    if x >= 0 && y >= 0 && (x as u32) < w && (y as u32) < h {
        img.put_pixel(x as u32, y as u32, Rgb([0, 0, 0]));
    }
}
