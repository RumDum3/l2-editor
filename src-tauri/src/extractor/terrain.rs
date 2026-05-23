use std::io::{Cursor, Read};

use byteorder::{LittleEndian, ReadBytesExt};

use super::package::{read_compact_int, Package};

const TERRAININFO_PREFIX: usize = 17;

#[derive(Debug, Clone)]
pub struct LayerInfo {
    pub texture_obj: i32,
    pub alphamap_obj: i32,
    pub u_scale: f32,
    pub v_scale: f32,
}

#[derive(Debug)]
pub struct TerrainData {
    pub layers: Vec<LayerInfo>,
}

struct Prop {
    name: String,
    struct_name: String,
    payload: Vec<u8>,
}

fn read_u8c(c: &mut Cursor<&[u8]>) -> Option<u8> {
    let mut b = [0u8; 1];
    c.read_exact(&mut b).ok()?;
    Some(b[0])
}

fn read_block(pkg: &Package, c: &mut Cursor<&[u8]>) -> Vec<Prop> {
    let mut out = Vec::new();
    for _ in 0..1024 {
        let Ok(ni) = read_compact_int(c) else { break };
        let Some(nm) = pkg.name(ni) else { break };
        if nm == "None" {
            break;
        }
        let name = nm.to_string();
        let Some(info) = read_u8c(c) else { break };
        let ptype = info & 0x0F;
        let stype = (info >> 4) & 0x07;
        let arr = (info & 0x80) != 0;
        let mut struct_name = String::new();
        if ptype == 10 {
            let Ok(sni) = read_compact_int(c) else { break };
            struct_name = pkg.name(sni).unwrap_or("").to_string();
        }
        let size = match stype {
            0 => 1usize,
            1 => 2,
            2 => 4,
            3 => 12,
            4 => 16,
            5 => read_u8c(c).unwrap_or(0) as usize,
            6 => c.read_u16::<LittleEndian>().unwrap_or(0) as usize,
            7 => c.read_u32::<LittleEndian>().unwrap_or(0) as usize,
            _ => 0,
        };
        if arr && ptype != 3 {
            let _ = read_compact_int(c);
        }
        let mut payload = vec![0u8; size];
        if c.read_exact(&mut payload).is_err() {
            break;
        }
        out.push(Prop { name, struct_name, payload });
    }
    out
}

fn f32_of(p: &[u8]) -> f32 {
    if p.len() >= 4 {
        f32::from_le_bytes([p[0], p[1], p[2], p[3]])
    } else {
        0.0
    }
}

fn compact_of(p: &[u8]) -> i32 {
    read_compact_int(&mut Cursor::new(p)).unwrap_or(0)
}

pub fn parse_terrain(pkg: &Package) -> Option<TerrainData> {
    let exp = pkg
        .exports
        .iter()
        .find(|e| pkg.class_name_of(e) == Some("TerrainInfo"))?;
    let start = exp.serial_offset as usize + TERRAININFO_PREFIX;
    let end = (exp.serial_offset as usize + exp.serial_size as usize).min(pkg.bytes.len());
    if start >= end {
        return None;
    }
    let mut c = Cursor::new(&pkg.bytes[start..end]);
    let props = read_block(pkg, &mut c);

    let mut layers: Vec<LayerInfo> = Vec::new();
    for p in &props {
        if p.name == "Layers" && p.struct_name == "TerrainLayer" {
            let sub = read_block(pkg, &mut Cursor::new(&p.payload[..]));
            let mut tex = 0i32;
            let mut amap = 0i32;
            let mut us = 1.0f32;
            let mut vs = 1.0f32;
            for sp in &sub {
                match sp.name.as_str() {
                    "Texture" => tex = compact_of(&sp.payload),
                    "AlphaMap" => amap = compact_of(&sp.payload),
                    "UScale" => us = f32_of(&sp.payload),
                    "VScale" => vs = f32_of(&sp.payload),
                    _ => {}
                }
            }
            layers.push(LayerInfo { texture_obj: tex, alphamap_obj: amap, u_scale: us, v_scale: vs });
        }
    }

    if layers.is_empty() {
        return None;
    }
    Some(TerrainData { layers })
}

pub fn resolve_texture_ref(pkg: &Package, obj_idx: i32) -> Option<(String, String)> {
    if obj_idx >= 0 {
        return None;
    }
    let imp = pkg.imports.get((-obj_idx - 1) as usize)?;
    let tex_name = pkg.name(imp.name_index)?.to_string();
    let mut pkg_name = String::new();
    let mut o = imp.outer_index;
    for _ in 0..16 {
        if o >= 0 {
            break;
        }
        let oimp = pkg.imports.get((-o - 1) as usize)?;
        pkg_name = pkg.name(oimp.name_index)?.to_string();
        o = oimp.outer_index;
    }
    if pkg_name.is_empty() {
        return None;
    }
    Some((pkg_name, tex_name))
}

pub fn composite(
    td: &TerrainData,
    layer_tex: &[Option<super::texture::DecodedTexture>],
    alpha_tex: &[Option<super::texture::DecodedTexture>],
) -> (u32, u32, Vec<u8>) {
    use rayon::prelude::*;

    const OUT: usize = 512;
    let n = td.layers.len();
    let mut rgba = vec![0u8; OUT * OUT * 4];

    let sample = |li: usize, fu: f32, fv: f32| -> Option<(f32, f32, f32)> {
        let tex = layer_tex.get(li)?.as_ref()?;
        let tw = tex.width as usize;
        let th = tex.height as usize;
        if tw == 0 || th == 0 {
            return None;
        }
        let x = fu.rem_euclid(1.0) * tw as f32;
        let y = fv.rem_euclid(1.0) * th as f32;
        let x0 = x.floor() as usize % tw;
        let y0 = y.floor() as usize % th;
        let i = (y0 * tw + x0) * 4;
        Some((tex.rgba[i] as f32, tex.rgba[i + 1] as f32, tex.rgba[i + 2] as f32))
    };

    let weight_at = |li: usize, u: f32, v: f32| -> f32 {
        let Some(Some(mask)) = alpha_tex.get(li) else {
            return if li == 0 { 1.0 } else { 0.0 };
        };
        let mw = mask.width as usize;
        let mh = mask.height as usize;
        if mw == 0 || mh == 0 {
            return if li == 0 { 1.0 } else { 0.0 };
        }
        let fx = (u.clamp(0.0, 1.0) * mw as f32 - 0.5).max(0.0);
        let fy = (v.clamp(0.0, 1.0) * mh as f32 - 0.5).max(0.0);
        let x0 = (fx.floor() as usize).min(mw - 1);
        let y0 = (fy.floor() as usize).min(mh - 1);
        let x1 = (x0 + 1).min(mw - 1);
        let y1 = (y0 + 1).min(mh - 1);
        let tx = fx - x0 as f32;
        let ty = fy - y0 as f32;
        let r = |x: usize, y: usize| mask.rgba[(y * mw + x) * 4] as f32;
        let top = r(x0, y0) * (1.0 - tx) + r(x1, y0) * tx;
        let bot = r(x0, y1) * (1.0 - tx) + r(x1, y1) * tx;
        (top * (1.0 - ty) + bot * ty) / 255.0
    };

    rgba.par_chunks_mut(OUT * 4).enumerate().for_each(|(py, row)| {
        for px in 0..OUT {
            let u = px as f32 / OUT as f32;
            let v = py as f32 / OUT as f32;
            let fx = u * 256.0;
            let fy = v * 256.0;

            let layer_uv = |li: usize| -> (f32, f32) {
                let layer = &td.layers[li];
                let us = if layer.u_scale.abs() < 1e-3 { 1.0 } else { layer.u_scale };
                let vs = if layer.v_scale.abs() < 1e-3 { 1.0 } else { layer.v_scale };
                (fx / us * 2.0, fy / vs * 2.0)
            };

            let mut sum = (0f32, 0f32, 0f32);
            let mut alpha_used = 0f32;
            for li in (0..n).rev() {
                let (fu, fv) = layer_uv(li);
                let Some((r, g, b)) = sample(li, fu, fv) else {
                    continue;
                };
                let layer_alpha = (weight_at(li, u, v) - alpha_used).max(0.0);
                if layer_alpha <= 0.0 {
                    continue;
                }
                sum.0 += r * layer_alpha;
                sum.1 += g * layer_alpha;
                sum.2 += b * layer_alpha;
                alpha_used += layer_alpha;
            }
            if alpha_used < 1.0 {
                for li in 0..n {
                    let (fu, fv) = layer_uv(li);
                    if let Some((r, g, b)) = sample(li, fu, fv) {
                        let rem = 1.0 - alpha_used;
                        sum.0 += r * rem;
                        sum.1 += g * rem;
                        sum.2 += b * rem;
                        break;
                    }
                }
            }

            const BRIGHTEN: f32 = 1.2;
            let o = px * 4;
            row[o] = (sum.0 * BRIGHTEN).min(255.0) as u8;
            row[o + 1] = (sum.1 * BRIGHTEN).min(255.0) as u8;
            row[o + 2] = (sum.2 * BRIGHTEN).min(255.0) as u8;
            row[o + 3] = 255;
        }
    });
    (OUT as u32, OUT as u32, rgba)
}
