use std::io;

pub struct Cursor<'a> {
    pub buf: &'a [u8],
    pub pos: usize,
}

impl<'a> Cursor<'a> {
    pub fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }

    pub fn remaining(&self) -> usize {
        self.buf.len().saturating_sub(self.pos)
    }

    pub fn require(&self, n: usize) -> io::Result<()> {
        if self.remaining() < n {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                format!("need {n} bytes, only {} remaining at pos {}", self.remaining(), self.pos),
            ));
        }
        Ok(())
    }

    pub fn read_u8(&mut self) -> io::Result<u8> {
        self.require(1)?;
        let v = self.buf[self.pos];
        self.pos += 1;
        Ok(v)
    }

    pub fn read_i8(&mut self) -> io::Result<i8> {
        Ok(self.read_u8()? as i8)
    }

    pub fn read_u16(&mut self) -> io::Result<u16> {
        self.require(2)?;
        let v = u16::from_le_bytes([self.buf[self.pos], self.buf[self.pos + 1]]);
        self.pos += 2;
        Ok(v)
    }

    pub fn read_i16(&mut self) -> io::Result<i16> {
        Ok(self.read_u16()? as i16)
    }

    pub fn read_u32(&mut self) -> io::Result<u32> {
        self.require(4)?;
        let v = u32::from_le_bytes([
            self.buf[self.pos],
            self.buf[self.pos + 1],
            self.buf[self.pos + 2],
            self.buf[self.pos + 3],
        ]);
        self.pos += 4;
        Ok(v)
    }

    pub fn read_i32(&mut self) -> io::Result<i32> {
        Ok(self.read_u32()? as i32)
    }

    pub fn read_i64(&mut self) -> io::Result<i64> {
        self.require(8)?;
        let mut b = [0u8; 8];
        b.copy_from_slice(&self.buf[self.pos..self.pos + 8]);
        self.pos += 8;
        Ok(i64::from_le_bytes(b))
    }

    pub fn read_f32(&mut self) -> io::Result<f32> {
        Ok(f32::from_bits(self.read_u32()?))
    }

    pub fn read_f64(&mut self) -> io::Result<f64> {
        Ok(f64::from_bits(self.read_i64()? as u64))
    }

    pub fn read_compact_int(&mut self) -> io::Result<i32> {
        let mut output: i32 = 0;
        let mut signed = false;
        for i in 0..5 {
            let x = self.read_u8()? as i32;
            if i == 0 {
                if (x & 0x80) != 0 {
                    signed = true;
                }
                output |= x & 0x3F;
                if (x & 0x40) == 0 {
                    break;
                }
            } else if i == 4 {
                output |= (x & 0x1F) << 27;
            } else {
                output |= (x & 0x7F) << (6 + (i - 1) * 7);
                if (x & 0x80) == 0 {
                    break;
                }
            }
        }
        if signed {
            output = -output;
        }
        Ok(output)
    }

    pub fn read_utf_string(&mut self) -> io::Result<String> {
        let size = self.read_i32()?;
        if size <= 0 {
            return Ok(String::new());
        }
        let size = size as usize;
        if size > 1_000_000 {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "UNICODE string too large"));
        }
        self.require(size)?;
        let bytes = &self.buf[self.pos..self.pos + size];
        self.pos += size;
        let (s, _, _) = encoding_rs::UTF_16LE.decode(bytes);
        Ok(s.into_owned())
    }

    pub fn read_ascf(&mut self) -> io::Result<String> {
        let len = self.read_compact_int()?;
        if len == 0 {
            return Ok(String::new());
        }
        let (size, is_utf16) = if len > 0 { (len as usize, false) } else { ((-len * 2) as usize, true) };
        if size > 1_000_000 {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "ASCF string too large"));
        }
        self.require(size)?;
        let bytes = &self.buf[self.pos..self.pos + size];
        self.pos += size;
        let trim = if is_utf16 { 2 } else { 1 };
        let bytes = if bytes.len() >= trim { &bytes[..bytes.len() - trim] } else { bytes };
        let s = if is_utf16 {
            let (s, _, _) = encoding_rs::UTF_16LE.decode(bytes);
            s.into_owned()
        } else {
            let (s, _, _) = encoding_rs::WINDOWS_1252.decode(bytes);
            s.into_owned()
        };
        Ok(s)
    }

    pub fn read_rgb(&mut self) -> io::Result<String> {
        let r = self.read_u8()?;
        let g = self.read_u8()?;
        let b = self.read_u8()?;
        Ok(format!("{r:02X}{g:02X}{b:02X}"))
    }

    pub fn read_rgba(&mut self) -> io::Result<String> {
        let a = self.read_u8()?;
        let rgb = self.read_rgb()?;
        Ok(format!("{a:02X}{rgb}"))
    }
}

pub struct Writer {
    pub buf: Vec<u8>,
}

impl Writer {
    pub fn new() -> Self {
        Self { buf: Vec::new() }
    }

    pub fn into_bytes(self) -> Vec<u8> {
        self.buf
    }

    pub fn write_u8(&mut self, v: u8) {
        self.buf.push(v);
    }

    pub fn write_i8(&mut self, v: i8) {
        self.buf.push(v as u8);
    }

    pub fn write_u16(&mut self, v: u16) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    pub fn write_i16(&mut self, v: i16) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    pub fn write_u32(&mut self, v: u32) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    pub fn write_i32(&mut self, v: i32) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    pub fn write_i64(&mut self, v: i64) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    pub fn write_f32(&mut self, v: f32) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    pub fn write_f64(&mut self, v: f64) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    pub fn write_compact_int(&mut self, v: i32) {
        let negative = v < 0;
        let mut value = v.unsigned_abs();
        let bytes = [
            (value & 0x3F) as u8,
            ((value >> 6) & 0x7F) as u8,
            ((value >> 13) & 0x7F) as u8,
            ((value >> 20) & 0x7F) as u8,
            ((value >> 27) & 0x1F) as u8,
        ];
        let _ = &mut value;
        let mut size = 5;
        for i in (1..5).rev() {
            if bytes[i] == 0 {
                size -= 1;
            } else {
                break;
            }
        }
        let mut out = [0u8; 5];
        for i in 0..size {
            let mut b = bytes[i];
            if i != size - 1 {
                b |= if i == 0 { 0x40 } else { 0x80 };
            }
            if i == 0 && negative {
                b |= 0x80;
            }
            out[i] = b;
        }
        self.buf.extend_from_slice(&out[..size]);
    }

    pub fn write_utf_string(&mut self, s: &str) {
        if s.is_empty() {
            self.write_i32(0);
            return;
        }
        let utf16: Vec<u16> = s.encode_utf16().collect();
        let len_bytes = (utf16.len() * 2) as i32;
        self.write_i32(len_bytes);
        let start = self.buf.len();
        self.buf.resize(start + utf16.len() * 2, 0);
        for (i, c) in utf16.iter().enumerate() {
            let b = c.to_le_bytes();
            let p = start + i * 2;
            self.buf[p] = b[0];
            self.buf[p + 1] = b[1];
        }
    }

    pub fn write_ascf(&mut self, s: &str) {
        if s.is_empty() {
            self.write_compact_int(0);
            return;
        }
        let ascii_ok = s.chars().all(|c| c as u32 <= 0xFF);
        if ascii_ok {
            let char_count = s.chars().count();
            self.write_compact_int((char_count + 1) as i32);
            self.buf.reserve(char_count + 1);
            for c in s.chars() {
                self.buf.push(c as u8);
            }
            self.buf.push(0);
        } else {
            let utf16: Vec<u16> = s.encode_utf16().collect();
            let char_count = (utf16.len() + 1) as i32;
            self.write_compact_int(-char_count);
            let start = self.buf.len();
            self.buf.resize(start + utf16.len() * 2 + 2, 0);
            for (i, c) in utf16.iter().enumerate() {
                let b = c.to_le_bytes();
                let p = start + i * 2;
                self.buf[p] = b[0];
                self.buf[p + 1] = b[1];
            }
        }
    }

    pub fn write_rgb(&mut self, hex: &str) {
        let h = hex.trim();
        let bytes = parse_hex_bytes(h, 3);
        self.buf.extend_from_slice(&bytes);
    }

    pub fn write_rgba(&mut self, hex: &str) {
        let h = hex.trim();
        let bytes = parse_hex_bytes(h, 4);
        self.buf.extend_from_slice(&bytes);
    }
}

fn parse_hex_bytes(hex: &str, expected: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(expected);
    let chars: Vec<char> = hex.chars().filter(|c| !c.is_whitespace()).collect();
    let mut i = 0;
    while i + 1 < chars.len() && out.len() < expected {
        let hi = chars[i].to_digit(16).unwrap_or(0);
        let lo = chars[i + 1].to_digit(16).unwrap_or(0);
        out.push(((hi << 4) | lo) as u8);
        i += 2;
    }
    while out.len() < expected {
        out.push(0);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compact_int_roundtrip() {
        for v in [0, 1, 63, 64, 65, 127, 128, 8191, 8192, 65535, 65536, -1, -1000, i32::MAX, i32::MIN + 1] {
            let mut w = Writer::new();
            w.write_compact_int(v);
            let bytes = w.into_bytes();
            let mut c = Cursor::new(&bytes);
            assert_eq!(c.read_compact_int().unwrap(), v, "roundtrip failed for {v}");
        }
    }

    #[test]
    fn ascf_ascii_roundtrip() {
        let mut w = Writer::new();
        w.write_ascf("hello");
        let bytes = w.into_bytes();
        let mut c = Cursor::new(&bytes);
        assert_eq!(c.read_ascf().unwrap(), "hello");
    }

    #[test]
    fn ascf_utf16_roundtrip() {
        let mut w = Writer::new();
        w.write_ascf("héllo wörld 🦀");
        let bytes = w.into_bytes();
        let mut c = Cursor::new(&bytes);
        assert_eq!(c.read_ascf().unwrap(), "héllo wörld 🦀");
    }

    #[test]
    fn unicode_roundtrip() {
        let mut w = Writer::new();
        w.write_utf_string("café");
        let bytes = w.into_bytes();
        let mut c = Cursor::new(&bytes);
        assert_eq!(c.read_utf_string().unwrap(), "café");
    }

    #[test]
    fn rgb_roundtrip() {
        let mut w = Writer::new();
        w.write_rgb("AABBCC");
        let bytes = w.into_bytes();
        let mut c = Cursor::new(&bytes);
        assert_eq!(c.read_rgb().unwrap(), "AABBCC");
    }
}
