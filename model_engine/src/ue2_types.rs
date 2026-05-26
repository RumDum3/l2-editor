use serde::Serialize;

use crate::cursor::Cursor;
use crate::package::PackageError;

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FVector {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FQuat {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FRotator {
    pub pitch: i32,
    pub yaw: i32,
    pub roll: i32,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FMeshUVFloat {
    pub u: f32,
    pub v: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FCoords {
    pub origin: FVector,
    pub x_axis: FVector,
    pub y_axis: FVector,
    pub z_axis: FVector,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FJointPos {
    pub orientation: FQuat,
    pub position: FVector,
    pub length: f32,
    pub size: FVector,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct FNamedBoneBinary {
    pub name_index: i32,
    pub flags: u32,
    pub joint: FJointPos,
    pub num_children: u32,
    pub parent_index: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FLineageWedge {
    pub point: FVector,
    pub normal: FVector,
    pub tex: FMeshUVFloat,
    pub bones: [u8; 4],
    pub weights: [f32; 4],
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FMeshFace {
    pub i_wedge: [u16; 3],
    pub material_index: u16,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FMeshWedge {
    pub i_vertex: u16,
    pub tex_uv: FMeshUVFloat,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FMeshMaterial {
    pub poly_flags: u32,
    pub texture_index: i32,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FSkinPoint {
    pub point: FVector,
    pub normal: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FVertInfluenceUe2 {
    pub weight: f32,
    pub point_index: u16,
    pub bone_index: u16,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct VBoneInfluence {
    pub bone_weight: u16,
    pub bone_index: u16,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct VWeightIndex {
    pub bone_inf_indices: Vec<u16>,
    pub start_bone_inf: i32,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct FSkelMeshSection {
    pub material_index: u16,
    pub min_stream_index: u16,
    pub min_wedge_index: u16,
    pub max_wedge_index: u16,
    pub num_stream_indices: u16,
    pub bone_index: u16,
    pub f_e: u16,
    pub first_face: u16,
    pub num_faces: u16,
    pub lineage_bone_map: Vec<i32>,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FAnimMeshVertex {
    pub pos: FVector,
    pub norm: u32,
    pub tex: FMeshUVFloat,
}

pub fn read_fvector(c: &mut Cursor) -> Result<FVector, PackageError> {
    Ok(FVector {
        x: c.read_f32()?,
        y: c.read_f32()?,
        z: c.read_f32()?,
    })
}

pub fn read_fquat(c: &mut Cursor) -> Result<FQuat, PackageError> {
    Ok(FQuat {
        x: c.read_f32()?,
        y: c.read_f32()?,
        z: c.read_f32()?,
        w: c.read_f32()?,
    })
}

pub fn read_frotator(c: &mut Cursor) -> Result<FRotator, PackageError> {
    Ok(FRotator {
        pitch: c.read_i32()?,
        yaw: c.read_i32()?,
        roll: c.read_i32()?,
    })
}

pub fn read_fmeshuv_float(c: &mut Cursor) -> Result<FMeshUVFloat, PackageError> {
    Ok(FMeshUVFloat {
        u: c.read_f32()?,
        v: c.read_f32()?,
    })
}

pub fn read_fjoint_pos(c: &mut Cursor) -> Result<FJointPos, PackageError> {
    Ok(FJointPos {
        orientation: read_fquat(c)?,
        position: read_fvector(c)?,
        length: c.read_f32()?,
        size: read_fvector(c)?,
    })
}

pub fn read_fnamed_bone_binary(c: &mut Cursor) -> Result<FNamedBoneBinary, PackageError> {
    Ok(FNamedBoneBinary {
        name_index: c.read_compact_index()?,
        flags: c.read_u32()?,
        joint: read_fjoint_pos(c)?,
        num_children: c.read_u32()?,
        parent_index: c.read_u32()?,
    })
}

pub fn read_flineage_wedge(c: &mut Cursor) -> Result<FLineageWedge, PackageError> {
    let point = read_fvector(c)?;
    let normal = read_fvector(c)?;
    let tex = read_fmeshuv_float(c)?;
    let bones = [c.read_u8()?, c.read_u8()?, c.read_u8()?, c.read_u8()?];
    let weights = [c.read_f32()?, c.read_f32()?, c.read_f32()?, c.read_f32()?];
    Ok(FLineageWedge {
        point,
        normal,
        tex,
        bones,
        weights,
    })
}

pub fn read_fmesh_face(c: &mut Cursor) -> Result<FMeshFace, PackageError> {
    Ok(FMeshFace {
        i_wedge: [c.read_u16()?, c.read_u16()?, c.read_u16()?],
        material_index: c.read_u16()?,
    })
}

pub fn read_fmesh_wedge(c: &mut Cursor) -> Result<FMeshWedge, PackageError> {
    Ok(FMeshWedge {
        i_vertex: c.read_u16()?,
        tex_uv: read_fmeshuv_float(c)?,
    })
}

pub fn read_fmesh_material(c: &mut Cursor) -> Result<FMeshMaterial, PackageError> {
    Ok(FMeshMaterial {
        poly_flags: c.read_u32()?,
        texture_index: c.read_i32()?,
    })
}

pub fn read_fskin_point(c: &mut Cursor) -> Result<FSkinPoint, PackageError> {
    Ok(FSkinPoint {
        point: read_fvector(c)?,
        normal: c.read_u32()?,
    })
}

pub fn read_fvert_influence_ue2(c: &mut Cursor) -> Result<FVertInfluenceUe2, PackageError> {
    Ok(FVertInfluenceUe2 {
        weight: c.read_f32()?,
        point_index: c.read_u16()?,
        bone_index: c.read_u16()?,
    })
}

pub fn read_vbone_influence(c: &mut Cursor) -> Result<VBoneInfluence, PackageError> {
    Ok(VBoneInfluence {
        bone_weight: c.read_u16()?,
        bone_index: c.read_u16()?,
    })
}

pub fn read_vweight_index(c: &mut Cursor) -> Result<VWeightIndex, PackageError> {
    Ok(VWeightIndex {
        bone_inf_indices: read_array(c, |c| Ok(c.read_u16()?))?,
        start_bone_inf: c.read_i32()?,
    })
}

pub fn read_fskel_mesh_section(c: &mut Cursor, has_lineage_bone_map: bool) -> Result<FSkelMeshSection, PackageError> {
    let material_index = c.read_u16()?;
    let min_stream_index = c.read_u16()?;
    let min_wedge_index = c.read_u16()?;
    let max_wedge_index = c.read_u16()?;
    let num_stream_indices = c.read_u16()?;
    let bone_index = c.read_u16()?;
    let f_e = c.read_u16()?;
    let first_face = c.read_u16()?;
    let num_faces = c.read_u16()?;
    let lineage_bone_map = if has_lineage_bone_map {
        read_array(c, |c| Ok(c.read_i32()?))?
    } else {
        Vec::new()
    };
    Ok(FSkelMeshSection {
        material_index,
        min_stream_index,
        min_wedge_index,
        max_wedge_index,
        num_stream_indices,
        bone_index,
        f_e,
        first_face,
        num_faces,
        lineage_bone_map,
    })
}

pub fn read_fanim_mesh_vertex(c: &mut Cursor) -> Result<FAnimMeshVertex, PackageError> {
    Ok(FAnimMeshVertex {
        pos: read_fvector(c)?,
        norm: c.read_u32()?,
        tex: read_fmeshuv_float(c)?,
    })
}

// TLazyArray = i32 skip-pos prefix (v62+) followed by a regular TArray.
pub fn read_lazy_array<T, F>(c: &mut Cursor, package_version: u16, item: F) -> Result<Vec<T>, PackageError>
where
    F: FnMut(&mut Cursor) -> Result<T, PackageError>,
{
    if package_version > 61 {
        let _skip_pos = c.read_i32()?;
    }
    read_array(c, item)
}

pub fn read_array<T, F>(c: &mut Cursor, mut item: F) -> Result<Vec<T>, PackageError>
where
    F: FnMut(&mut Cursor) -> Result<T, PackageError>,
{
    let count = c.read_compact_index()?.max(0) as usize;
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        out.push(item(c)?);
    }
    Ok(out)
}

pub fn skip_array<F>(c: &mut Cursor, mut skip_one: F) -> Result<usize, PackageError>
where
    F: FnMut(&mut Cursor) -> Result<(), PackageError>,
{
    let count = c.read_compact_index()?.max(0) as usize;
    for _ in 0..count {
        skip_one(c)?;
    }
    Ok(count)
}

pub fn skip_fixed_array(c: &mut Cursor, item_bytes: usize) -> Result<usize, PackageError> {
    let count = c.read_compact_index()?.max(0) as usize;
    c.skip(count * item_bytes)?;
    Ok(count)
}
