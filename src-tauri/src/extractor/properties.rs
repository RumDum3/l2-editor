use std::io::{self, Cursor, Read};

use byteorder::{LittleEndian, ReadBytesExt};

use super::package::{read_compact_int, Package, PackageError};

#[derive(Debug, Clone, Default)]
pub struct TextureProperties {
    pub format: Option<TextureFormat>,
    pub width: u32,
    pub height: u32,
    pub palette: i32,
    pub split9: Split9,
}

#[derive(Debug, Clone, Default)]
pub struct Split9 {
    pub enabled: bool,
    pub x1: i32,
    pub x2: i32,
    pub x3: i32,
    pub y1: i32,
    pub y2: i32,
    pub y3: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextureFormat {
    P8,
    Rgba7,
    Rgb16,
    Dxt1,
    Rgb8,
    Rgba8,
    NoData,
    Dxt3,
    Dxt5,
    L8,
    G16,
    Rrrgggbbb,
}

impl TextureFormat {
    pub fn from_byte(b: u8) -> Option<Self> {
        Some(match b {
            0 => Self::P8,
            1 => Self::Rgba7,
            2 => Self::Rgb16,
            3 => Self::Dxt1,
            4 => Self::Rgb8,
            5 => Self::Rgba8,
            6 => Self::NoData,
            7 => Self::Dxt3,
            8 => Self::Dxt5,
            9 => Self::L8,
            10 => Self::G16,
            11 => Self::Rrrgggbbb,
            _ => return None,
        })
    }
}

pub fn read(pkg: &Package, cursor: &mut Cursor<&[u8]>) -> Result<TextureProperties, PackageError> {
    let mut props = TextureProperties::default();
    loop {
        let name_idx = read_compact_int(cursor)?;
        let name = pkg.name(name_idx).ok_or(PackageError::BadCompactInt)?.to_string();
        if name == "None" {
            return Ok(props);
        }
        let info = read_u8(cursor)?;
        let prop_type = (info & 0x0F) as u32;
        let size_type = ((info >> 4) & 0x07) as u32;
        let array_bit = (info & 0x80) != 0;

        if prop_type == 10 {
            let _struct_name_idx = read_compact_int(cursor)?;
        }

        let size = property_size(size_type, cursor)?;
        if array_bit && prop_type != 3 {
            let _array_idx = read_compact_int(cursor)?;
        }

        let mut payload = vec![0u8; size as usize];
        cursor.read_exact(&mut payload)?;
        let mut p = Cursor::new(&payload[..]);

        match name.as_str() {
            "Format" => {
                if !payload.is_empty() {
                    props.format = TextureFormat::from_byte(payload[0]);
                }
            }
            "USize" => {
                if payload.len() >= 4 {
                    props.width = p.read_u32::<LittleEndian>()?;
                }
            }
            "VSize" => {
                if payload.len() >= 4 {
                    props.height = p.read_u32::<LittleEndian>()?;
                }
            }
            "Palette" => {
                props.palette = read_compact_int(&mut p)?;
            }
            "bSplit9Texture" => {
                props.split9.enabled = array_bit;
            }
            "Split9X1" => props.split9.x1 = read_i32_safe(&mut p),
            "Split9X2" => props.split9.x2 = read_i32_safe(&mut p),
            "Split9X3" => props.split9.x3 = read_i32_safe(&mut p),
            "Split9Y1" => props.split9.y1 = read_i32_safe(&mut p),
            "Split9Y2" => props.split9.y2 = read_i32_safe(&mut p),
            "Split9Y3" => props.split9.y3 = read_i32_safe(&mut p),
            _ => {}
        }
    }
}

fn property_size(size_type: u32, cursor: &mut Cursor<&[u8]>) -> io::Result<u32> {
    Ok(match size_type {
        0 => 1,
        1 => 2,
        2 => 4,
        3 => 12,
        4 => 16,
        5 => read_u8(cursor)? as u32,
        6 => cursor.read_u16::<LittleEndian>()? as u32,
        7 => cursor.read_u32::<LittleEndian>()?,
        _ => 0,
    })
}

fn read_u8(cursor: &mut Cursor<&[u8]>) -> io::Result<u8> {
    let mut b = [0u8; 1];
    cursor.read_exact(&mut b)?;
    Ok(b[0])
}

fn read_i32_safe(c: &mut Cursor<&[u8]>) -> i32 {
    c.read_i32::<LittleEndian>().unwrap_or(0)
}

pub fn read_u8_at(c: &mut Cursor<&[u8]>) -> io::Result<u8> {
    read_u8(c)
}

pub fn read_string(cursor: &mut Cursor<&[u8]>) -> Result<String, PackageError> {
    let len = read_compact_int(cursor)?;
    if len <= 0 {
        return Ok(String::new());
    }
    let mut buf = vec![0u8; len as usize];
    cursor.read_exact(&mut buf)?;
    if buf.last() == Some(&0) {
        buf.pop();
    }
    String::from_utf8(buf).map_err(|_| PackageError::BadUtf8)
}

pub fn expect_none(pkg: &Package, c: &mut Cursor<&[u8]>) -> Result<(), PackageError> {
    let idx = read_compact_int(c)?;
    let name = pkg.name(idx).unwrap_or("");
    if name != "None" {
        return Err(PackageError::BadCompactInt);
    }
    Ok(())
}
