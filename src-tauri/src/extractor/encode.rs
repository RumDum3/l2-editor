use image::{imageops, ImageBuffer, Rgba};

use super::properties::TextureFormat;

#[derive(Debug)]
pub enum EncodeError {
    UnsupportedFormat(TextureFormat),
    BadDimensions,
    PngDecode(String),
}

impl std::fmt::Display for EncodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EncodeError::UnsupportedFormat(fm) => write!(f, "unsupported encode format: {:?}", fm),
            EncodeError::BadDimensions => write!(f, "bad dimensions (must be > 0 and a power of 2)"),
            EncodeError::PngDecode(s) => write!(f, "png decode: {s}"),
        }
    }
}

impl std::error::Error for EncodeError {}

#[derive(Debug, Clone)]
pub struct EncodedMip {
    pub width: u32,
    pub height: u32,
    pub bytes: Vec<u8>,
}

pub fn decode_png(png_bytes: &[u8]) -> Result<(u32, u32, Vec<u8>), EncodeError> {
    let img = image::load_from_memory_with_format(png_bytes, image::ImageFormat::Png)
        .map_err(|e| EncodeError::PngDecode(e.to_string()))?
        .to_rgba8();
    let (w, h) = (img.width(), img.height());
    Ok((w, h, img.into_raw()))
}

pub fn resize_rgba(rgba: &[u8], w: u32, h: u32, new_w: u32, new_h: u32) -> Vec<u8> {
    let buf: ImageBuffer<Rgba<u8>, _> = match ImageBuffer::from_vec(w, h, rgba.to_vec()) {
        Some(b) => b,
        None => return Vec::new(),
    };
    if w == new_w && h == new_h {
        return buf.into_raw();
    }
    let resized = imageops::resize(&buf, new_w, new_h, imageops::FilterType::Lanczos3);
    resized.into_raw()
}

pub fn build_mip_chain(
    rgba: &[u8],
    w: u32,
    h: u32,
    format: TextureFormat,
    max_levels: usize,
) -> Result<Vec<EncodedMip>, EncodeError> {
    if w == 0 || h == 0 {
        return Err(EncodeError::BadDimensions);
    }
    let mut out: Vec<EncodedMip> = Vec::new();
    let mut cur_w = w;
    let mut cur_h = h;
    let mut cur_rgba = rgba.to_vec();
    for _ in 0..max_levels {
        let bytes = encode_mip(&cur_rgba, cur_w, cur_h, format)?;
        out.push(EncodedMip { width: cur_w, height: cur_h, bytes });
        if cur_w == 1 && cur_h == 1 {
            break;
        }
        let nw = (cur_w / 2).max(1);
        let nh = (cur_h / 2).max(1);
        cur_rgba = resize_rgba(&cur_rgba, cur_w, cur_h, nw, nh);
        cur_w = nw;
        cur_h = nh;
    }
    Ok(out)
}

pub fn encode_mip(
    rgba: &[u8],
    w: u32,
    h: u32,
    format: TextureFormat,
) -> Result<Vec<u8>, EncodeError> {
    match format {
        TextureFormat::Dxt1 => Ok(encode_bc(rgba, w, h, texpresso::Format::Bc1)),
        TextureFormat::Dxt3 => Ok(encode_bc(rgba, w, h, texpresso::Format::Bc2)),
        TextureFormat::Dxt5 => Ok(encode_bc(rgba, w, h, texpresso::Format::Bc3)),
        TextureFormat::Rgba8 => Ok(rgba_to_bgra8(rgba)),
        TextureFormat::Rgb8 => Ok(rgba_to_bgr8(rgba, w, h)),
        // P8 and the more exotic formats are encoded as DXT5 instead — UE2 supports it everywhere.
        // Caller should use the original texture's chosen format unless told otherwise.
        TextureFormat::P8
        | TextureFormat::Rgba7
        | TextureFormat::Rgb16
        | TextureFormat::NoData
        | TextureFormat::L8
        | TextureFormat::G16
        | TextureFormat::Rrrgggbbb => Err(EncodeError::UnsupportedFormat(format)),
    }
}

fn encode_bc(rgba: &[u8], w: u32, h: u32, fmt: texpresso::Format) -> Vec<u8> {
    let size = fmt.compressed_size(w as usize, h as usize);
    let mut out = vec![0u8; size];
    fmt.compress(
        rgba,
        w as usize,
        h as usize,
        texpresso::Params::default(),
        &mut out,
    );
    out
}

// UE2 RGBA8 is stored as BGRA.
fn rgba_to_bgra8(rgba: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; rgba.len()];
    for i in (0..rgba.len()).step_by(4) {
        out[i] = rgba[i + 2];
        out[i + 1] = rgba[i + 1];
        out[i + 2] = rgba[i];
        out[i + 3] = rgba[i + 3];
    }
    out
}

fn rgba_to_bgr8(rgba: &[u8], w: u32, h: u32) -> Vec<u8> {
    let n = (w as usize) * (h as usize);
    let mut out = vec![0u8; n * 3];
    for i in 0..n {
        out[i * 3] = rgba[i * 4 + 2];
        out[i * 3 + 1] = rgba[i * 4 + 1];
        out[i * 3 + 2] = rgba[i * 4];
    }
    out
}
