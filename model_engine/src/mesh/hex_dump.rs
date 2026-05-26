use serde::Serialize;

use crate::cursor::Cursor;
use crate::mesh::data::MeshDecodeError;
use crate::package::{ExportEntry, Package};
use crate::uobject::skip_property_block;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HexDump {
    pub export_name: String,
    pub payload_start: u32,
    pub serial_offset: u32,
    pub serial_size: u32,
    pub bytes_dumped: u32,
    pub hex: String,
    pub ascii: String,
    pub u32_grid: String,
    pub f32_grid: String,
}

pub fn dump_after_properties(
    pkg: &Package,
    export: &ExportEntry,
    nbytes: usize,
    offset_after_props: usize,
) -> Result<HexDump, MeshDecodeError> {
    if !export.class_name.eq_ignore_ascii_case("SkeletalMesh") {
        return Err(MeshDecodeError::NotASkeletalMesh {
            class: export.class_name.clone(),
        });
    }
    if export.serial_size == 0 {
        return Err(MeshDecodeError::EmptyExport);
    }
    let start = export.serial_offset as usize;
    let export_end = start + export.serial_size as usize;
    let mut c = Cursor::new(&pkg.bytes);
    c.set_position(start)?;
    skip_property_block(&mut c, &pkg.names)?;
    let payload_start = c.position();
    let buffer_end = export_end.min(pkg.bytes.len());
    let dump_start = (payload_start + offset_after_props).min(buffer_end);
    let end = (dump_start + nbytes).min(buffer_end);
    let bytes = &pkg.bytes[dump_start..end];
    Ok(HexDump {
        export_name: export.full_name.clone(),
        payload_start: dump_start as u32,
        serial_offset: export.serial_offset,
        serial_size: export.serial_size,
        bytes_dumped: bytes.len() as u32,
        hex: hexify(bytes),
        ascii: ascify(bytes),
        u32_grid: u32_grid(bytes),
        f32_grid: f32_grid(bytes),
    })
}

fn hexify(b: &[u8]) -> String {
    let mut out = String::new();
    for (i, chunk) in b.chunks(16).enumerate() {
        out.push_str(&format!("{:04x}  ", i * 16));
        for (j, byte) in chunk.iter().enumerate() {
            if j == 8 {
                out.push(' ');
            }
            out.push_str(&format!("{byte:02x} "));
        }
        out.push('\n');
    }
    out
}

fn ascify(b: &[u8]) -> String {
    let mut out = String::new();
    for (i, chunk) in b.chunks(16).enumerate() {
        out.push_str(&format!("{:04x}  ", i * 16));
        for byte in chunk {
            let c = if (0x20..0x7F).contains(byte) { *byte as char } else { '.' };
            out.push(c);
        }
        out.push('\n');
    }
    out
}

fn u32_grid(b: &[u8]) -> String {
    let mut out = String::new();
    for (i, chunk) in b.chunks(16).enumerate() {
        out.push_str(&format!("{:04x}  ", i * 16));
        for word in chunk.chunks(4) {
            if word.len() == 4 {
                let v = u32::from_le_bytes([word[0], word[1], word[2], word[3]]);
                out.push_str(&format!("{v:>11} "));
            }
        }
        out.push('\n');
    }
    out
}

fn f32_grid(b: &[u8]) -> String {
    let mut out = String::new();
    for (i, chunk) in b.chunks(16).enumerate() {
        out.push_str(&format!("{:04x}  ", i * 16));
        for word in chunk.chunks(4) {
            if word.len() == 4 {
                let v = f32::from_le_bytes([word[0], word[1], word[2], word[3]]);
                out.push_str(&format!("{v:>14.4e} "));
            }
        }
        out.push('\n');
    }
    out
}
