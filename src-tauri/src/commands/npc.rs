use std::fs;
use std::path::Path;

use crate::util::atomic_write;

#[tauri::command]
pub async fn load_npc_xml(file_path: String, npc_id: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let content = fs::read_to_string(&file_path).map_err(|e| format!("read {file_path}: {e}"))?;
        let (start, end) = find_npc_block(&content, npc_id)?;
        Ok(content[start..end].to_string())
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

#[tauri::command]
pub async fn save_npc_xml(file_path: String, npc_id: u32, npc_xml: String) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<u32, String> {
        let content = fs::read_to_string(&file_path).map_err(|e| format!("read {file_path}: {e}"))?;
        let (start, end) = find_npc_block(&content, npc_id)?;

        let line_start = content[..start].rfind('\n').map(|i| i + 1).unwrap_or(0);
        let indent = &content[line_start..start];
        let reindented = reindent_block(&npc_xml, indent);

        let mut out = String::with_capacity(content.len() + reindented.len());
        out.push_str(&content[..start]);
        out.push_str(reindented.trim_start());
        out.push_str(&content[end..]);
        atomic_write(Path::new(&file_path), out.as_bytes())?;
        Ok(out.len() as u32)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

fn find_npc_block(content: &str, npc_id: u32) -> Result<(usize, usize), String> {
    let needle_a = format!("id=\"{npc_id}\"");
    let needle_b = format!("id='{npc_id}'");
    let mut search = 0usize;
    loop {
        let abs_id = content[search..]
            .find(&needle_a)
            .map(|i| search + i)
            .or_else(|| content[search..].find(&needle_b).map(|i| search + i))
            .ok_or_else(|| format!("npc id={npc_id} not found in file"))?;
        let tag_open = content[..abs_id]
            .rfind('<')
            .ok_or_else(|| format!("malformed XML near id={npc_id}"))?;
        let tag_slice = &content[tag_open..];
        let tag_after_lt = &content[tag_open + 1..];
        let is_npc = tag_after_lt.starts_with("npc")
            && tag_after_lt
                .as_bytes()
                .get(3)
                .map(|b| b.is_ascii_whitespace() || *b == b'/' || *b == b'>')
                .unwrap_or(false);
        if !is_npc {
            search = abs_id + needle_a.len();
            continue;
        }
        let open_close_rel = tag_slice
            .find('>')
            .ok_or_else(|| format!("unclosed opening <npc> for id={npc_id}"))?;
        let after_open = tag_open + open_close_rel + 1;
        let self_closing = tag_slice[..open_close_rel].ends_with('/');
        let end = if self_closing {
            after_open
        } else {
            let rel = content[after_open..]
                .find("</npc>")
                .ok_or_else(|| format!("no </npc> closing tag for id={npc_id}"))?;
            after_open + rel + "</npc>".len()
        };
        return Ok((tag_open, end));
    }
}

fn reindent_block(xml: &str, base_indent: &str) -> String {
    let trimmed = xml.trim();
    let mut out = String::with_capacity(trimmed.len() + base_indent.len());
    for (i, line) in trimmed.lines().enumerate() {
        if i > 0 {
            out.push('\n');
            if !line.trim().is_empty() {
                out.push_str(base_indent);
            }
        }
        out.push_str(line);
    }
    out
}
