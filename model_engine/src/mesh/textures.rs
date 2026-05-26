use crate::mesh::data::MeshTextureRef;
use crate::mesh::l2_walker::L2SkeletalMeshRaw;
use crate::package::{ImportEntry, Package};

pub(super) fn resolve_all(
    pkg: &Package,
    export_name: &str,
    property_refs: &[i32],
    l2_raw: Option<&L2SkeletalMeshRaw>,
) -> Vec<MeshTextureRef> {
    let mut out: Vec<MeshTextureRef> = Vec::new();

    for &r in property_refs {
        if let Some(t) = resolve_material_ref(pkg, r) {
            out.push(t);
        }
    }

    if out.is_empty() {
        if let Some(raw) = l2_raw {
            for &r in &raw.texture_refs {
                if let Some(t) = resolve_typed_ref(pkg, r, "Texture") {
                    out.push(t);
                }
            }
            if out.is_empty() {
                for m in &raw.materials {
                    if let Some(t) = resolve_typed_ref(pkg, m.texture_index, "Texture") {
                        out.push(t);
                    }
                }
            }
        }
    }

    if out.is_empty() {
        out = scan_imports_by_name(pkg, export_name);
    }

    out
}

pub(super) fn resolve_by_section_index(
    pkg: &Package,
    section_indices: &[u16],
) -> Vec<MeshTextureRef> {
    let texture_imports: Vec<&ImportEntry> = pkg
        .imports
        .iter()
        .filter(|i| i.class_name.eq_ignore_ascii_case("Texture"))
        .collect();
    let mut out: Vec<MeshTextureRef> = Vec::new();
    for &mi in section_indices {
        let idx = mi as usize;
        if let Some(&imp) = texture_imports.get(idx) {
            out.push(make_ref(pkg, imp));
        }
    }
    out
}

pub(super) fn texture_import_count(pkg: &Package) -> usize {
    pkg.imports
        .iter()
        .filter(|i| i.class_name.eq_ignore_ascii_case("Texture"))
        .count()
}

fn resolve_material_ref(pkg: &Package, obj_ref: i32) -> Option<MeshTextureRef> {
    resolve_obj_ref(pkg, obj_ref, None)
}

fn resolve_typed_ref(pkg: &Package, obj_ref: i32, class_filter: &str) -> Option<MeshTextureRef> {
    resolve_obj_ref(pkg, obj_ref, Some(class_filter))
}

fn resolve_obj_ref(pkg: &Package, obj_ref: i32, class_filter: Option<&str>) -> Option<MeshTextureRef> {
    if obj_ref == 0 {
        return None;
    }
    if obj_ref > 0 {
        let e = pkg.exports.get((obj_ref - 1) as usize)?;
        if let Some(cf) = class_filter {
            if !e.class_name.eq_ignore_ascii_case(cf) {
                return None;
            }
        }
        let self_pkg = pkg
            .path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        return Some(MeshTextureRef {
            package: self_pkg,
            name: e.object_name.clone(),
        });
    }
    let import = pkg.imports.get((-obj_ref - 1) as usize)?;
    if let Some(cf) = class_filter {
        if !import.class_name.eq_ignore_ascii_case(cf) {
            return None;
        }
    }
    Some(make_ref(pkg, import))
}

fn scan_imports_by_name(pkg: &Package, mesh_name: &str) -> Vec<MeshTextureRef> {
    let prefix = mesh_prefix(mesh_name);
    let mut matched: Vec<MeshTextureRef> = Vec::new();
    let mut all: Vec<MeshTextureRef> = Vec::new();
    for imp in &pkg.imports {
        if !imp.class_name.eq_ignore_ascii_case("Texture") {
            continue;
        }
        let r = make_ref(pkg, imp);
        let lower = imp.object_name.to_ascii_lowercase();
        if !prefix.is_empty() && lower.starts_with(&prefix) {
            matched.push(r);
        } else {
            all.push(r);
        }
    }
    if matched.is_empty() { all } else { matched }
}

// Strip an `_m\d+` mesh suffix so e.g. "baby_buffalo_m00" -> "baby_buffalo".
fn mesh_prefix(mesh_name: &str) -> String {
    let lower = mesh_name.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    let mut end = bytes.len();
    if end > 3 && bytes[end - 3].is_ascii_digit() && bytes[end - 2].is_ascii_digit() {
        let mut i = end - 3;
        while i > 0 && bytes[i].is_ascii_digit() {
            i -= 1;
        }
        if bytes[i] == b'm' && i > 0 && bytes[i - 1] == b'_' {
            end = i - 1;
        }
    }
    lower[..end].to_string()
}

fn make_ref(pkg: &Package, import: &ImportEntry) -> MeshTextureRef {
    let mut parent = import.package_index;
    let mut last = import;
    let mut hops = 0;
    while parent < 0 && hops < 16 {
        let Some(p) = pkg.imports.get((-parent - 1) as usize) else { break };
        last = p;
        parent = p.package_index;
        hops += 1;
    }
    MeshTextureRef {
        package: last.object_name.clone(),
        name: import.object_name.clone(),
    }
}
