use serde::Serialize;

use crate::cursor::Cursor;
use crate::package::error::PackageError;
use crate::package::header::PackageHeader;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportEntry {
    pub class_index: i32,
    pub super_index: i32,
    pub package_index: i32,
    pub object_name_index: i32,
    pub object_flags: u32,
    pub serial_size: u32,
    pub serial_offset: u32,
    pub object_name: String,
    pub class_name: String,
    pub full_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEntry {
    pub class_package_index: i32,
    pub class_name_index: i32,
    pub package_index: i32,
    pub object_name_index: i32,
    pub class_package: String,
    pub class_name: String,
    pub object_name: String,
    pub full_name: String,
}

pub(super) fn read_name_table(bytes: &[u8], h: &PackageHeader) -> Result<Vec<String>, PackageError> {
    let mut c = Cursor::new(bytes);
    c.set_position(h.name_offset as usize)?;
    let mut names = Vec::with_capacity(h.name_count as usize);
    for _ in 0..h.name_count {
        let name = if h.version >= 64 {
            read_fname_string(&mut c)?
        } else {
            read_cstring(&mut c)?
        };
        c.skip(4)?;
        names.push(name);
    }
    Ok(names)
}

fn read_fname_string(c: &mut Cursor) -> Result<String, PackageError> {
    let len = c.read_compact_index()?;
    if len <= 0 {
        return Ok(String::new());
    }
    let bytes = c.read_bytes(len as usize)?;
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    Ok(String::from_utf8_lossy(&bytes[..end]).into_owned())
}

fn read_cstring(c: &mut Cursor) -> Result<String, PackageError> {
    let mut bytes = Vec::new();
    loop {
        let b = c.read_u8()?;
        if b == 0 {
            break;
        }
        bytes.push(b);
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

pub(super) fn read_import_table(
    bytes: &[u8],
    h: &PackageHeader,
    names: &[String],
) -> Result<Vec<ImportEntry>, PackageError> {
    let mut c = Cursor::new(bytes);
    c.set_position(h.import_offset as usize)?;
    let mut imports = Vec::with_capacity(h.import_count as usize);
    for _ in 0..h.import_count {
        let class_package_index = c.read_compact_index()?;
        let class_name_index = c.read_compact_index()?;
        let package_index = c.read_i32()?;
        let object_name_index = c.read_compact_index()?;
        let class_package = lookup_name(names, class_package_index, "import.class_package")?;
        let class_name = lookup_name(names, class_name_index, "import.class_name")?;
        let object_name = lookup_name(names, object_name_index, "import.object_name")?;
        imports.push(ImportEntry {
            class_package_index,
            class_name_index,
            package_index,
            object_name_index,
            class_package,
            class_name,
            object_name,
            full_name: String::new(),
        });
    }
    let cloned = imports.clone();
    for (i, e) in imports.iter_mut().enumerate() {
        e.full_name = resolve_full_name_import(&cloned, i);
    }
    Ok(imports)
}

pub(super) fn read_export_table(
    bytes: &[u8],
    h: &PackageHeader,
    names: &[String],
    imports: &[ImportEntry],
) -> Result<Vec<ExportEntry>, PackageError> {
    let mut c = Cursor::new(bytes);
    c.set_position(h.export_offset as usize)?;
    let mut exports = Vec::with_capacity(h.export_count as usize);
    for _ in 0..h.export_count {
        let class_index = c.read_compact_index()?;
        let super_index = c.read_compact_index()?;
        let package_index = c.read_i32()?;
        let object_name_index = c.read_compact_index()?;
        let object_flags = c.read_u32()?;
        let serial_size = c.read_compact_index()? as u32;
        let serial_offset = if serial_size > 0 {
            c.read_compact_index()? as u32
        } else {
            0
        };
        let object_name = lookup_name(names, object_name_index, "export.object_name")?;
        let class_name = resolve_object_ref(class_index, imports, &[]).unwrap_or_else(|| {
            if class_index == 0 {
                "Class".to_string()
            } else {
                format!("?{class_index}")
            }
        });
        exports.push(ExportEntry {
            class_index,
            super_index,
            package_index,
            object_name_index,
            object_flags,
            serial_size,
            serial_offset,
            object_name,
            class_name,
            full_name: String::new(),
        });
    }
    let snapshot = exports.clone();
    for e in &mut exports {
        e.full_name = resolve_full_name_export(&snapshot, e, imports);
    }
    Ok(exports)
}

fn lookup_name(names: &[String], index: i32, table: &'static str) -> Result<String, PackageError> {
    let i = index as usize;
    if index < 0 || i >= names.len() {
        return Err(PackageError::IndexOutOfRange {
            table,
            index,
            len: names.len(),
        });
    }
    Ok(names[i].clone())
}

// UE2 obj refs: positive = export idx 1-based, negative = import idx 1-based, zero = null.
fn resolve_object_ref(obj_ref: i32, imports: &[ImportEntry], exports: &[ExportEntry]) -> Option<String> {
    if obj_ref == 0 {
        return None;
    }
    if obj_ref > 0 {
        exports.get((obj_ref - 1) as usize).map(|e| e.object_name.clone())
    } else {
        imports.get((-obj_ref - 1) as usize).map(|e| e.object_name.clone())
    }
}

fn resolve_full_name_export(
    exports: &[ExportEntry],
    e: &ExportEntry,
    imports: &[ImportEntry],
) -> String {
    let mut parts = vec![e.object_name.clone()];
    let mut parent = e.package_index;
    let mut hops = 0;
    while parent != 0 && hops < 16 {
        if parent > 0 {
            let Some(p) = exports.get((parent - 1) as usize) else { break };
            parts.push(p.object_name.clone());
            parent = p.package_index;
        } else {
            let Some(p) = imports.get((-parent - 1) as usize) else { break };
            parts.push(p.object_name.clone());
            parent = p.package_index;
        }
        hops += 1;
    }
    parts.reverse();
    parts.join(".")
}

fn resolve_full_name_import(imports: &[ImportEntry], self_idx: usize) -> String {
    let mut parts = vec![imports[self_idx].object_name.clone()];
    let mut parent = imports[self_idx].package_index;
    let mut hops = 0;
    while parent != 0 && hops < 16 {
        if parent >= 0 {
            break;
        }
        let Some(p) = imports.get((-parent - 1) as usize) else { break };
        parts.push(p.object_name.clone());
        parent = p.package_index;
        hops += 1;
    }
    parts.reverse();
    parts.join(".")
}
