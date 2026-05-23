use std::collections::HashMap;
use std::path::Path;

use rayon::prelude::*;
use rusqlite::{params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
use serde_json::Value;

pub struct DbMeta {
    pub version: u32,
    pub imported_at: String,
    pub source: String,
    pub source_mtime: u64,
    pub source_size: u64,
    pub row_count: u32,
    pub section: String,
    pub index_field: String,
    pub dat_meta_json: String,
}

const SCHEMA_DDL: &str =
    "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID;
     CREATE TABLE IF NOT EXISTS rows (rid INTEGER PRIMARY KEY, id INTEGER, lvl INTEGER, sub INTEGER, j TEXT NOT NULL);
     CREATE INDEX IF NOT EXISTS rows_id ON rows(id);";

fn open_for_read(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("open db {}: {e}", path.display()))?;
    conn.execute_batch(SCHEMA_DDL)
        .map_err(|e| format!("ensure schema: {e}"))?;
    Ok(conn)
}

fn open_fresh(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create db dir: {e}"))?;
    }
    let conn = Connection::open(path).map_err(|e| format!("open db {}: {e}", path.display()))?;
    conn.execute_batch(&format!(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         {SCHEMA_DDL}"
    ))
    .map_err(|e| format!("init sqlite: {e}"))?;
    Ok(conn)
}

fn open(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create db dir: {e}"))?;
    }
    open_for_read(path)
}

fn get_meta(conn: &Connection, k: &str) -> Result<Option<String>, String> {
    conn.query_row("SELECT v FROM meta WHERE k = ?1", params![k], |r| r.get::<_, String>(0))
        .optional()
        .map_err(|e| format!("read meta[{k}]: {e}"))
}

fn put_meta(conn: &Connection, k: &str, v: &str) -> Result<(), String> {
    conn.execute("INSERT OR REPLACE INTO meta (k, v) VALUES (?1, ?2)", params![k, v])
        .map_err(|e| format!("write meta[{k}]: {e}"))?;
    Ok(())
}

fn read_all_meta(conn: &Connection) -> Result<HashMap<String, String>, String> {
    let mut st = conn
        .prepare("SELECT k, v FROM meta")
        .map_err(|e| format!("prepare meta scan: {e}"))?;
    let it = st
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| format!("query meta: {e}"))?;
    let mut out = HashMap::new();
    for row in it {
        let (k, v) = row.map_err(|e| format!("read meta row: {e}"))?;
        out.insert(k, v);
    }
    Ok(out)
}

fn wipe(path: &Path) {
    let _ = std::fs::remove_file(path);
    for ext in ["sqlite-wal", "sqlite-shm", "db-wal", "db-shm"] {
        let _ = std::fs::remove_file(path.with_extension(ext));
    }
}

pub fn create_from_tree(path: &Path, mut tree: Value, meta: &DbMeta) -> Result<u32, String> {
    wipe(path);
    let mut conn = open_fresh(path)?;

    let rows: Vec<Value> = tree
        .as_object_mut()
        .and_then(|o| o.remove(&meta.section))
        .and_then(|v| match v {
            Value::Array(a) => Some(a),
            _ => None,
        })
        .unwrap_or_default();
    let row_count = rows.len() as u32;

    let tx = conn.transaction().map_err(|e| format!("begin tx: {e}"))?;
    {
        let mut ins = tx
            .prepare("INSERT INTO rows (rid, id, lvl, sub, j) VALUES (?1, ?2, ?3, ?4, ?5)")
            .map_err(|e| format!("prepare insert: {e}"))?;
        for (i, row) in rows.iter().enumerate() {
            let id = row.get(&meta.index_field).and_then(Value::as_i64);
            let lvl = row.get("skill_level").and_then(Value::as_i64);
            let sub = row.get("skill_sublevel").and_then(Value::as_i64);
            let j = serde_json::to_string(row).map_err(|e| format!("serialize row {i}: {e}"))?;
            ins.execute(params![i as i64, id, lvl, sub, j])
                .map_err(|e| format!("insert row {i}: {e}"))?;
        }
        let shell_json = serde_json::to_string(&tree).map_err(|e| format!("serialize shell: {e}"))?;
        put_meta(&tx, "version", &meta.version.to_string())?;
        put_meta(&tx, "imported_at", &meta.imported_at)?;
        put_meta(&tx, "source", &meta.source)?;
        put_meta(&tx, "source_mtime", &meta.source_mtime.to_string())?;
        put_meta(&tx, "source_size", &meta.source_size.to_string())?;
        put_meta(&tx, "row_count", &row_count.to_string())?;
        put_meta(&tx, "section", &meta.section)?;
        put_meta(&tx, "index_field", &meta.index_field)?;
        put_meta(&tx, "dat_meta", &meta.dat_meta_json)?;
        put_meta(&tx, "shell", &shell_json)?;
    }
    tx.commit().map_err(|e| format!("commit: {e}"))?;
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    Ok(row_count)
}

pub fn read_meta(path: &Path) -> Result<Option<DbMeta>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let conn = open(path)?;
    let m = read_all_meta(&conn)?;
    let Some(version) = m.get("version").and_then(|s| s.parse().ok()) else {
        return Ok(None);
    };
    Ok(Some(DbMeta {
        version,
        imported_at: m.get("imported_at").cloned().unwrap_or_default(),
        source: m.get("source").cloned().unwrap_or_default(),
        source_mtime: m.get("source_mtime").and_then(|s| s.parse().ok()).unwrap_or(0),
        source_size: m.get("source_size").and_then(|s| s.parse().ok()).unwrap_or(0),
        row_count: m.get("row_count").and_then(|s| s.parse().ok()).unwrap_or(0),
        section: m.get("section").cloned().unwrap_or_else(|| "skill".to_string()),
        index_field: m.get("index_field").cloned().unwrap_or_else(|| "skill_id".to_string()),
        dat_meta_json: m.get("dat_meta").cloned().unwrap_or_else(|| "null".to_string()),
    }))
}

pub fn restamp_source(path: &Path, mtime: u64, size: u64, imported_at: &str) -> Result<(), String> {
    let conn = open(path)?;
    put_meta(&conn, "source_mtime", &mtime.to_string())?;
    put_meta(&conn, "source_size", &size.to_string())?;
    put_meta(&conn, "imported_at", imported_at)?;
    Ok(())
}

fn parse_rows(it: impl Iterator<Item = rusqlite::Result<String>>) -> Result<Vec<Value>, String> {
    let mut out = Vec::new();
    for j in it {
        let j = j.map_err(|e| format!("read row: {e}"))?;
        out.push(serde_json::from_str(&j).map_err(|e| format!("parse cached row: {e}"))?);
    }
    Ok(out)
}

pub fn rows_for(path: &Path, id: u32) -> Result<Vec<Value>, String> {
    let conn = open(path)?;
    let mut st = conn
        .prepare("SELECT j FROM rows WHERE id = ?1 ORDER BY rid")
        .map_err(|e| format!("prepare select: {e}"))?;
    let rows = parse_rows(
        st.query_map(params![id as i64], |r| r.get::<_, String>(0))
            .map_err(|e| format!("query rows: {e}"))?,
    )?;
    Ok(rows)
}

pub fn rows_for_ids(path: &Path, ids: &[u32]) -> Result<HashMap<u32, Vec<Value>>, String> {
    let conn = open(path)?;
    let mut st = conn
        .prepare("SELECT j FROM rows WHERE id = ?1 ORDER BY rid")
        .map_err(|e| format!("prepare select: {e}"))?;
    let mut out = HashMap::new();
    for &id in ids {
        let rows = parse_rows(
            st.query_map(params![id as i64], |r| r.get::<_, String>(0))
                .map_err(|e| format!("query rows: {e}"))?,
        )?;
        if !rows.is_empty() {
            out.insert(id, rows);
        }
    }
    Ok(out)
}

fn is_safe_ident(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

pub fn distinct_values(path: &Path, field: &str) -> Result<Vec<Value>, String> {
    if !is_safe_ident(field) {
        return Err(format!("invalid field name: {field}"));
    }
    let conn = open(path)?;
    let sql = format!(
        "SELECT DISTINCT json_extract(j, '$.{field}') AS v FROM rows WHERE v IS NOT NULL"
    );
    let mut st = conn.prepare(&sql).map_err(|e| format!("prepare distinct: {e}"))?;
    let it = st
        .query_map([], |r| {
            let v = r.get_ref(0)?;
            Ok(match v {
                rusqlite::types::ValueRef::Null => Value::Null,
                rusqlite::types::ValueRef::Integer(i) => Value::from(i),
                rusqlite::types::ValueRef::Real(f) => serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
                rusqlite::types::ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
                rusqlite::types::ValueRef::Blob(_) => Value::Null,
            })
        })
        .map_err(|e| format!("query distinct: {e}"))?;
    let mut out: Vec<Value> = Vec::new();
    for row in it {
        let v = row.map_err(|e| format!("read distinct: {e}"))?;
        if !v.is_null() {
            out.push(v);
        }
    }
    out.sort_by(|a, b| match (a.as_f64(), b.as_f64()) {
        (Some(x), Some(y)) => x.partial_cmp(&y).unwrap_or(std::cmp::Ordering::Equal),
        _ => a.to_string().cmp(&b.to_string()),
    });
    Ok(out)
}

pub fn dump_tree(path: &Path) -> Result<(Value, String, u32), String> {
    let conn = open(path)?;
    let m = read_all_meta(&conn)?;
    let section = m.get("section").cloned().unwrap_or_else(|| "skill".to_string());
    let shell_json = m.get("shell").cloned().unwrap_or_else(|| "{}".to_string());
    let dat_meta = m.get("dat_meta").cloned().unwrap_or_else(|| "null".to_string());
    let mut tree: Value = serde_json::from_str(&shell_json).map_err(|e| format!("parse shell: {e}"))?;
    let mut st = conn
        .prepare("SELECT j FROM rows ORDER BY rid")
        .map_err(|e| format!("prepare select all: {e}"))?;
    let raw: Vec<String> = st
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| format!("query all rows: {e}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("read row: {e}"))?;
    let n = raw.len() as u32;
    let rows: Vec<Value> = raw
        .into_par_iter()
        .map(|j| serde_json::from_str::<Value>(&j).map_err(|e| format!("parse cached row: {e}")))
        .collect::<Result<Vec<_>, _>>()?;
    if let Some(o) = tree.as_object_mut() {
        o.insert(section, Value::Array(rows));
    }
    Ok((tree, dat_meta, n))
}

pub type RowPatch<'a> = (i64, i64, &'a serde_json::Map<String, Value>);

pub struct EditResult {
    pub before: Vec<Value>,
    pub after: Vec<Value>,
    pub hits: u32,
}

pub fn apply_edits(path: &Path, id: u32, patches: &[RowPatch<'_>]) -> Result<EditResult, String> {
    let mut conn = open(path)?;
    let before = rows_for(path, id)?;
    if before.is_empty() {
        return Ok(EditResult { before, after: Vec::new(), hits: 0 });
    }

    let pairs: Vec<(i64, String)> = {
        let mut st = conn
            .prepare("SELECT rid, j FROM rows WHERE id = ?1 ORDER BY rid")
            .map_err(|e| format!("prepare: {e}"))?;
        let it = st
            .query_map(params![id as i64], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| format!("query: {e}"))?;
        let mut v = Vec::new();
        for row in it {
            v.push(row.map_err(|e| format!("read: {e}"))?);
        }
        v
    };

    let mut hits = 0u32;
    let mut after: Vec<Value> = Vec::with_capacity(pairs.len());
    let tx = conn.transaction().map_err(|e| format!("begin tx: {e}"))?;
    {
        let mut upd = tx.prepare("UPDATE rows SET j = ?1 WHERE rid = ?2").map_err(|e| format!("prepare update: {e}"))?;
        for (rid, j) in &pairs {
            let mut val: Value = serde_json::from_str(j).map_err(|e| format!("parse row: {e}"))?;
            let mut changed = false;
            if let Some(obj) = val.as_object_mut() {
                let lvl = obj.get("skill_level").and_then(Value::as_i64).unwrap_or(0);
                let sub = obj.get("skill_sublevel").and_then(Value::as_i64).unwrap_or(0);
                for &(p_lvl, p_sub, fields) in patches {
                    if p_lvl != lvl {
                        continue;
                    }
                    if p_sub != 0 && p_sub != sub {
                        continue;
                    }
                    for (k, v) in fields.iter() {
                        obj.insert(k.clone(), v.clone());
                    }
                    changed = true;
                    hits += 1;
                }
            }
            if changed {
                let nj = serde_json::to_string(&val).map_err(|e| format!("serialize row: {e}"))?;
                upd.execute(params![nj, rid]).map_err(|e| format!("update rid {rid}: {e}"))?;
            }
            after.push(val);
        }
    }
    tx.commit().map_err(|e| format!("commit: {e}"))?;
    Ok(EditResult { before, after, hits })
}

pub fn resize_for_id(path: &Path, id: u32, to_level: i64) -> Result<i32, String> {
    let mut conn = open(path)?;
    let template: Option<(i64, String)> = {
        let mut st = conn
            .prepare("SELECT lvl, j FROM rows WHERE id = ?1 AND sub = 0 ORDER BY lvl DESC LIMIT 1")
            .map_err(|e| format!("prepare: {e}"))?;
        st.query_row(params![id as i64], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .optional()
            .map_err(|e| format!("query template: {e}"))?
    };
    let Some((max_level, tmpl_json)) = template else {
        return Ok(0);
    };
    if to_level == max_level {
        return Ok(0);
    }

    let next_rid: i64 = conn
        .query_row("SELECT COALESCE(MAX(rid), 0) FROM rows", [], |r| r.get(0))
        .map_err(|e| format!("max rid: {e}"))?;

    let tx = conn.transaction().map_err(|e| format!("begin tx: {e}"))?;
    let mut delta: i32 = 0;
    if to_level > max_level {
        let mut tmpl: Value = serde_json::from_str(&tmpl_json).map_err(|e| format!("parse template: {e}"))?;
        let mut ins = tx
            .prepare("INSERT INTO rows (rid, id, lvl, sub, j) VALUES (?1, ?2, ?3, 0, ?4)")
            .map_err(|e| format!("prepare insert: {e}"))?;
        let mut rid = next_rid;
        for new_lvl in (max_level + 1)..=to_level {
            rid += 1;
            if let Some(o) = tmpl.as_object_mut() {
                o.insert("skill_level".to_string(), Value::from(new_lvl));
                o.insert("skill_sublevel".to_string(), Value::from(0i64));
            }
            let j = serde_json::to_string(&tmpl).map_err(|e| format!("serialize: {e}"))?;
            ins.execute(params![rid, id as i64, new_lvl, j]).map_err(|e| format!("insert lvl {new_lvl}: {e}"))?;
            delta += 1;
        }
    } else {
        let removed = tx
            .execute("DELETE FROM rows WHERE id = ?1 AND lvl > ?2", params![id as i64, to_level])
            .map_err(|e| format!("delete: {e}"))?;
        delta = -(removed as i32);
    }
    if delta != 0 {
        let n: i64 = tx.query_row("SELECT COUNT(*) FROM rows", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        put_meta(&tx, "row_count", &n.to_string())?;
    }
    tx.commit().map_err(|e| format!("commit: {e}"))?;
    Ok(delta)
}

pub fn apply_locator_edits(
    path: &Path,
    locator: &serde_json::Map<String, Value>,
    fields: &serde_json::Map<String, Value>,
) -> Result<Vec<u32>, String> {
    let mut conn = open(path)?;
    let index_field = get_meta(&conn, "index_field")?.unwrap_or_else(|| "skill_id".to_string());

    let pairs = candidate_rows(&conn, &index_field, locator)?;

    let mut touched: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let tx = conn.transaction().map_err(|e| format!("begin tx: {e}"))?;
    {
        let mut upd = tx
            .prepare("UPDATE rows SET j = ?1 WHERE rid = ?2")
            .map_err(|e| format!("prepare update: {e}"))?;
        for (rid, j) in &pairs {
            let mut val: Value = serde_json::from_str(j).map_err(|e| format!("parse row: {e}"))?;
            let row_id: Option<u32> = {
                let Some(obj) = val.as_object_mut() else { continue };
                if !locator.iter().all(|(k, want)| obj.get(k) == Some(want)) {
                    continue;
                }
                for (k, v) in fields.iter() {
                    obj.insert(k.clone(), v.clone());
                }
                obj.get(&index_field).and_then(Value::as_u64).map(|n| n as u32)
            };
            let nj = serde_json::to_string(&val).map_err(|e| format!("serialize row: {e}"))?;
            upd.execute(params![nj, rid]).map_err(|e| format!("update rid {rid}: {e}"))?;
            if let Some(id) = row_id {
                touched.insert(id);
            }
        }
    }
    tx.commit().map_err(|e| format!("commit: {e}"))?;
    Ok(touched.into_iter().collect())
}

fn candidate_rows(conn: &Connection, index_field: &str, locator: &serde_json::Map<String, Value>) -> Result<Vec<(i64, String)>, String> {
    let mut where_clauses: Vec<&str> = Vec::new();
    let mut binds: Vec<SqlValue> = Vec::new();
    if let Some(v) = locator.get(index_field).and_then(Value::as_i64) {
        where_clauses.push("id = ?");
        binds.push(SqlValue::Integer(v));
    }
    if let Some(v) = locator.get("skill_level").and_then(Value::as_i64) {
        where_clauses.push("lvl = ?");
        binds.push(SqlValue::Integer(v));
    }
    if let Some(v) = locator.get("skill_sublevel").and_then(Value::as_i64) {
        where_clauses.push("sub = ?");
        binds.push(SqlValue::Integer(v));
    }
    let sql = if where_clauses.is_empty() {
        "SELECT rid, j FROM rows ORDER BY rid".to_string()
    } else {
        format!(
            "SELECT rid, j FROM rows WHERE {} ORDER BY rid",
            where_clauses.join(" AND ")
        )
    };
    let mut st = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let mapper = |r: &rusqlite::Row<'_>| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?));
    let mut out = Vec::new();
    for r in st
        .query_map(params_from_iter(binds.iter()), mapper)
        .map_err(|e| format!("query: {e}"))?
    {
        out.push(r.map_err(|e| format!("read: {e}"))?);
    }
    Ok(out)
}

pub fn delete_rows(path: &Path, locator: &serde_json::Map<String, Value>) -> Result<Vec<u32>, String> {
    let mut conn = open(path)?;
    let index_field = get_meta(&conn, "index_field")?.unwrap_or_else(|| "skill_id".to_string());
    let candidates = candidate_rows(&conn, &index_field, locator)?;
    let mut touched: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut to_delete: Vec<i64> = Vec::new();
    for (rid, j) in &candidates {
        let val: Value = serde_json::from_str(j).map_err(|e| format!("parse row: {e}"))?;
        let Some(obj) = val.as_object() else { continue };
        if !locator.iter().all(|(k, want)| obj.get(k) == Some(want)) {
            continue;
        }
        if let Some(id) = obj.get(&index_field).and_then(Value::as_u64) {
            touched.insert(id as u32);
        }
        to_delete.push(*rid);
    }
    if to_delete.is_empty() {
        return Ok(Vec::new());
    }
    let tx = conn.transaction().map_err(|e| format!("begin tx: {e}"))?;
    {
        let mut del = tx.prepare("DELETE FROM rows WHERE rid = ?1").map_err(|e| format!("prepare delete: {e}"))?;
        for rid in &to_delete {
            del.execute(params![rid]).map_err(|e| format!("delete rid {rid}: {e}"))?;
        }
        let n: i64 = tx.query_row("SELECT COUNT(*) FROM rows", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        put_meta(&tx, "row_count", &n.to_string())?;
    }
    tx.commit().map_err(|e| format!("commit: {e}"))?;
    Ok(touched.into_iter().collect())
}

pub fn add_row(
    path: &Path,
    template_locator: &serde_json::Map<String, Value>,
    overrides: &serde_json::Map<String, Value>,
) -> Result<Option<u32>, String> {
    let conn = open(path)?;
    let index_field = get_meta(&conn, "index_field")?.unwrap_or_else(|| "skill_id".to_string());
    let template_json: Option<String> = {
        let mut found: Option<String> = None;
        if !template_locator.is_empty() {
            for (_, j) in candidate_rows(&conn, &index_field, template_locator)? {
                let val: Value = serde_json::from_str(&j).map_err(|e| format!("parse row: {e}"))?;
                if val.as_object().map(|o| template_locator.iter().all(|(k, w)| o.get(k) == Some(w))).unwrap_or(false) {
                    found = Some(j);
                    break;
                }
            }
        }
        if found.is_none() {
            found = conn
                .query_row("SELECT j FROM rows ORDER BY rid LIMIT 1", [], |r| r.get::<_, String>(0))
                .optional()
                .map_err(|e| format!("query first row: {e}"))?;
        }
        found
    };
    let Some(tj) = template_json else { return Ok(None) };
    let mut val: Value = serde_json::from_str(&tj).map_err(|e| format!("parse template: {e}"))?;
    let Some(obj) = val.as_object_mut() else { return Ok(None) };
    for (k, v) in overrides.iter() {
        obj.insert(k.clone(), v.clone());
    }
    let new_id = obj.get(&index_field).and_then(Value::as_u64).map(|n| n as u32);
    let id_col: Option<i64> = obj.get(&index_field).and_then(Value::as_i64);
    let lvl = obj.get("skill_level").and_then(Value::as_i64);
    let sub = obj.get("skill_sublevel").and_then(Value::as_i64);
    let next_rid: i64 = conn
        .query_row("SELECT COALESCE(MAX(rid), 0) FROM rows", [], |r| r.get(0))
        .map_err(|e| format!("max rid: {e}"))?;
    let j = serde_json::to_string(&val).map_err(|e| format!("serialize row: {e}"))?;
    conn.execute(
        "INSERT INTO rows (rid, id, lvl, sub, j) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![next_rid + 1, id_col, lvl, sub, j],
    )
    .map_err(|e| format!("insert row: {e}"))?;
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM rows", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    put_meta(&conn, "row_count", &n.to_string())?;
    Ok(new_id)
}
