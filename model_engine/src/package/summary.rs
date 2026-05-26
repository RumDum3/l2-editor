use serde::Serialize;

use crate::package::tables::{ExportEntry, ImportEntry};
use crate::package::Package;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageSummary {
    pub path: String,
    pub cipher_code: u32,
    pub version: u16,
    pub licensee_version: u16,
    pub name_count: usize,
    pub import_count: usize,
    pub export_count: usize,
    pub exports_sample: Vec<ExportEntry>,
    pub imports_sample: Vec<ImportEntry>,
    pub export_class_histogram: Vec<(String, usize)>,
}

pub(super) fn summarize(pkg: &Package, sample_size: usize) -> PackageSummary {
    let mut hist: std::collections::BTreeMap<String, usize> = Default::default();
    for e in &pkg.exports {
        *hist.entry(e.class_name.clone()).or_insert(0) += 1;
    }
    let mut export_class_histogram: Vec<_> = hist.into_iter().collect();
    export_class_histogram.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    PackageSummary {
        path: pkg.path.to_string_lossy().into_owned(),
        cipher_code: pkg.cipher_code,
        version: pkg.header.version,
        licensee_version: pkg.header.licensee_version,
        name_count: pkg.names.len(),
        import_count: pkg.imports.len(),
        export_count: pkg.exports.len(),
        exports_sample: pkg.exports.iter().take(sample_size).cloned().collect(),
        imports_sample: pkg.imports.iter().take(sample_size).cloned().collect(),
        export_class_histogram,
    }
}
