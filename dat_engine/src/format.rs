use std::collections::HashMap;

use rayon::prelude::*;
use serde_json::{Map, Value};

use super::reader::{ColumnInfo, ReadSink};
use super::schema::Reader_;

const SKILL_NAME_FIELDS: &[&str] = &[
    "name",
    "desc",
    "desc_param",
    "enchant_name",
    "enchant_name_param",
    "enchant_desc",
    "enchant_desc_param",
];

pub struct SkillNameFormatSink<S: ReadSink> {
    inner: S,
    txt_index: HashMap<u32, String>,
}

impl<S: ReadSink> SkillNameFormatSink<S> {
    pub fn new(inner: S) -> Self {
        Self { inner, txt_index: HashMap::new() }
    }
}

impl<S: ReadSink> ReadSink for SkillNameFormatSink<S> {
    fn other_field(&mut self, name: &str, value: Value) {
        self.inner.other_field(name, value);
    }

    fn section_start(&mut self, name: &str, total: u32, columns: Vec<ColumnInfo>) {
        if name == "skill_txt" {
            return;
        }
        if name == "skill" {
            let columns = columns
                .into_iter()
                .map(|c| {
                    if SKILL_NAME_FIELDS.contains(&c.name.as_str()) {
                        ColumnInfo { name: c.name, reader: Reader_::Ascf, is_iterator: c.is_iterator }
                    } else {
                        c
                    }
                })
                .collect();
            self.inner.section_start(name, total, columns);
            return;
        }
        self.inner.section_start(name, total, columns);
    }

    fn row(&mut self, section: &str, idx: u32, row: Value) {
        if section == "skill_txt" {
            if let Some(obj) = row.as_object() {
                let text = obj.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let index = obj.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                self.txt_index.insert(index, text);
            }
            return;
        }
        if section == "skill" {
            let mut row = row;
            if let Some(obj) = row.as_object_mut() {
                for field in SKILL_NAME_FIELDS {
                    if let Some(v) = obj.get(*field).and_then(|v| v.as_u64()) {
                        let text = self.txt_index.get(&(v as u32)).cloned().unwrap_or_default();
                        obj.insert(field.to_string(), Value::String(text));
                    }
                }
            }
            self.inner.row(section, idx, row);
            return;
        }
        self.inner.row(section, idx, row);
    }

    fn section_end(&mut self, name: &str) {
        if name == "skill_txt" {
            return;
        }
        self.inner.section_end(name);
    }
}

pub fn skillname_prepare_for_save(record: &mut Map<String, Value>) {
    let Some(skill_arr) = record.get_mut("skill").and_then(|v| v.as_array_mut()) else {
        return;
    };

    let est_unique = (skill_arr.len() / 4).max(64);
    let mut texts: Vec<String> = Vec::with_capacity(est_unique);
    let mut name_to_idx: HashMap<String, u32> = HashMap::with_capacity(est_unique);

    for skill in skill_arr.iter() {
        let Some(obj) = skill.as_object() else { continue };
        for field in SKILL_NAME_FIELDS {
            if let Some(s) = obj.get(*field).and_then(|v| v.as_str()) {
                if !name_to_idx.contains_key(s) {
                    let idx = texts.len() as u32;
                    texts.push(s.to_string());
                    name_to_idx.insert(s.to_string(), idx);
                }
            }
        }
    }

    skill_arr.par_iter_mut().for_each(|skill| {
        let Some(obj) = skill.as_object_mut() else { return };
        for field in SKILL_NAME_FIELDS {
            let idx = match obj.get(*field).and_then(|v| v.as_str()) {
                Some(s) => *name_to_idx.get(s).unwrap_or(&0),
                None => continue,
            };
            obj.insert((*field).to_string(), Value::from(idx));
        }
    });

    let mut skill_txt: Vec<Value> = Vec::with_capacity(texts.len());
    for (i, t) in texts.into_iter().enumerate() {
        let mut o = Map::new();
        o.insert("text".to_string(), Value::String(t));
        o.insert("index".to_string(), Value::from(i as u32));
        skill_txt.push(Value::Object(o));
    }
    record.insert("data".to_string(), Value::from(skill_txt.len() as u32));
    record.insert("skill_txt".to_string(), Value::Array(skill_txt));
}

#[allow(dead_code)]
pub fn is_supported_format(format: &str) -> bool {
    matches!(format, "SkillNameFormat")
}
