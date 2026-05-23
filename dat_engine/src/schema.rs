use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Reader_ {
    Uchar,
    Cntr,
    Ubyte,
    Ushort,
    Short,
    Uint,
    Int,
    Unicode,
    Ascf,
    Double,
    Float,
    Long,
    Rgba,
    Rgb,
    Hex,
    MapInt,
}

impl Reader_ {
    fn parse(s: &str) -> Option<Self> {
        Some(match s.to_ascii_uppercase().as_str() {
            "UCHAR" => Self::Uchar,
            "CNTR" => Self::Cntr,
            "UBYTE" => Self::Ubyte,
            "USHORT" => Self::Ushort,
            "SHORT" => Self::Short,
            "UINT" => Self::Uint,
            "INT" => Self::Int,
            "UNICODE" => Self::Unicode,
            "ASCF" => Self::Ascf,
            "DOUBLE" => Self::Double,
            "FLOAT" => Self::Float,
            "LONG" => Self::Long,
            "RGBA" => Self::Rgba,
            "RGB" => Self::Rgb,
            "HEX" => Self::Hex,
            "MAP_INT" => Self::MapInt,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Node {
    Leaf {
        name: String,
        reader: Reader_,
        #[serde(default)]
        is_iterator: bool,
        #[serde(default)]
        hidden: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        enum_name: Option<String>,
    },
    For {
        name: String,
        size: SizeRef,
        #[serde(default)]
        hidden: bool,
        children: Vec<Node>,
    },
    Wrapper {
        name: String,
        children: Vec<Node>,
    },
    If {
        param: String,
        val: String,
        children: Vec<Node>,
    },
    Else {
        param: String,
        val: String,
        children: Vec<Node>,
    },
    Mask {
        param: String,
        val: u32,
        children: Vec<Node>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum SizeRef {
    Literal(u32),
    Var(String),
}

impl SizeRef {
    fn parse(raw: &str) -> Self {
        if let Some(rest) = raw.strip_prefix('#') {
            Self::Var(rest.to_string())
        } else {
            Self::Literal(raw.parse().unwrap_or(0))
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSchema {
    pub pattern: String,
    pub is_safe_package: bool,
    pub format: Option<String>,
    pub nodes: Vec<Node>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schema {
    pub name: String,
    pub files: Vec<FileSchema>,
}

pub fn load_schema(path: &Path) -> io::Result<Schema> {
    let xml = fs::read_to_string(path)?;
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();
    let files = parse_schema_xml(&xml).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    Ok(Schema { name, files })
}

static CACHE: OnceLock<Mutex<HashMap<PathBuf, Arc<Schema>>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<PathBuf, Arc<Schema>>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn load_schema_cached(path: &Path) -> io::Result<Arc<Schema>> {
    if let Ok(lock) = cache().lock() {
        if let Some(s) = lock.get(path) {
            return Ok(s.clone());
        }
    }
    let schema = Arc::new(load_schema(path)?);
    if let Ok(mut lock) = cache().lock() {
        lock.insert(path.to_path_buf(), schema.clone());
    }
    Ok(schema)
}

fn parse_schema_xml(xml: &str) -> Result<Vec<FileSchema>, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut files: Vec<FileSchema> = Vec::new();

    loop {
        match reader.read_event_into(&mut buf).map_err(|e| e.to_string())? {
            Event::Start(e) if e.name().as_ref() == b"file" => {
                let mut pattern = String::new();
                let mut is_safe = false;
                let mut format = None;
                for attr in e.attributes().with_checks(false) {
                    let attr = attr.map_err(|e| e.to_string())?;
                    let val = attr.unescape_value().map_err(|e| e.to_string())?.into_owned();
                    match attr.key.as_ref() {
                        b"pattern" => pattern = val,
                        b"isSafePackage" => is_safe = val == "true",
                        b"format" => format = Some(val),
                        _ => {}
                    }
                }
                let nodes = parse_children(&mut reader, b"file")?;
                files.push(FileSchema { pattern, is_safe_package: is_safe, format, nodes });
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(files)
}

fn is_text_format_only(tag: &[u8]) -> bool {
    matches!(tag, b"write" | b"writeIf" | b"writeElse")
}

fn parse_children<R: std::io::BufRead>(
    reader: &mut Reader<R>,
    end_tag: &[u8],
) -> Result<Vec<Node>, String> {
    let mut buf = Vec::new();
    let mut out = Vec::new();
    loop {
        match reader.read_event_into(&mut buf).map_err(|e| e.to_string())? {
            Event::Start(e) => {
                if is_text_format_only(e.name().as_ref()) {
                    let _ = parse_children(reader, e.name().as_ref().to_vec().as_slice())?;
                } else {
                    let node = parse_open_node(reader, &e)?;
                    out.push(node);
                }
            }
            Event::Empty(e) => {
                if is_text_format_only(e.name().as_ref()) {
                } else {
                    let node = parse_empty_node(&e)?;
                    out.push(node);
                }
            }
            Event::End(e) if e.name().as_ref() == end_tag => return Ok(out),
            Event::Eof => return Err(format!("unexpected EOF before </{}>", String::from_utf8_lossy(end_tag))),
            _ => {}
        }
        buf.clear();
    }
}

fn attr<'a>(e: &'a quick_xml::events::BytesStart<'_>, key: &[u8]) -> Option<String> {
    for a in e.attributes().with_checks(false).flatten() {
        if a.key.as_ref() == key {
            return a.unescape_value().ok().map(|c| c.into_owned());
        }
    }
    None
}

fn parse_open_node<R: std::io::BufRead>(
    reader: &mut Reader<R>,
    e: &quick_xml::events::BytesStart<'_>,
) -> Result<Node, String> {
    let tag = e.name().as_ref().to_vec();
    let name_str = String::from_utf8_lossy(&tag).into_owned();
    match tag.as_slice() {
        b"for" => {
            let name = attr(e, b"name").unwrap_or_default();
            let size = attr(e, b"size").map(|s| SizeRef::parse(&s)).unwrap_or(SizeRef::Literal(0));
            let hidden = attr(e, b"hidden").map(|s| s == "true").unwrap_or(false);
            let children = parse_children(reader, &tag)?;
            Ok(Node::For { name, size, hidden, children })
        }
        b"wrapper" => {
            let name = attr(e, b"name").unwrap_or_default();
            let children = parse_children(reader, &tag)?;
            Ok(Node::Wrapper { name, children })
        }
        b"if" => {
            let param = attr(e, b"param").unwrap_or_default();
            let val = attr(e, b"val").unwrap_or_default();
            let children = parse_children(reader, &tag)?;
            Ok(Node::If { param, val, children })
        }
        b"else" => {
            let param = attr(e, b"param").unwrap_or_default();
            let val = attr(e, b"val").unwrap_or_default();
            let children = parse_children(reader, &tag)?;
            Ok(Node::Else { param, val, children })
        }
        b"mask" => {
            let param = attr(e, b"param").unwrap_or_default();
            let val = attr(e, b"val").and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
            let children = parse_children(reader, &tag)?;
            Ok(Node::Mask { param, val, children })
        }
        b"node" => {
            let n = parse_empty_node_inner(e, &name_str)?;
            let _ = parse_children(reader, &tag)?;
            Ok(n)
        }
        other => Err(format!("unknown schema element <{}>", String::from_utf8_lossy(other))),
    }
}

fn parse_empty_node(e: &quick_xml::events::BytesStart<'_>) -> Result<Node, String> {
    let tag = e.name().as_ref().to_vec();
    let name_str = String::from_utf8_lossy(&tag).into_owned();
    match tag.as_slice() {
        b"node" => parse_empty_node_inner(e, &name_str),
        b"for" => {
            let name = attr(e, b"name").unwrap_or_default();
            let size = attr(e, b"size").map(|s| SizeRef::parse(&s)).unwrap_or(SizeRef::Literal(0));
            let hidden = attr(e, b"hidden").map(|s| s == "true").unwrap_or(false);
            Ok(Node::For { name, size, hidden, children: vec![] })
        }
        other => Err(format!("unexpected empty <{}>", String::from_utf8_lossy(other))),
    }
}

fn parse_empty_node_inner(e: &quick_xml::events::BytesStart<'_>, _: &str) -> Result<Node, String> {
    let name = attr(e, b"name").unwrap_or_default();
    let reader = attr(e, b"reader")
        .and_then(|s| Reader_::parse(&s))
        .ok_or_else(|| format!("<node name={name:?}> missing/invalid reader"))?;
    let is_iterator = attr(e, b"isIterator").map(|s| s == "true").unwrap_or(false);
    let hidden = attr(e, b"hidden").map(|s| s == "true").unwrap_or(false);
    let enum_name = attr(e, b"enumName");
    Ok(Node::Leaf { name, reader, is_iterator, hidden, enum_name })
}
