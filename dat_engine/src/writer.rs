use std::collections::HashMap;
use std::io;

use serde_json::{Map, Value};

use super::bytes::Writer;
use super::gamedataname::Names;
use super::schema::{FileSchema, Node, Reader_, SizeRef};

type Vars = HashMap<String, Value>;

const SAFE_PACKAGE_TRAILER: &[u8] = b"\x0cSafePackage\0";

pub struct WriteContext {
    pub names: Option<Names>,
    pub new_names: Vec<String>,
    pub names_index: HashMap<String, u32>,
    pub new_names_index: HashMap<String, u32>,
}

impl WriteContext {
    pub fn new(names: Option<Names>) -> Self {
        let names_index: HashMap<String, u32> = names
            .as_ref()
            .map(|p| p.iter().enumerate().map(|(i, s)| (s.clone(), i as u32)).collect())
            .unwrap_or_default();
        Self {
            names,
            new_names: Vec::new(),
            names_index,
            new_names_index: HashMap::new(),
        }
    }
}

pub fn normalize_for_write(nodes: &[Node], record: &mut Map<String, Value>) {
    for node in nodes {
        match node {
            Node::For { name, size, children, .. } => {
                let arr_len = record
                    .get(name)
                    .and_then(|v| v.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                if let SizeRef::Var(size_var) = size {
                    if let Some(field) = record.get_mut(size_var) {
                        if field.is_number() {
                            *field = Value::from(arr_len);
                        }
                    }
                }
                if let Some(arr) = record.get_mut(name).and_then(|v| v.as_array_mut()) {
                    for row in arr.iter_mut() {
                        if let Some(obj) = row.as_object_mut() {
                            normalize_for_write(children, obj);
                        }
                    }
                }
            }
            Node::Wrapper { children, .. } => {
                normalize_for_write(children, record);
            }
            Node::If { children, .. } | Node::Else { children, .. } | Node::Mask { children, .. } => {
                normalize_for_write(children, record);
            }
            Node::Leaf { .. } => {}
        }
    }
}

pub fn write_file(schema: &FileSchema, record: &Value, ctx: &mut WriteContext) -> io::Result<Vec<u8>> {
    let mut writer = Writer::new();
    let mut vars = Vars::new();
    let obj = record
        .as_object()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "expected top-level record"))?;
    write_record_into(&schema.nodes, obj, &mut vars, &mut writer, ctx)?;
    if schema.is_safe_package {
        writer.buf.extend_from_slice(SAFE_PACKAGE_TRAILER);
    }
    Ok(writer.into_bytes())
}

fn write_record_into(
    nodes: &[Node],
    record: &Map<String, Value>,
    vars: &mut Vars,
    w: &mut Writer,
    ctx: &mut WriteContext,
) -> io::Result<()> {
    for node in nodes {
        write_node(node, record, vars, w, ctx)?;
    }
    Ok(())
}

fn write_node(
    node: &Node,
    record: &Map<String, Value>,
    vars: &mut Vars,
    w: &mut Writer,
    ctx: &mut WriteContext,
) -> io::Result<()> {
    match node {
        Node::Leaf { name, reader, .. } => {
            let value = record.get(name).cloned().unwrap_or(Value::Null);
            write_leaf(*reader, &value, w, ctx)?;
            vars.insert(name.clone(), value);
        }
        Node::For { name, size, children, .. } => {
            const EMPTY: &Vec<Value> = &Vec::new();
            let arr: &Vec<Value> = record
                .get(name)
                .and_then(|v| v.as_array())
                .unwrap_or(EMPTY);
            let count = match size {
                SizeRef::Literal(n) => *n as usize,
                SizeRef::Var(v) => vars
                    .get(v)
                    .and_then(value_as_u32)
                    .map(|n| n as usize)
                    .unwrap_or(arr.len()),
            };
            if count != arr.len() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!(
                        "for-block `{}` count mismatch: schema says {count}, value array has {}",
                        name,
                        arr.len()
                    ),
                ));
            }
            let log_progress = arr.len() >= 50_000;
            let started = if log_progress {
                Some(std::time::Instant::now())
            } else {
                None
            };
            if log_progress {
                eprintln!("[writer] {} rows in `{}`…", arr.len(), name);
            }
            for (i, row) in arr.iter().enumerate() {
                match row {
                    Value::Object(o) => {
                        write_record_into(children, o, vars, w, ctx)?;
                    }
                    other => {
                        let mut tmp = Map::new();
                        if let Some(Node::Leaf { name: leaf_name, .. }) = children.first() {
                            tmp.insert(leaf_name.clone(), other.clone());
                        }
                        write_record_into(children, &tmp, vars, w, ctx)?;
                    }
                }
                if log_progress && (i + 1) % 50_000 == 0 {
                    eprintln!("[writer]   …{}/{} ({:?})", i + 1, arr.len(), started.unwrap().elapsed());
                }
            }
            if let Some(t) = started {
                eprintln!("[writer]   `{}` done in {:?}", name, t.elapsed());
            }
        }
        Node::Wrapper { children, .. } => {
            write_record_into(children, record, vars, w, ctx)?;
        }
        Node::If { param, val, children } => {
            if vars.get(param).map(|v| value_eq_str(v, val)).unwrap_or(false) {
                write_record_into(children, record, vars, w, ctx)?;
            }
        }
        Node::Else { param, val, children } => {
            if vars.get(param).map(|v| !value_eq_str(v, val)).unwrap_or(false) {
                write_record_into(children, record, vars, w, ctx)?;
            }
        }
        Node::Mask { param, val, children } => {
            let bits = vars.get(param).and_then(value_as_u32).unwrap_or(0);
            if (bits & val) == *val {
                write_record_into(children, record, vars, w, ctx)?;
            }
        }
    }
    Ok(())
}

fn write_leaf(r: Reader_, v: &Value, w: &mut Writer, ctx: &mut WriteContext) -> io::Result<()> {
    match r {
        Reader_::Uchar => w.write_i8(int_or_array_len_i32(v) as i8),
        Reader_::Ubyte => w.write_u8(int_or_array_len_u32(v) as u8),
        Reader_::Ushort => w.write_u16(int_or_array_len_u32(v) as u16),
        Reader_::Short => w.write_i16(int_or_array_len_i32(v) as i16),
        Reader_::Uint => w.write_u32(int_or_array_len_u32(v)),
        Reader_::Int => w.write_i32(int_or_array_len_i32(v)),
        Reader_::Cntr => w.write_compact_int(int_or_array_len_i32(v)),
        Reader_::Long => w.write_i64(value_as_i64(v).unwrap_or_else(|| {
            v.as_array().map(|a| a.len() as i64).unwrap_or(0)
        })),
        Reader_::Float => w.write_f32(value_as_f32(v).unwrap_or(0.0)),
        Reader_::Double => w.write_f64(value_as_f64(v).unwrap_or(0.0)),
        Reader_::Ascf => w.write_ascf(v.as_str().unwrap_or("")),
        Reader_::Unicode => w.write_utf_string(v.as_str().unwrap_or("")),
        Reader_::Rgb => w.write_rgb(v.as_str().unwrap_or("000000")),
        Reader_::Rgba => w.write_rgba(v.as_str().unwrap_or("00000000")),
        Reader_::Hex => {
            let s = v.as_str().unwrap_or("00");
            let n = u8::from_str_radix(s.trim(), 16).unwrap_or(0);
            w.write_u8(n);
        }
        Reader_::MapInt => {
            if let Some(idx) = value_as_u32(v) {
                w.write_u32(idx);
            } else if let Some(s) = v.as_str() {
                let idx = resolve_or_append_name(ctx, s);
                w.write_u32(idx);
            } else {
                w.write_u32(0);
            }
        }
    }
    Ok(())
}

fn resolve_or_append_name(ctx: &mut WriteContext, name: &str) -> u32 {
    if ctx.names.is_none() {
        return 0;
    }
    if let Some(idx) = ctx.names_index.get(name) {
        return *idx;
    }
    if let Some(idx) = ctx.new_names_index.get(name) {
        return *idx;
    }
    let base = ctx.names.as_ref().map(|p| p.len()).unwrap_or(0) as u32;
    let idx = base + ctx.new_names.len() as u32;
    ctx.new_names.push(name.to_string());
    ctx.new_names_index.insert(name.to_string(), idx);
    idx
}

fn int_or_array_len_u32(v: &Value) -> u32 {
    if let Some(n) = value_as_u32(v) {
        return n;
    }
    if let Some(arr) = v.as_array() {
        return arr.len() as u32;
    }
    0
}

fn int_or_array_len_i32(v: &Value) -> i32 {
    if let Some(n) = value_as_i32(v) {
        return n;
    }
    if let Some(arr) = v.as_array() {
        return arr.len() as i32;
    }
    0
}

fn value_as_u32(v: &Value) -> Option<u32> {
    v.as_u64().map(|x| x as u32).or_else(|| v.as_i64().map(|x| x as u32))
}
fn value_as_i32(v: &Value) -> Option<i32> {
    v.as_i64().map(|x| x as i32)
}
fn value_as_i64(v: &Value) -> Option<i64> {
    v.as_i64()
}
fn value_as_f32(v: &Value) -> Option<f32> {
    v.as_f64().map(|x| x as f32)
}
fn value_as_f64(v: &Value) -> Option<f64> {
    v.as_f64()
}
fn value_eq_str(v: &Value, s: &str) -> bool {
    match v {
        Value::String(x) => x.eq_ignore_ascii_case(s),
        Value::Number(n) => n.to_string() == s,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reader;
    use crate::schema;

    #[test]
    fn sysstring_roundtrip() {
        let mut w = Writer::new();
        w.write_u32(2);
        w.write_u32(100);
        w.write_ascf("Hello");
        w.write_u32(101);
        w.write_ascf("World");
        let mut bytes = w.into_bytes();
        bytes.extend_from_slice(SAFE_PACKAGE_TRAILER);

            let xml = r##"
            <list>
                <file pattern="ScionsOfDestiny" isSafePackage="true">
                    <node name="data" reader="UINT" />
                    <for name="string" size="#data" hidden="false">
                        <node name="stringID" reader="UINT" />
                        <node name="string" reader="ASCF" />
                    </for>
                </file>
            </list>
        "##;
        let schema = parse_inline_schema(xml);
        let file = &schema.files[0];

        let ctx = reader::ReadContext { names: None };
        let parsed = reader::read_file(file, &bytes, &ctx).unwrap();

        let mut wctx = WriteContext::new(None);
        let mut record = parsed.as_object().unwrap().clone();
        normalize_for_write(&file.nodes, &mut record);
        let written = write_file(file, &Value::Object(record), &mut wctx).unwrap();

        assert_eq!(bytes, written, "byte-for-byte round-trip");
    }

    fn parse_inline_schema(xml: &str) -> schema::Schema {
        let dir = std::env::temp_dir();
        let path = dir.join("aetherwind_test_schema.xml");
        std::fs::write(&path, xml).unwrap();
        schema::load_schema(&path).unwrap()
    }
}
