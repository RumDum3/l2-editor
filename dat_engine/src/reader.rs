use std::collections::HashMap;
use std::io;

use serde_json::{json, Map, Value};

use super::bytes::Cursor;
use super::gamedataname::Names;
use super::schema::{FileSchema, Node, Reader_, SizeRef};

type Vars = HashMap<String, Value>;

pub struct ReadContext {
    pub names: Option<Names>,
}

pub trait ReadSink {
    fn other_field(&mut self, name: &str, value: Value);
    fn section_start(&mut self, name: &str, total: u32, columns: Vec<ColumnInfo>);
    fn row(&mut self, section: &str, idx: u32, row: Value);
    fn section_end(&mut self, name: &str);
}

impl<S: ReadSink + ?Sized> ReadSink for Box<S> {
    fn other_field(&mut self, name: &str, value: Value) {
        (**self).other_field(name, value);
    }
    fn section_start(&mut self, name: &str, total: u32, columns: Vec<ColumnInfo>) {
        (**self).section_start(name, total, columns);
    }
    fn row(&mut self, section: &str, idx: u32, row: Value) {
        (**self).row(section, idx, row);
    }
    fn section_end(&mut self, name: &str) {
        (**self).section_end(name);
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub reader: Reader_,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub is_iterator: bool,
}

fn collect_columns(nodes: &[Node]) -> Vec<ColumnInfo> {
    let mut out = Vec::new();
    for n in nodes {
        match n {
            Node::Leaf { name, reader, is_iterator, .. } => {
                if !is_iterator {
                    out.push(ColumnInfo { name: name.clone(), reader: *reader, is_iterator: false });
                }
            }
            Node::Wrapper { children, .. } => out.extend(collect_columns(children)),
            Node::For { name, .. } => {
                out.push(ColumnInfo {
                    name: name.clone(),
                    reader: Reader_::Ascf,
                    is_iterator: false,
                });
            }
            Node::If { children, .. } | Node::Else { children, .. } | Node::Mask { children, .. } => {
                out.extend(collect_columns(children));
            }
        }
    }
    out
}

pub fn read_streaming<S: ReadSink>(
    schema: &FileSchema,
    body: &[u8],
    ctx: &ReadContext,
    sink: &mut S,
) -> io::Result<()> {
    let mut cur = Cursor::new(body);
    let mut vars = Vars::new();
    for node in &schema.nodes {
        match node {
            Node::For { name, size, hidden, children } => {
                let n = resolve_size(size, &vars)?;
                if !hidden {
                    sink.section_start(name, n, collect_columns(children));
                }
                for i in 0..n {
                    let mut child_record = Map::new();
                    for c in children {
                        merge_into_record(c, &mut child_record, &mut vars, &mut cur, ctx)?;
                    }
                    if !hidden {
                        let row = if child_record.len() == 1 {
                            child_record.into_iter().next().unwrap().1
                        } else {
                            Value::Object(child_record)
                        };
                        sink.row(name, i, row);
                    }
                }
                if !hidden {
                    sink.section_end(name);
                }
            }
            other => {
                let mut tmp = Map::new();
                merge_into_record(other, &mut tmp, &mut vars, &mut cur, ctx)?;
                for (k, v) in tmp {
                    sink.other_field(&k, v);
                }
            }
        }
    }
    Ok(())
}

pub fn read_file(schema: &FileSchema, body: &[u8], ctx: &ReadContext) -> io::Result<Value> {
    let mut cur = Cursor::new(body);
    let mut vars = Vars::new();
    let mut record = Map::new();
    for node in &schema.nodes {
        merge_into_record(node, &mut record, &mut vars, &mut cur, ctx)?;
    }

    let trailer = if schema.is_safe_package { 13 } else { 0 };
    let consumed = cur.pos;
    let extra = cur.buf.len().saturating_sub(consumed + trailer);
    if extra > 0 {
        eprintln!(
            "[dat] {} bytes left after parse (consumed {}/{}, trailer {})",
            extra,
            consumed,
            cur.buf.len(),
            trailer
        );
    }

    Ok(Value::Object(record))
}

fn merge_into_record(
    node: &Node,
    record: &mut Map<String, Value>,
    vars: &mut Vars,
    cur: &mut Cursor,
    ctx: &ReadContext,
) -> io::Result<()> {
    match node {
        Node::Leaf { name, reader, is_iterator, .. } => {
            let v = read_leaf(*reader, cur, ctx)?;
            vars.insert(name.clone(), v.clone());
            if !is_iterator {
                record.insert(name.clone(), v);
            }
        }
        Node::For { name, size, hidden, children } => {
            let n = resolve_size(size, vars)?;
            let mut items = Vec::with_capacity(n.min(1024) as usize);
            for _ in 0..n {
                let mut child_record = Map::new();
                for c in children {
                    merge_into_record(c, &mut child_record, vars, cur, ctx)?;
                }
                let row = if child_record.len() == 1 {
                    child_record.into_iter().next().unwrap().1
                } else {
                    Value::Object(child_record)
                };
                items.push(row);
            }
            if !hidden {
                record.insert(name.clone(), Value::Array(items));
            }
        }
        Node::Wrapper { children, .. } => {
            for c in children {
                merge_into_record(c, record, vars, cur, ctx)?;
            }
        }
        Node::If { param, val, children } => {
            if vars.get(param).map(|v| value_eq_str(v, val)).unwrap_or(false) {
                for c in children {
                    merge_into_record(c, record, vars, cur, ctx)?;
                }
            }
        }
        Node::Else { param, val, children } => {
            if vars.get(param).map(|v| !value_eq_str(v, val)).unwrap_or(false) {
                for c in children {
                    merge_into_record(c, record, vars, cur, ctx)?;
                }
            }
        }
        Node::Mask { param, val, children } => {
            let bits = vars.get(param).and_then(value_as_u32).unwrap_or(0);
            if (bits & val) == *val {
                for c in children {
                    merge_into_record(c, record, vars, cur, ctx)?;
                }
            }
        }
    }
    Ok(())
}

fn read_leaf(r: Reader_, cur: &mut Cursor, ctx: &ReadContext) -> io::Result<Value> {
    Ok(match r {
        Reader_::Uchar => json!(cur.read_i8()? as i32),
        Reader_::Ubyte => json!(cur.read_u8()? as u32),
        Reader_::Ushort => json!(cur.read_u16()? as u32),
        Reader_::Short => json!(cur.read_i16()? as i32),
        Reader_::Uint => json!(cur.read_u32()?),
        Reader_::Int => json!(cur.read_i32()?),
        Reader_::Cntr => json!(cur.read_compact_int()?),
        Reader_::Long => json!(cur.read_i64()?),
        Reader_::Float => json!(cur.read_f32()?),
        Reader_::Double => json!(cur.read_f64()?),
        Reader_::Ascf => json!(cur.read_ascf()?),
        Reader_::Unicode => json!(cur.read_utf_string()?),
        Reader_::Rgb => json!(cur.read_rgb()?),
        Reader_::Rgba => json!(cur.read_rgba()?),
        Reader_::Hex => json!(format!("{:02X}", cur.read_u8()?)),
        Reader_::MapInt => {
            let idx = cur.read_u32()? as usize;
            match ctx.names.as_deref().and_then(|n| n.get(idx)) {
                Some(s) => json!(s),
                None => json!(idx),
            }
        }
    })
}

fn resolve_size(size: &SizeRef, vars: &Vars) -> io::Result<u32> {
    Ok(match size {
        SizeRef::Literal(n) => *n,
        SizeRef::Var(name) => vars
            .get(name)
            .and_then(value_as_u32)
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("for size=#{name} but variable not bound"),
                )
            })?,
    })
}

fn value_eq_str(v: &Value, target: &str) -> bool {
    match v {
        Value::String(s) => s.eq_ignore_ascii_case(target),
        Value::Number(n) => n.to_string() == target,
        _ => false,
    }
}

fn value_as_u32(v: &Value) -> Option<u32> {
    match v {
        Value::Number(n) => n.as_u64().map(|x| x as u32).or_else(|| n.as_i64().map(|x| x as u32)),
        _ => None,
    }
}
