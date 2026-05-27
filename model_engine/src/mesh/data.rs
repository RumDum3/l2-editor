use serde::Serialize;

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
    pub decoder: &'static str,
    pub decoder_confidence: DecoderConfidence,
    pub l2_walker_error: Option<String>,
    pub textures: Vec<MeshTextureRef>,
    pub sections: Vec<MeshSection>,
    pub debug_info: MeshDebugInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshSection {
    pub kind: &'static str,
    pub first_index: u32,
    pub index_count: u32,
    pub material_index: u32,
    pub texture_index: i32,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoneInfluence {
    pub vertex_index: u32,
    pub bone_index: u32,
    pub weight: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshTextureRef {
    pub package: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshDebugInfo {
    pub soft_section_materials: Vec<u16>,
    pub rigid_section_materials: Vec<u16>,
    pub property_material_refs: Vec<i32>,
    pub texture_import_count: usize,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DecoderConfidence {
    Verified,
    Tentative,
    Unknown,
}

#[derive(Debug)]
pub enum MeshDecodeError {
    Package(crate::package::PackageError),
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

impl From<crate::package::PackageError> for MeshDecodeError {
    fn from(e: crate::package::PackageError) -> Self {
        MeshDecodeError::Package(e)
    }
}

impl From<crate::cursor::CursorError> for MeshDecodeError {
    fn from(e: crate::cursor::CursorError) -> Self {
        MeshDecodeError::Package(crate::package::PackageError::Cursor(e))
    }
}
