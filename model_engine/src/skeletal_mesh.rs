use serde::Serialize;

use crate::cursor::Cursor;
use crate::package::{ExportEntry, Package, PackageError};
use crate::uobject::skip_property_block;

#[derive(Debug)]
pub enum MeshDecodeError {
    Package(PackageError),
    NotASkeletalMesh { class: String },
    EmptyExport,
}

impl std::fmt::Display for MeshDecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MeshDecodeError::Package(e) => write!(f, "{e}"),
            MeshDecodeError::NotASkeletalMesh { class } => {
                write!(f, "export is a {class}, not a SkeletalMesh")
            }
            MeshDecodeError::EmptyExport => write!(f, "export has zero-byte payload"),
        }
    }
}

impl std::error::Error for MeshDecodeError {}

impl From<PackageError> for MeshDecodeError {
    fn from(e: PackageError) -> Self {
        MeshDecodeError::Package(e)
    }
}

impl From<crate::cursor::CursorError> for MeshDecodeError {
    fn from(e: crate::cursor::CursorError) -> Self {
        MeshDecodeError::Package(PackageError::Cursor(e))
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshData {
    pub export_name: String,
    pub bounds: Bounds,
    pub positions: Vec<f32>,
    pub triangle_wedges: Vec<u32>,
    pub triangle_materials: Vec<u32>,
    pub wedge_uvs: Vec<f32>,
    pub wedge_vertex_indices: Vec<u32>,
    pub wedge_materials: Vec<u32>,
    pub materials: Vec<MeshMaterial>,
    pub bones: Vec<MeshBone>,
    pub influences: Vec<BoneInfluence>,
    pub serial_end: u32,
    pub cursor_end: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoneInfluence {
    pub vertex_index: u32,
    pub bone_index: u32,
    pub weight: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub min: [f32; 3],
    pub max: [f32; 3],
    pub center: [f32; 3],
    pub radius: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshMaterial {
    pub flags: u32,
    pub texture_index: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshBone {
    pub name: String,
    pub flags: u32,
    pub orientation: [f32; 4],
    pub position: [f32; 3],
    pub length: f32,
    pub size: [f32; 3],
    pub num_children: u32,
    pub parent_index: u32,
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

pub fn decode_skeletal_mesh(pkg: &Package, export: &ExportEntry) -> Result<MeshData, MeshDecodeError> {
    if !export.class_name.eq_ignore_ascii_case("SkeletalMesh") {
        return Err(MeshDecodeError::NotASkeletalMesh {
            class: export.class_name.clone(),
        });
    }
    if export.serial_size == 0 {
        return Err(MeshDecodeError::EmptyExport);
    }

    let start = export.serial_offset as usize;
    let end = start + export.serial_size as usize;
    if end > pkg.bytes.len() {
        return Err(MeshDecodeError::Package(PackageError::IndexOutOfRange {
            table: "skel_mesh.body",
            index: end as i32,
            len: pkg.bytes.len(),
        }));
    }

    let mut c = Cursor::new(&pkg.bytes);
    c.set_position(start)?;

    skip_property_block(&mut c, &pkg.names)?;
    let bounds = read_bounds(&mut c)?;

    let _mesh_format_version = c.read_u32()?;
    let vertex_count = c.read_u32()? as usize;
    let positions = read_packed_positions(&mut c, &bounds, vertex_count)?;

    let wedge_vertex_indices: Vec<u32> = Vec::new();
    let wedge_uvs: Vec<f32> = Vec::new();
    let wedge_materials: Vec<u32> = Vec::new();
    let triangle_wedges: Vec<u32> = Vec::new();
    let triangle_materials: Vec<u32> = Vec::new();
    let materials: Vec<MeshMaterial> = Vec::new();
    let influences: Vec<BoneInfluence> = Vec::new();
    let bones: Vec<MeshBone> = Vec::new();

    let cursor_end = c.position() as u32;
    Ok(MeshData {
        export_name: export.full_name.clone(),
        bounds,
        positions,
        triangle_wedges,
        triangle_materials,
        wedge_uvs,
        wedge_vertex_indices,
        wedge_materials,
        materials,
        bones,
        influences,
        serial_end: end as u32,
        cursor_end,
    })
}

fn read_bounds(c: &mut Cursor) -> Result<Bounds, PackageError> {
    let min = [c.read_f32()?, c.read_f32()?, c.read_f32()?];
    let max = [c.read_f32()?, c.read_f32()?, c.read_f32()?];
    let _is_valid = c.read_u8()?;
    let cx = c.read_f32()?;
    let cy = c.read_f32()?;
    let cz = c.read_f32()?;
    let radius = c.read_f32()?;
    Ok(Bounds {
        min,
        max,
        center: [cx, cy, cz],
        radius,
    })
}

// L2 v133 packs positions as 3 signed i16 quantized around the bbox center.
fn read_packed_positions(c: &mut Cursor, bounds: &Bounds, count: usize) -> Result<Vec<f32>, PackageError> {
    let center = [
        (bounds.min[0] + bounds.max[0]) * 0.5,
        (bounds.min[1] + bounds.max[1]) * 0.5,
        (bounds.min[2] + bounds.max[2]) * 0.5,
    ];
    let half_ext = [
        (bounds.max[0] - bounds.min[0]) * 0.5,
        (bounds.max[1] - bounds.min[1]) * 0.5,
        (bounds.max[2] - bounds.min[2]) * 0.5,
    ];
    let mut out = Vec::with_capacity(count * 3);
    for _ in 0..count {
        let qx = c.read_u16()? as i16 as f32;
        let qy = c.read_u16()? as i16 as f32;
        let qz = c.read_u16()? as i16 as f32;
        out.push(center[0] + (qx / 32767.0) * half_ext[0]);
        out.push(center[1] + (qy / 32767.0) * half_ext[1]);
        out.push(center[2] + (qz / 32767.0) * half_ext[2]);
    }
    Ok(out)
}

#[allow(dead_code)]
fn read_bones(c: &mut Cursor, names: &[String]) -> Result<Vec<MeshBone>, PackageError> {
    let count = c.read_compact_index()?.max(0) as usize;
    let mut bones = Vec::with_capacity(count);
    for _ in 0..count {
        let name_idx = c.read_compact_index()?;
        let i = name_idx as usize;
        let name = if name_idx >= 0 && i < names.len() {
            names[i].clone()
        } else {
            format!("?bone{name_idx}")
        };
        let flags = c.read_u32()?;
        let qx = c.read_f32()?;
        let qy = c.read_f32()?;
        let qz = c.read_f32()?;
        let qw = c.read_f32()?;
        let px = c.read_f32()?;
        let py = c.read_f32()?;
        let pz = c.read_f32()?;
        let length = c.read_f32()?;
        let sx = c.read_f32()?;
        let sy = c.read_f32()?;
        let sz = c.read_f32()?;
        let num_children = c.read_u32()?;
        let parent_index = c.read_u32()?;
        bones.push(MeshBone {
            name,
            flags,
            orientation: [qx, qy, qz, qw],
            position: [px, py, pz],
            length,
            size: [sx, sy, sz],
            num_children,
            parent_index,
        });
    }
    Ok(bones)
}
