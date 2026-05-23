use std::fs;
use std::io;
use std::path::Path;
use std::sync::OnceLock;

use quick_xml::events::Event;
use quick_xml::Reader;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DispatchEntry {
    pub pattern: String,
    pub schema_name: String,
    pub chronicle: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DispatchTable {
    pub chronicle_name: String,
    pub entries: Vec<DispatchEntry>,
}

pub fn load_dispatch(path: &Path) -> io::Result<DispatchTable> {
    let xml = fs::read_to_string(path)?;
    parse_dispatch(&xml).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

fn parse_dispatch(xml: &str) -> Result<DispatchTable, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut chronicle_name = String::new();
    let mut entries = Vec::new();

    loop {
        match reader.read_event_into(&mut buf).map_err(|e| e.to_string())? {
            Event::Start(e) | Event::Empty(e) if e.name().as_ref() == b"list" => {
                if let Some(n) = attr(&e, b"name") {
                    chronicle_name = n;
                }
            }
            Event::Empty(e) if e.name().as_ref() == b"link" => {
                let pattern = attr(&e, b"pattern").unwrap_or_default();
                let schema_name = attr(&e, b"file").unwrap_or_default();
                let chronicle = attr(&e, b"version").unwrap_or_default();
                entries.push(DispatchEntry { pattern, schema_name, chronicle });
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(DispatchTable { chronicle_name, entries })
}

fn attr(e: &quick_xml::events::BytesStart<'_>, key: &[u8]) -> Option<String> {
    for a in e.attributes().with_checks(false).flatten() {
        if a.key.as_ref() == key {
            return a.unescape_value().ok().map(|c| c.into_owned());
        }
    }
    None
}

pub fn find_entry<'a>(table: &'a DispatchTable, basename: &str) -> Option<&'a DispatchEntry> {
    for e in &table.entries {
        let anchored = format!("(?i)^{}$", e.pattern);
        if Regex::new(&anchored).map(|r| r.is_match(basename)).unwrap_or(false) {
            return Some(e);
        }
    }
    None
}

pub struct CompiledDispatch {
    pub table: DispatchTable,
    pub regexes: Vec<Regex>,
}

static CACHED: OnceLock<CompiledDispatch> = OnceLock::new();

pub fn load_compiled(path: &Path) -> io::Result<&'static CompiledDispatch> {
    if let Some(c) = CACHED.get() {
        return Ok(c);
    }
    let table = load_dispatch(path)?;
    let unmatchable = Regex::new("(?-u)a^").expect("trivial unmatchable regex");
    let regexes: Vec<Regex> = table
        .entries
        .iter()
        .map(|e| {
            Regex::new(&format!("(?i)^{}$", e.pattern)).unwrap_or_else(|_| unmatchable.clone())
        })
        .collect();
    let _ = CACHED.set(CompiledDispatch { table, regexes });
    Ok(CACHED.get().expect("just set"))
}

pub fn find_in_compiled<'a>(
    cached: &'a CompiledDispatch,
    basename: &str,
) -> Option<&'a DispatchEntry> {
    cached
        .regexes
        .iter()
        .zip(cached.table.entries.iter())
        .find_map(|(re, e)| if re.is_match(basename) { Some(e) } else { None })
}
