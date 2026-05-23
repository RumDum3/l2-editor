pub fn decrypt_xor_byte(body: &[u8], key: u8) -> Vec<u8> {
    body.iter().map(|b| b ^ key).collect()
}

pub fn xor_key_121(file_name: &str) -> u8 {
    let lower = file_name.to_lowercase();
    let mut sum: u32 = 0;
    for ch in lower.chars() {
        sum = sum.wrapping_add(ch as u32);
    }
    (sum & 0xFF) as u8
}

pub fn decrypt_v120(body: &[u8]) -> Vec<u8> {
    let mut ind: u32 = 230;
    let mut out = Vec::with_capacity(body.len());
    for &b in body {
        out.push(b ^ xor_key_120(ind));
        ind = ind.wrapping_add(1);
    }
    out
}

fn xor_key_120(n: u32) -> u8 {
    let d1 = (n & 0xF) as u8;
    let d2 = ((n >> 4) & 0xF) as u8;
    let d3 = ((n >> 8) & 0xF) as u8;
    let d4 = ((n >> 12) & 0xF) as u8;
    ((d2 ^ d4) << 4) | (d1 ^ d3)
}
