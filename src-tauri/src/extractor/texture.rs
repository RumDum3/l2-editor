use std::io::{Cursor, Read};

use byteorder::{LittleEndian, ReadBytesExt};
use image::{ImageBuffer, Rgba};

use super::package::{read_compact_int, ExportEntry, Package, PackageError};
use super::properties::{self, read_string, read_u8_at, TextureFormat, TextureProperties};

#[derive(Debug)]
pub enum TextureError {
    Package(PackageError),
    UnsupportedFormat(TextureFormat),
    NoMips,
    PaletteMissing,
    DecodeFailed(&'static str),
    PngEncode,
}

impl From<PackageError> for TextureError {
    fn from(e: PackageError) -> Self {
        TextureError::Package(e)
    }
}

impl From<std::io::Error> for TextureError {
    fn from(e: std::io::Error) -> Self {
        TextureError::Package(PackageError::Io(e))
    }
}

impl std::fmt::Display for TextureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TextureError::Package(e) => write!(f, "package: {}", e),
            TextureError::UnsupportedFormat(fm) => write!(f, "unsupported texture format: {:?}", fm),
            TextureError::NoMips => write!(f, "no mips found"),
            TextureError::PaletteMissing => write!(f, "P8 texture has no usable palette"),
            TextureError::DecodeFailed(s) => write!(f, "decode failed: {}", s),
            TextureError::PngEncode => write!(f, "png encode failed"),
        }
    }
}

impl std::error::Error for TextureError {}

#[derive(Debug)]
pub struct DecodedTexture {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

pub fn decode_texture(pkg: &Package, export: &ExportEntry) -> Result<DecodedTexture, TextureError> {
    let bytes: &[u8] = &pkg.bytes;
    let mut c = Cursor::new(bytes);
    c.set_position(export.serial_offset as u64);

    let props = properties::read(pkg, &mut c)?;

    let format = props.format.unwrap_or(TextureFormat::P8);
    skip_unk(&mut c, pkg.header.file_version, pkg.header.licensee_version)?;

    let mip_count = read_compact_int(&mut c)?;
    if mip_count <= 0 {
        return Err(TextureError::NoMips);
    }

    let _next_offset = c.read_u32::<LittleEndian>()?;
    let size = read_compact_int(&mut c)?;
    if size <= 0 {
        return Err(TextureError::NoMips);
    }
    let mut data = vec![0u8; size as usize];
    c.read_exact(&mut data)?;
    let width = c.read_u32::<LittleEndian>()?;
    let height = c.read_u32::<LittleEndian>()?;
    let _ubits = read_u8_at(&mut c)?;
    let _vbits = read_u8_at(&mut c)?;
    let final_w = if width > 0 { width } else { props.width };
    let final_h = if height > 0 { height } else { props.height };

    let rgba = decode_pixels(&data, final_w, final_h, format, &props, pkg)?;
    Ok(DecodedTexture { width: final_w, height: final_h, rgba })
}

pub fn extract_to_png(pkg: &Package, export: &ExportEntry) -> Result<Vec<u8>, TextureError> {
    let dec = decode_texture(pkg, export)?;
    rgba_to_png(dec.width, dec.height, dec.rgba)
}

pub fn rgba_to_png(width: u32, height: u32, rgba: Vec<u8>) -> Result<Vec<u8>, TextureError> {
    let img: ImageBuffer<Rgba<u8>, _> =
        ImageBuffer::from_vec(width, height, rgba).ok_or(TextureError::PngEncode)?;
    let mut out = Vec::new();
    img.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
        .map_err(|_| TextureError::PngEncode)?;
    Ok(out)
}

fn skip_unk(c: &mut Cursor<&[u8]>, version: u16, licensee: u16) -> Result<(), TextureError> {
    if licensee <= 12 {
        return Ok(());
    }
    if licensee <= 28 {
        c.read_u32::<LittleEndian>()?;
        return Ok(());
    }
    if licensee <= 32 {
        return Ok(());
    }
    if licensee <= 35 {
        skip_bytes(c, 1067)?;
        for _ in 0..16 {
            read_string(c)?;
        }
        read_string(c)?;
        c.read_u32::<LittleEndian>()?;
        return Ok(());
    }
    if licensee == 36 {
        skip_bytes(c, 1058)?;
        for _ in 0..16 {
            read_string(c)?;
        }
        read_string(c)?;
        c.read_u32::<LittleEndian>()?;
        return Ok(());
    }
    if licensee <= 39 {
        let head = if version == 129 { 92 } else { 36 };
        skip_bytes(c, head)?;
        let n = read_compact_int(c)?;
        for _ in 0..n {
            read_string(c)?;
            let add = read_u8_at(c)?;
            for _ in 0..add {
                read_string(c)?;
            }
        }
        read_string(c)?;
        c.read_u32::<LittleEndian>()?;
        return Ok(());
    }
    skip_bytes(c, 92)?;
    let n = read_compact_int(c)?;
    for _ in 0..n {
        read_string(c)?;
        let add = read_u8_at(c)?;
        for _ in 0..add {
            read_string(c)?;
        }
    }
    read_string(c)?;
    c.read_u32::<LittleEndian>()?;
    Ok(())
}

fn skip_bytes(c: &mut Cursor<&[u8]>, n: u64) -> Result<(), TextureError> {
    let pos = c.position();
    c.set_position(pos + n);
    Ok(())
}

fn decode_pixels(
    data: &[u8],
    width: u32,
    height: u32,
    format: TextureFormat,
    props: &TextureProperties,
    pkg: &Package,
) -> Result<Vec<u8>, TextureError> {
    let pixels = (width * height) as usize;
    match format {
        TextureFormat::Rgba8 => {
            let mut out = vec![0u8; pixels * 4];
            let needed = pixels * 4;
            if data.len() < needed {
                return Err(TextureError::DecodeFailed("RGBA8 data shorter than expected"));
            }
            for i in 0..pixels {
                let b = data[i * 4];
                let g = data[i * 4 + 1];
                let r = data[i * 4 + 2];
                let a = data[i * 4 + 3];
                out[i * 4] = r;
                out[i * 4 + 1] = g;
                out[i * 4 + 2] = b;
                out[i * 4 + 3] = a;
            }
            Ok(out)
        }
        TextureFormat::Rgb8 => {
            let mut out = vec![0u8; pixels * 4];
            let needed = pixels * 3;
            if data.len() < needed {
                return Err(TextureError::DecodeFailed("RGB8 data shorter than expected"));
            }
            for i in 0..pixels {
                out[i * 4] = data[i * 3 + 2];
                out[i * 4 + 1] = data[i * 3 + 1];
                out[i * 4 + 2] = data[i * 3];
                out[i * 4 + 3] = 255;
            }
            Ok(out)
        }
        TextureFormat::P8 => {
            let palette = load_palette(pkg, props.palette)?;
            let mut out = vec![0u8; pixels * 4];
            for i in 0..pixels.min(data.len()) {
                let idx = data[i] as usize;
                let c = palette[idx];
                out[i * 4] = c[0];
                out[i * 4 + 1] = c[1];
                out[i * 4 + 2] = c[2];
                out[i * 4 + 3] = c[3];
            }
            Ok(out)
        }
        TextureFormat::G16 => {
            let mut out = vec![0u8; pixels * 4];
            for i in 0..pixels {
                let lo = *data.get(i * 2).unwrap_or(&0);
                let hi = *data.get(i * 2 + 1).unwrap_or(&0);
                let g = ((hi as u16) << 8 | (lo as u16)) >> 8;
                let g = g as u8;
                out[i * 4] = g;
                out[i * 4 + 1] = g;
                out[i * 4 + 2] = g;
                out[i * 4 + 3] = 255;
            }
            Ok(out)
        }
        TextureFormat::L8 => {
            let mut out = vec![0u8; pixels * 4];
            for i in 0..pixels.min(data.len()) {
                let g = data[i];
                out[i * 4] = g;
                out[i * 4 + 1] = g;
                out[i * 4 + 2] = g;
                out[i * 4 + 3] = 255;
            }
            Ok(out)
        }
        TextureFormat::Dxt1 => decode_bc(data, width, height, BcKind::Bc1),
        TextureFormat::Dxt3 => decode_bc(data, width, height, BcKind::Bc2),
        TextureFormat::Dxt5 => decode_bc(data, width, height, BcKind::Bc3),
        other => Err(TextureError::UnsupportedFormat(other)),
    }
}

enum BcKind {
    Bc1,
    Bc2,
    Bc3,
}

fn decode_bc(data: &[u8], width: u32, height: u32, kind: BcKind) -> Result<Vec<u8>, TextureError> {
    let mut argb = vec![0u32; (width * height) as usize];
    let res = match kind {
        BcKind::Bc1 => texture2ddecoder::decode_bc1(data, width as usize, height as usize, &mut argb),
        BcKind::Bc2 => texture2ddecoder::decode_bc2(data, width as usize, height as usize, &mut argb),
        BcKind::Bc3 => texture2ddecoder::decode_bc3(data, width as usize, height as usize, &mut argb),
    };
    res.map_err(|_| TextureError::DecodeFailed("bc decode failed"))?;
    let mut out = vec![0u8; argb.len() * 4];
    for (i, px) in argb.iter().enumerate() {
        let o = i * 4;
        out[o] = ((px >> 16) & 0xFF) as u8;
        out[o + 1] = ((px >> 8) & 0xFF) as u8;
        out[o + 2] = (px & 0xFF) as u8;
        out[o + 3] = ((px >> 24) & 0xFF) as u8;
    }
    Ok(out)
}

fn load_palette(pkg: &Package, idx: i32) -> Result<[[u8; 4]; 256], TextureError> {
    if idx <= 0 {
        return Err(TextureError::PaletteMissing);
    }
    let exp = pkg
        .exports
        .get((idx - 1) as usize)
        .ok_or(TextureError::PaletteMissing)?;

    let mut c = Cursor::new(&pkg.bytes[..]);
    c.set_position(exp.serial_offset as u64);

    properties::expect_none(pkg, &mut c)?;
    let count = read_compact_int(&mut c)?;
    let mut pal = [[0u8; 4]; 256];
    let limit = count.min(256).max(0) as usize;
    for i in 0..limit {
        let mut rgba = [0u8; 4];
        c.read_exact(&mut rgba)?;
        pal[i] = rgba;
    }
    Ok(pal)
}
