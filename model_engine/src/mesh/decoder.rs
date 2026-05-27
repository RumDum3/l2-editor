use crate::cursor::Cursor;
use crate::mesh::data::{
    BoneInfluence, Bounds, DecoderConfidence, MeshBone, MeshData, MeshDebugInfo, MeshDecodeError,
    MeshMaterial, MeshSection,
};
use crate::mesh::l2_walker::{read_l2_skeletal_mesh, L2SkeletalMeshRaw};
use crate::mesh::textures;
use crate::package::{ExportEntry, Package, PackageError};
use crate::uobject::{read_property_block, skip_property_block};

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

    let props = read_property_block(&mut c, &pkg.names)?;
    let bounds = read_bounds(&mut c)?;

    let pkg_version = pkg.header.version;
    let licensee_version = pkg.header.licensee_version;
    let l2_attempt = read_l2_skeletal_mesh(&mut c, pkg_version, licensee_version, &pkg.names);
    let mut l2_walker_error: Option<String> = None;

    let geom = match &l2_attempt {
        Ok(raw) if !raw.lod_models.is_empty() && !raw.lod_models[0].lineage_wedges.is_empty() => {
            build_geom_from_lineage(raw)
        }
        Ok(raw) => {
            l2_walker_error = Some(format!(
                "L2 walker ran OK but no LineageWedges found: lod_models={}, ref_skeleton={}, points2={}",
                raw.lod_models.len(),
                raw.ref_skeleton.len(),
                raw.points2.len()
            ));
            fallback_geom(pkg, start, &bounds, pkg_version)?
        }
        Err(e) => {
            l2_walker_error = Some(format!("L2 walker error: {e}"));
            fallback_geom(pkg, start, &bounds, pkg_version)?
        }
    };

    let l2_raw_ok = l2_attempt.as_ref().ok();
    let mut texs = textures::resolve_all(pkg, &export.object_name, &props.material_refs, l2_raw_ok);

    let (soft_mats, rigid_mats) = section_material_indices(l2_raw_ok);
    if !soft_mats.is_empty() || !rigid_mats.is_empty() {
        let combined: Vec<u16> = soft_mats.iter().chain(rigid_mats.iter()).copied().collect();
        let sectional = textures::resolve_by_section_index(pkg, &combined);
        if !sectional.is_empty() {
            texs = sectional;
        }
    }

    let sections = build_sections(l2_raw_ok);

    let debug_info = MeshDebugInfo {
        soft_section_materials: soft_mats,
        rigid_section_materials: rigid_mats,
        property_material_refs: props.material_refs,
        texture_import_count: textures::texture_import_count(pkg),
    };

    Ok(MeshData {
        export_name: export.full_name.clone(),
        bounds,
        positions: geom.positions,
        triangle_wedges: geom.triangle_wedges,
        triangle_materials: Vec::new(),
        wedge_uvs: geom.wedge_uvs,
        wedge_vertex_indices: geom.wedge_vertex_indices,
        wedge_materials: Vec::new(),
        materials: Vec::<MeshMaterial>::new(),
        bones: geom.bones,
        influences: geom.influences,
        serial_end: end as u32,
        cursor_end: c.position() as u32,
        decoder: geom.decoder,
        decoder_confidence: geom.confidence,
        l2_walker_error,
        textures: texs,
        sections,
        debug_info,
    })
}

fn build_sections(raw: Option<&L2SkeletalMeshRaw>) -> Vec<MeshSection> {
    let Some(raw) = raw else { return Vec::new() };
    let Some(lod) = raw.lod_models.first() else { return Vec::new() };
    let soft_count = lod.soft_sections.len();
    let mut out: Vec<MeshSection> = Vec::with_capacity(soft_count + lod.rigid_sections.len());
    let soft_indices_len = lod.soft_indices.len() as u32;
    // L2 leaves min_stream_index / num_stream_indices as sentinel/vertex-count values.
    // The authoritative triangle range is first_face * 3 .. (first_face + num_faces) * 3.
    // Sections are paired with NpcGrp.dat's texture_name array by ordinal position.
    for (i, s) in lod.soft_sections.iter().enumerate() {
        let first = s.first_face as u32 * 3;
        let count = s.num_faces as u32 * 3;
        if count == 0 {
            continue;
        }
        out.push(MeshSection {
            kind: "soft",
            first_index: first,
            index_count: count,
            material_index: s.material_index as u32,
            texture_index: i as i32,
        });
    }
    for (j, s) in lod.rigid_sections.iter().enumerate() {
        let first = soft_indices_len + s.first_face as u32 * 3;
        let count = s.num_faces as u32 * 3;
        if count == 0 {
            continue;
        }
        out.push(MeshSection {
            kind: "rigid",
            first_index: first,
            index_count: count,
            material_index: s.material_index as u32,
            texture_index: (soft_count + j) as i32,
        });
    }
    out
}

struct Geom {
    positions: Vec<f32>,
    triangle_wedges: Vec<u32>,
    wedge_uvs: Vec<f32>,
    wedge_vertex_indices: Vec<u32>,
    influences: Vec<BoneInfluence>,
    bones: Vec<MeshBone>,
    decoder: &'static str,
    confidence: DecoderConfidence,
}

fn build_geom_from_lineage(raw: &L2SkeletalMeshRaw) -> Geom {
    let lod = &raw.lod_models[0];
    let n = lod.lineage_wedges.len();
    let mut positions = Vec::with_capacity(n * 3);
    let mut wedge_uvs = Vec::with_capacity(n * 2);
    let mut wedge_vertex_indices = Vec::with_capacity(n);
    let mut influences = Vec::new();

    for (idx, w) in lod.lineage_wedges.iter().enumerate() {
        positions.push(w.point.x);
        positions.push(w.point.y);
        positions.push(w.point.z);
        wedge_uvs.push(w.tex.u);
        wedge_uvs.push(w.tex.v);
        wedge_vertex_indices.push(idx as u32);
        for k in 0..4 {
            if w.weights[k] > 1.0e-6 {
                influences.push(BoneInfluence {
                    vertex_index: idx as u32,
                    bone_index: w.bones[k] as u32,
                    weight: w.weights[k],
                });
            }
        }
    }

    let mut triangle_wedges = Vec::with_capacity(lod.soft_indices.len() + lod.rigid_indices.len());
    for &i in &lod.soft_indices {
        triangle_wedges.push(i as u32);
    }
    for &i in &lod.rigid_indices {
        triangle_wedges.push(i as u32);
    }

    let bones = raw
        .ref_skeleton
        .iter()
        .map(|b| MeshBone {
            name: String::new(),
            flags: b.flags,
            orientation: [
                b.joint.orientation.x,
                b.joint.orientation.y,
                b.joint.orientation.z,
                b.joint.orientation.w,
            ],
            position: [b.joint.position.x, b.joint.position.y, b.joint.position.z],
            length: b.joint.length,
            size: [b.joint.size.x, b.joint.size.y, b.joint.size.z],
            num_children: b.num_children,
            parent_index: b.parent_index,
        })
        .collect();

    Geom {
        positions,
        triangle_wedges,
        wedge_uvs,
        wedge_vertex_indices,
        influences,
        bones,
        decoder: "l2_lineage_wedges",
        confidence: DecoderConfidence::Verified,
    }
}

fn fallback_geom(
    pkg: &Package,
    start: usize,
    bounds: &Bounds,
    pkg_version: u16,
) -> Result<Geom, PackageError> {
    let mut c = Cursor::new(&pkg.bytes);
    c.set_position(start)?;
    skip_property_block(&mut c, &pkg.names)?;
    let _ = read_bounds(&mut c)?;
    let (positions, decoder, confidence) = decode_positions(&mut c, bounds, pkg_version)?;
    Ok(Geom {
        positions,
        triangle_wedges: Vec::new(),
        wedge_uvs: Vec::new(),
        wedge_vertex_indices: Vec::new(),
        influences: Vec::new(),
        bones: Vec::new(),
        decoder,
        confidence,
    })
}

fn section_material_indices(raw: Option<&L2SkeletalMeshRaw>) -> (Vec<u16>, Vec<u16>) {
    let Some(raw) = raw else { return (Vec::new(), Vec::new()) };
    let Some(lod) = raw.lod_models.first() else { return (Vec::new(), Vec::new()) };
    (
        lod.soft_sections.iter().map(|s| s.material_index).collect(),
        lod.rigid_sections.iter().map(|s| s.material_index).collect(),
    )
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

fn decode_positions(
    c: &mut Cursor,
    bounds: &Bounds,
    pkg_version: u16,
) -> Result<(Vec<f32>, &'static str, DecoderConfidence), PackageError> {
    if pkg_version >= 60 {
        let _marker = c.read_u32()?;
        let count = c.read_u32()? as usize;
        // Pre-v130 interleaves a 40-byte transform block (scale/origin/rotator) before verts.
        if pkg_version < 130 {
            c.skip(40)?;
        }
        let positions = read_packed_i16_positions(c, bounds, count)?;
        let confidence = if pkg_version >= 130 {
            DecoderConfidence::Verified
        } else {
            DecoderConfidence::Tentative
        };
        return Ok((positions, "l2_packed_i16", confidence));
    }
    let count = c.read_compact_index()?.max(0) as usize;
    let mut positions = Vec::with_capacity(count * 3);
    for _ in 0..count {
        positions.push(c.read_f32()?);
        positions.push(c.read_f32()?);
        positions.push(c.read_f32()?);
    }
    Ok((positions, "ue2_fvector", DecoderConfidence::Tentative))
}

// L2 v133 packs positions as 3 signed i16 quantized around the bbox center.
fn read_packed_i16_positions(c: &mut Cursor, bounds: &Bounds, count: usize) -> Result<Vec<f32>, PackageError> {
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
