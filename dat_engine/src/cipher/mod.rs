mod lame;
mod rsa;
mod xor;

use std::io;

#[derive(Debug)]
pub enum CipherError {
    Io(io::Error),
    NotL2File,
    UnsupportedVersion(u32),
    BadBlock(&'static str),
    DecodeUtf16,
}

impl From<io::Error> for CipherError {
    fn from(e: io::Error) -> Self {
        CipherError::Io(e)
    }
}

impl std::fmt::Display for CipherError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CipherError::Io(e) => write!(f, "io: {e}"),
            CipherError::NotL2File => write!(f, "not a Lineage 2 encrypted file"),
            CipherError::UnsupportedVersion(v) => write!(f, "unsupported crypt version: {v}"),
            CipherError::BadBlock(s) => write!(f, "bad block: {s}"),
            CipherError::DecodeUtf16 => write!(f, "header is not valid UTF-16LE"),
        }
    }
}

impl std::error::Error for CipherError {}

const HEADER_SIZE: usize = 28;
const RSA_FOOTER_SIZE: usize = 20;
const V41X_FOOTER: [u8; 20] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100];

pub fn read_header(bytes: &[u8]) -> Result<u32, CipherError> {
    if bytes.len() < HEADER_SIZE {
        return Err(CipherError::NotL2File);
    }
    let utf16: Vec<u16> = bytes[..HEADER_SIZE]
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    let header = String::from_utf16(&utf16).map_err(|_| CipherError::DecodeUtf16)?;
    if !header.starts_with("Lineage2Ver") || header.len() != 14 {
        return Err(CipherError::NotL2File);
    }
    header[11..].parse().map_err(|_| CipherError::NotL2File)
}

pub fn decrypt(file: &[u8], file_name: &str) -> Result<(u32, Vec<u8>), CipherError> {
    let code = read_header(file)?;
    let after_header = &file[HEADER_SIZE..];

    let plaintext = match code {
        111 => xor::decrypt_xor_byte(after_header, 0xAC),
        121 => xor::decrypt_xor_byte(after_header, xor::xor_key_121(file_name)),
        120 => xor::decrypt_v120(after_header),
        811 => xor::decrypt_xor_byte(&lame::unwrap(after_header), 0xAC),
        821 => xor::decrypt_xor_byte(&lame::unwrap(after_header), xor::xor_key_121(file_name)),
        820 => xor::decrypt_v120(&lame::unwrap(after_header)),
        v @ (411 | 412 | 413 | 414) => {
            let body = strip_rsa_footer(after_header)?;
            rsa_try_keys(body, v)?
        }
        v @ (611 | 612 | 613 | 614) => {
            let unwrapped = lame::unwrap(after_header);
            let body = strip_rsa_footer(&unwrapped)?.to_vec();
            rsa_try_keys(&body, v - 200)?
        }
        other => return Err(CipherError::UnsupportedVersion(other)),
    };
    Ok((code, plaintext))
}

fn rsa_try_keys(body: &[u8], version: u32) -> Result<Vec<u8>, CipherError> {
    let keys: Vec<rsa::RsaKey> = match version {
        411 => vec![rsa::key_411()],
        412 => vec![rsa::key_412()],
        413 => vec![rsa::key_413_encdec(), rsa::key_413()],
        414 => vec![rsa::key_414()],
        _ => unreachable!(),
    };
    let mut last_err = CipherError::BadBlock("no RSA keys to try");
    for key in keys {
        match rsa::decrypt(body, &key) {
            Ok(plain) => return Ok(plain),
            Err(e) => last_err = e,
        }
    }
    Err(last_err)
}

pub fn encrypt(
    plaintext: &[u8],
    code: u32,
    file_name: &str,
    progress: impl Fn(usize, usize) + Send + Sync,
) -> Result<Vec<u8>, CipherError> {
    let body = match code {
        111 => xor::decrypt_xor_byte(plaintext, 0xAC),
        121 => xor::decrypt_xor_byte(plaintext, xor::xor_key_121(file_name)),
        120 => xor::decrypt_v120(plaintext),
        811 => lame::unwrap(&xor::decrypt_xor_byte(plaintext, 0xAC)),
        821 => lame::unwrap(&xor::decrypt_xor_byte(plaintext, xor::xor_key_121(file_name))),
        820 => lame::unwrap(&xor::decrypt_v120(plaintext)),
        413 => {
            let mut out = rsa::encrypt(plaintext, &rsa::key_413_encdec_encrypt(), &progress)?;
            out.extend_from_slice(&V41X_FOOTER);
            out
        }
        611 | 612 | 613 | 614 | 411 | 412 | 414 | 211 | 212 | 311 | 911 | 912 => {
            return Err(CipherError::UnsupportedVersion(code));
        }
        other => return Err(CipherError::UnsupportedVersion(other)),
    };

    let header_str = format!("Lineage2Ver{code}");
    let header: Vec<u8> = header_str.encode_utf16().flat_map(|c| c.to_le_bytes()).collect();
    let mut out = Vec::with_capacity(HEADER_SIZE + body.len());
    out.extend_from_slice(&header);
    if out.len() < HEADER_SIZE {
        out.extend(std::iter::repeat(0u8).take(HEADER_SIZE - out.len()));
    }
    out.extend_from_slice(&body);
    Ok(out)
}

pub fn can_encrypt(code: u32) -> bool {
    matches!(code, 111 | 120 | 121 | 811 | 820 | 821 | 413)
}

fn strip_rsa_footer(body: &[u8]) -> Result<&[u8], CipherError> {
    if body.len() < RSA_FOOTER_SIZE {
        return Err(CipherError::BadBlock("RSA file shorter than 20-byte footer"));
    }
    Ok(&body[..body.len() - RSA_FOOTER_SIZE])
}
