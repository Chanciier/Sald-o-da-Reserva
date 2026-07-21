use super::pdf_print::print_pdf;
use super::PrintError;
use printpdf::{ColorBits, ColorSpace, Image, ImageTransform, ImageXObject, Mm, PdfDocument, Px};
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

/// Tamanho físico da etiqueta de retirada (rolo térmico 104x150mm da loja).
/// TODO: se algum dia precisar suportar outro tamanho de rolo, isso devia
/// virar campo de Configurações em vez de constante — por ora bate com o
/// único rolo em uso.
const LABEL_WIDTH_MM: f32 = 104.0;
const LABEL_HEIGHT_MM: f32 = 150.0;

/// DPI usado só como referência interna pra converter os pixels da imagem
/// em mm antes de calcular o encaixe na página — não precisa bater com o
/// DPI real da impressora.
const NOMINAL_DPI: f32 = 203.0;
const MM_PER_INCH: f32 = 25.4;

/// Imprime uma imagem (etiqueta de retirada, PNG). Antes usava
/// `rundll32 shimgvw.dll,ImageView_PrintTo`, mas essa API ignora o tamanho
/// de papel configurado no driver e sempre imprime num template interno
/// fixo (pequeno, não configurável) — por isso a etiqueta saía minúscula
/// mesmo com o driver configurado certo. Em vez disso, embrulha a imagem
/// num PDF cuja página já nasce do tamanho físico real da etiqueta (a
/// imagem é encaixada dentro, centralizada, ampliada até o limite sem
/// distorcer) e imprime via SumatraPDF — o mesmo caminho já confiável
/// usado pela etiqueta de envio. Sem "-print-settings fit": como a página
/// do PDF já bate exatamente com o papel configurado no driver, "fit"
/// só estava fazendo o Sumatra decidir rotacionar a página por conta
/// própria (etiqueta saindo deitada) sem nenhum benefício de tamanho.
pub fn print_image(sumatra_path: &Path, path: &Path, printer: &str, copies: u32) -> Result<(), PrintError> {
    let pdf_path = png_to_pdf(path)?;
    print_pdf(sumatra_path, &pdf_path, printer, copies)
}

fn png_to_pdf(png_path: &Path) -> Result<PathBuf, PrintError> {
    let img = image::open(png_path)
        .map_err(|e| PrintError::Spawn(std::io::Error::other(format!("falha ao ler PNG: {e}"))))?
        .to_rgb8();
    let (px_w, px_h) = img.dimensions();

    // Tamanho "natural" da imagem em mm, a um DPI de referência — só serve
    // pra achar a proporção; o que importa é o encaixe calculado abaixo.
    let natural_w_mm = px_w as f32 / NOMINAL_DPI * MM_PER_INCH;
    let natural_h_mm = px_h as f32 / NOMINAL_DPI * MM_PER_INCH;

    // Encaixa preservando a proporção (equivalente a `object-fit: contain`)
    // dentro do tamanho físico da etiqueta, e centraliza o que sobrar.
    let scale = (LABEL_WIDTH_MM / natural_w_mm).min(LABEL_HEIGHT_MM / natural_h_mm);
    let final_w_mm = natural_w_mm * scale;
    let final_h_mm = natural_h_mm * scale;
    let offset_x_mm = (LABEL_WIDTH_MM - final_w_mm) / 2.0;
    let offset_y_mm = (LABEL_HEIGHT_MM - final_h_mm) / 2.0;

    let (doc, page1, layer1) = PdfDocument::new(
        "etiqueta de retirada",
        Mm(LABEL_WIDTH_MM),
        Mm(LABEL_HEIGHT_MM),
        "camada 1",
    );
    let layer = doc.get_page(page1).get_layer(layer1);

    // Monta o ImageXObject "na mão" com os pixels RGB8 crus (em vez de
    // `Image::from_dynamic_image`, que exige a feature `embedded_images` e
    // puxa uma versão própria (mais antiga) da crate `image`, incompatível
    // com a versão já usada no resto do app).
    let xobject = ImageXObject {
        width: Px(px_w as usize),
        height: Px(px_h as usize),
        color_space: ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate: true,
        image_data: img.into_raw(),
        image_filter: None,
        smask: None,
        clipping_bbox: None,
    };

    Image::from(xobject).add_to_layer(
        layer,
        ImageTransform {
            translate_x: Some(Mm(offset_x_mm)),
            translate_y: Some(Mm(offset_y_mm)),
            dpi: Some(NOMINAL_DPI / scale),
            ..Default::default()
        },
    );

    let pdf_path = png_path.with_extension("pdf");
    let file = File::create(&pdf_path).map_err(PrintError::Spawn)?;
    doc.save(&mut BufWriter::new(file))
        .map_err(|e| PrintError::Spawn(std::io::Error::other(format!("falha ao salvar PDF: {e}"))))?;
    Ok(pdf_path)
}
