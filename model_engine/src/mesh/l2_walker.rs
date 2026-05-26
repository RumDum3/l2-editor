use serde::Serialize;

use crate::cursor::Cursor;
use crate::package::PackageError;
use crate::ue2_types::*;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct L2LodModel {
    pub num_soft_wedges: i32,
    pub soft_sections: Vec<FSkelMeshSection>,
    pub rigid_sections: Vec<FSkelMeshSection>,
    pub soft_indices: Vec<u16>,
    pub rigid_indices: Vec<u16>,
    pub vertex_stream_verts: Vec<FAnimMeshVertex>,
    pub points: Vec<FVector>,
    pub wedges: Vec<FMeshWedge>,
    pub faces: Vec<FMeshFace>,
    pub lod_distance_factor: f32,
    pub lod_hysteresis: f32,
    pub num_shared_verts: i32,
    pub lineage_wedges: Vec<FLineageWedge>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct L2SkeletalMeshRaw {
    pub lod_mesh_version: u32,
    pub lod_mesh_vertex_count: u32,
    pub mesh_scale: FVector,
    pub mesh_origin: FVector,
    pub rot_origin: FRotator,
    pub points2: Vec<FVector>,
    pub ref_skeleton: Vec<FNamedBoneBinary>,
    pub lod_models: Vec<L2LodModel>,
    pub texture_refs: Vec<i32>,
    pub materials: Vec<FMeshMaterial>,
    pub bytes_consumed: u32,
}

pub fn read_l2_skeletal_mesh(
    c: &mut Cursor,
    pkg_version: u16,
    licensee_version: u16,
    names: &[String],
) -> Result<L2SkeletalMeshRaw, PackageError> {
    let start_pos = c.position();
    let mut out = L2SkeletalMeshRaw::default();

    read_ulod_mesh_prelude(c, pkg_version, licensee_version, names, &mut out)
        .map_err(|e| stage_err("ulod_mesh_prelude", c.position(), 0, e))?;
    read_uskeletal_mesh_prelude(c, pkg_version, licensee_version, &mut out)
        .map_err(|e| stage_err("uskeletal_mesh_prelude", c.position(), 0, e))?;
    out.lod_models = read_lod_models(c, pkg_version, licensee_version)
        .map_err(|e| stage_err("lod_models", c.position(), 0, e))?;

    out.bytes_consumed = (c.position() - start_pos) as u32;
    Ok(out)
}

fn stage_err(stage: &'static str, cursor: usize, total: usize, e: PackageError) -> PackageError {
    let detail = match &e {
        PackageError::Stage { stage: inner_stage, cursor: ic, detail, .. } => {
            format!("{inner_stage}@{ic}: {detail}")
        }
        other => other.to_string(),
    };
    PackageError::Stage {
        stage,
        cursor,
        total,
        detail,
        recent_hex: String::new(),
    }
}

fn substage(name: &'static str, pos: usize, e: PackageError) -> PackageError {
    PackageError::Stage {
        stage: name,
        cursor: pos,
        total: 0,
        detail: e.to_string(),
        recent_hex: String::new(),
    }
}

fn read_ulod_mesh_prelude(
    c: &mut Cursor,
    pkg_version: u16,
    _licensee_version: u16,
    _names: &[String],
    out: &mut L2SkeletalMeshRaw,
) -> Result<(), PackageError> {
    out.lod_mesh_version = c.read_u32()?;
    out.lod_mesh_vertex_count = c.read_u32()?;

    let p_v = c.position();
    let verts_count = if pkg_version >= 133 {
        read_array(c, read_fvector).map_err(|e| substage("new_verts", p_v, e))?.len()
    } else {
        skip_fixed_array(c, 4).map_err(|e| substage("verts", p_v, e))?
    };

    if out.lod_mesh_version <= 1 {
        let p = c.position();
        let _ = skip_fixed_array(c, 32).map_err(|e| substage("obsolete_tri2", p, e))?;
    }

    let p = c.position();
    out.texture_refs = read_array(c, |c| Ok(c.read_compact_index()?))
        .map_err(|e| substage("textures", p, e))?;
    let textures_count = out.texture_refs.len();

    out.mesh_scale = read_fvector(c)?;
    out.mesh_origin = read_fvector(c)?;
    out.rot_origin = read_frotator(c)?;

    if out.lod_mesh_version <= 1 {
        let _ = skip_fixed_array(c, 2)?;
    }

    let p_fl = c.position();
    // FaceLevel is TArray<uint16>, not TArray<int>.
    let face_level_count = skip_fixed_array(c, 2).map_err(|e| substage("face_level", p_fl, e))?;
    let p_f = c.position();
    let faces_count = skip_fixed_array(c, 8).map_err(|e| substage("faces", p_f, e))?;
    let p_cw = c.position();
    let collapse_count = skip_fixed_array(c, 2).map_err(|e| substage("collapse_wedge_thus", p_cw, e))?;
    let p_w = c.position();
    let _ = skip_array(c, |c| {
        let _ = c.read_u16()?;
        let _ = c.read_f32()?;
        let _ = c.read_f32()?;
        Ok(())
    })
    .map_err(|e| {
        substage(
            Box::leak(
                format!(
                    "wedges_ulod (verts={verts_count}, textures={textures_count}, face_lvl={face_level_count}, faces={faces_count}, collapse={collapse_count})"
                )
                .into_boxed_str(),
            ),
            p_w,
            e,
        )
    })?;
    let p = c.position();
    out.materials = read_array(c, read_fmesh_material).map_err(|e| substage("materials", p, e))?;

    let _mesh_scale_max = c.read_f32()?;
    let _lod_hysteresis = c.read_f32()?;
    let _lod_strength = c.read_f32()?;
    let _lod_min_verts = c.read_i32()?;
    let _lod_morph = c.read_f32()?;
    let _lod_z_displace = c.read_f32()?;

    if out.lod_mesh_version >= 3 {
        let _has_impostor = c.read_i32()?;
        let _sprite_material = c.read_compact_index()?;
        let _imp_location = read_fvector(c)?;
        let _imp_rotation = read_frotator(c)?;
        let _imp_scale = read_fvector(c)?;
        let _imp_color = c.read_u32()?;
        let _imp_space_mode = c.read_i32()?;
        let _imp_draw_mode = c.read_i32()?;
        let _imp_light_mode = c.read_i32()?;
    }

    if out.lod_mesh_version >= 4 {
        let _skin_tess_factor = c.read_f32()?;
    }

    if out.lod_mesh_version >= 5 {
        let _unk = c.read_i32()?;
        if out.lod_mesh_version >= 6 {
            c.skip(1)?;
        }
    }

    Ok(())
}

fn read_uskeletal_mesh_prelude(
    c: &mut Cursor,
    pkg_version: u16,
    _licensee_version: u16,
    out: &mut L2SkeletalMeshRaw,
) -> Result<(), PackageError> {
    out.points2 = read_array(c, read_fvector)?;
    out.ref_skeleton = read_array(c, read_fnamed_bone_binary)?;

    let _animation = c.read_compact_index()?;
    let _skeletal_depth = c.read_i32()?;
    let _ = read_array(c, read_vweight_index)?;
    let _ = skip_fixed_array(c, 4)?;
    let _ = skip_array(c, |c| {
        let _ = c.read_compact_index()?;
        Ok(())
    })?;
    let _ = skip_array(c, |c| {
        let _ = c.read_compact_index()?;
        Ok(())
    })?;
    let _ = skip_fixed_array(c, 48)?;

    if out.lod_mesh_version <= 1 {
        let _ = pkg_version;
    }
    Ok(())
}

fn read_lod_models(
    c: &mut Cursor,
    pkg_version: u16,
    licensee_version: u16,
) -> Result<Vec<L2LodModel>, PackageError> {
    let count = c.read_compact_index()?.max(0) as usize;
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        out.push(read_lod_model(c, pkg_version, licensee_version)?);
    }
    Ok(out)
}

fn read_lod_model(
    c: &mut Cursor,
    pkg_version: u16,
    licensee_version: u16,
) -> Result<L2LodModel, PackageError> {
    let mut lod = L2LodModel::default();

    let _ = skip_fixed_array(c, 4)?;
    let _ = skip_fixed_array(c, 16)?;

    lod.num_soft_wedges = c.read_i32()?;

    let has_lineage_bone_map = licensee_version >= 0x1C;
    lod.soft_sections = read_array(c, |c| read_fskel_mesh_section(c, has_lineage_bone_map))?;
    lod.rigid_sections = read_array(c, |c| read_fskel_mesh_section(c, has_lineage_bone_map))?;

    lod.soft_indices = read_array(c, |c| Ok(c.read_u16()?))?;
    let _ = c.read_i32()?;
    lod.rigid_indices = read_array(c, |c| Ok(c.read_u16()?))?;
    let _ = c.read_i32()?;

    let _ = c.read_i32()?;
    let _ = c.read_i32()?;
    let _ = c.read_i32()?;
    lod.vertex_stream_verts = read_array(c, read_fanim_mesh_vertex)?;

    // VertInfluences / Wedges / Faces / Points are TLazyArray (i32 skip-pos prefix from v62+).
    {
        if pkg_version > 61 {
            let _skip = c.read_i32()?;
        }
        let _ = skip_fixed_array(c, 8)?;
    }
    {
        if pkg_version > 61 {
            let _skip = c.read_i32()?;
        }
        lod.wedges = read_array(c, read_fmesh_wedge)?;
    }
    {
        if pkg_version > 61 {
            let _skip = c.read_i32()?;
        }
        lod.faces = read_array(c, read_fmesh_face)?;
    }
    {
        if pkg_version > 61 {
            let _skip = c.read_i32()?;
        }
        lod.points = read_array(c, read_fvector)?;
    }

    lod.lod_distance_factor = c.read_f32()?;
    lod.lod_hysteresis = c.read_f32()?;
    lod.num_shared_verts = c.read_i32()?;
    let _lod_max_influences = c.read_i32()?;
    let _f114 = c.read_i32()?;
    let _f118 = c.read_i32()?;

    if licensee_version >= 0x1C {
        let _use_new_wedges = c.read_i32()?;
        lod.lineage_wedges = read_array(c, read_flineage_wedge)?;
    }

    Ok(lod)
}
