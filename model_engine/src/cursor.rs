use std::io;

#[derive(Debug)]
pub enum CursorError {
    UnexpectedEof,
    BadString(&'static str),
}

impl std::fmt::Display for CursorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CursorError::UnexpectedEof => write!(f, "unexpected end of package buffer"),
            CursorError::BadString(s) => write!(f, "malformed string: {s}"),
        }
    }
}

impl std::error::Error for CursorError {}

impl From<CursorError> for io::Error {
    fn from(e: CursorError) -> io::Error {
        io::Error::new(io::ErrorKind::UnexpectedEof, e.to_string())
    }
}

pub struct Cursor<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    pub fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }

    pub fn position(&self) -> usize {
        self.pos
    }

    pub fn set_position(&mut self, pos: usize) -> Result<(), CursorError> {
        if pos > self.buf.len() {
            return Err(CursorError::UnexpectedEof);
        }
        self.pos = pos;
        Ok(())
    }

    pub fn remaining(&self) -> usize {
        self.buf.len() - self.pos
    }

    pub fn read_bytes(&mut self, n: usize) -> Result<&'a [u8], CursorError> {
        if self.remaining() < n {
            return Err(CursorError::UnexpectedEof);
        }
        let out = &self.buf[self.pos..self.pos + n];
        self.pos += n;
        Ok(out)
    }

    pub fn skip(&mut self, n: usize) -> Result<(), CursorError> {
        if self.remaining() < n {
            return Err(CursorError::UnexpectedEof);
        }
        self.pos += n;
        Ok(())
    }

    pub fn read_u8(&mut self) -> Result<u8, CursorError> {
        Ok(self.read_bytes(1)?[0])
    }

    pub fn read_u16(&mut self) -> Result<u16, CursorError> {
        let b = self.read_bytes(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    pub fn read_u32(&mut self) -> Result<u32, CursorError> {
        let b = self.read_bytes(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    pub fn read_i32(&mut self) -> Result<i32, CursorError> {
        Ok(self.read_u32()? as i32)
    }

    pub fn read_u64(&mut self) -> Result<u64, CursorError> {
        let b = self.read_bytes(8)?;
        Ok(u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
    }

    pub fn read_f32(&mut self) -> Result<f32, CursorError> {
        let b = self.read_bytes(4)?;
        Ok(f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    pub fn read_fstring(&mut self) -> Result<String, CursorError> {
        let len = self.read_i32()?;
        if len == 0 {
            return Ok(String::new());
        }
        if len > 0 {
            let bytes = self.read_bytes(len as usize)?;
            let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
            Ok(String::from_utf8_lossy(&bytes[..end]).into_owned())
        } else {
            let chars = (-len) as usize;
            let bytes = self.read_bytes(chars * 2)?;
            let units: Vec<u16> = bytes
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            let end = units.iter().position(|&u| u == 0).unwrap_or(units.len());
            String::from_utf16(&units[..end]).map_err(|_| CursorError::BadString("utf16"))
        }
    }

    pub fn read_compact_index(&mut self) -> Result<i32, CursorError> {
        let b0 = self.read_u8()?;
        let negative = (b0 & 0x80) != 0;
        let mut value: u32 = (b0 & 0x3F) as u32;
        if b0 & 0x40 != 0 {
            let b1 = self.read_u8()?;
            value |= ((b1 & 0x7F) as u32) << 6;
            if b1 & 0x80 != 0 {
                let b2 = self.read_u8()?;
                value |= ((b2 & 0x7F) as u32) << 13;
                if b2 & 0x80 != 0 {
                    let b3 = self.read_u8()?;
                    value |= ((b3 & 0x7F) as u32) << 20;
                    if b3 & 0x80 != 0 {
                        let b4 = self.read_u8()?;
                        value |= ((b4 & 0x1F) as u32) << 27;
                    }
                }
            }
        }
        Ok(if negative { -(value as i32) } else { value as i32 })
    }
}
