use std::io::{Read, Write};

use flate2::read::ZlibDecoder;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use num_bigint_dig::BigUint;
use rayon::prelude::*;

use super::CipherError;

fn parse_hex(s: &str) -> BigUint {
    BigUint::parse_bytes(s.as_bytes(), 16).expect("invalid RSA constant")
}

pub struct RsaKey {
    pub modulus: BigUint,
    pub exponent: BigUint,
}

pub fn key_411() -> RsaKey {
    RsaKey {
        modulus: parse_hex(
            "8c9d5da87b30f5d7cd9dc88c746eaac5bb180267fa11737358c4c95d9adf59dd\
             37689f9befb251508759555d6fe0eca87bebe0a10712cf0ec245af84cd22eb4c\
             b675e98eaf5799fca62a20a2baa4801d5d70718dcd43283b8428f1387aec6600\
             f937bfc7bb72404d187d3a9c438f1ffce9ce365dccf754232ff6def038a41385",
        ),
        exponent: BigUint::from(0x1du32),
    }
}

pub fn key_412() -> RsaKey {
    RsaKey {
        modulus: parse_hex(
            "a465134799cf2c45087093e7d0f0f144e6d528110c08f674730d436e40827330\
             eccea46e70acf10cdda7d8f710e3b44dcca931812d76cd7494289bca8b73823f\
             57efc0515b97e4a2a02612ccfa719cf7885104b06f2e7e2cc967b62e3d3b1aad\
             b925db94cbc8cd3070a4bb13f7e202c7733a67b1b94c1ebc0afcbe1a63b448cf",
        ),
        exponent: BigUint::from(0x25u32),
    }
}

pub fn key_413() -> RsaKey {
    RsaKey {
        modulus: parse_hex(
            "97df398472ddf737ef0a0cd17e8d172f0fef1661a38a8ae1d6e829bc1c6e4c3c\
             fc19292dda9ef90175e46e7394a18850b6417d03be6eea274d3ed1dde5b5d7bd\
             e72cc0a0b71d03608655633881793a02c9a67d9ef2b45eb7c08d4be329083ce4\
             50e68f7867b6749314d40511d09bc5744551baa86a89dc38123dc1668fd72d83",
        ),
        exponent: BigUint::from(0x35u32),
    }
}

pub fn key_413_encdec() -> RsaKey {
    RsaKey {
        modulus: v413_encdec_modulus(),
        exponent: BigUint::from(0x1du32),
    }
}

pub fn key_413_encdec_encrypt() -> RsaKey {
    RsaKey {
        modulus: v413_encdec_modulus(),
        exponent: parse_hex(
            "30b4c2d798d47086145c75063c8e841e719776e400291d7838d3e6c4405b504c\
             6a07f8fca27f32b86643d2649d1d5f124cdd0bf272f0909dd7352fe10a77b34d\
             831043d9ae541f8263c6fe3d1c14c2f04e43a7253a6dda9a8c1562cbd493c1b6\
             31a1957618ad5dfe5ca28553f746e2fc6f2db816c7db223ec91e955081c1de65",
        ),
    }
}

fn v413_encdec_modulus() -> BigUint {
    parse_hex(
        "75B4D6DE5C016544068A1ACF125869F43D2E09FC55B8B1E289556DAF9B875763\
         5593446288B3653DA1CE91C87BB1A5C18F16323495C55D7D72C0890A83F69BFD\
         1FD9434EB1C02F3E4679EDFA43309319070129C267C85604D87BB65BAE205DE3\
         707AF1D2108881ABB567C3B3D069AE67C3A4C6A3AA93D26413D4C66094AE2039",
    )
}

pub fn key_414() -> RsaKey {
    RsaKey {
        modulus: parse_hex(
            "ad70257b2316ce09dfaf2ebc3f63b3d673b0c98a403950e26bb87379b11e17ae\
             d0e45af23e7171e5ec1fbc8d1ae32ffb7801b31266eef9c334b53469d4b7cbe8\
             3284273d35a9aab49b453e7012f374496c65f8089f5d134b0eb3d1e3b22051ed\
             5977a6dd68c4f85785dfcc9f4412c81681944fc4b8ce27caf0242deaa5762e8d",
        ),
        exponent: BigUint::from(0x25u32),
    }
}

struct DecBlock {
    len: u8,
    data: [u8; 124],
}

pub fn decrypt(body: &[u8], key: &RsaKey) -> Result<Vec<u8>, CipherError> {
    if body.len() % 128 != 0 {
        return Err(CipherError::BadBlock("RSA payload length not a multiple of 128"));
    }

    let blocks: Vec<Result<DecBlock, CipherError>> = body
        .par_chunks_exact(128)
        .map(|block| {
            let cipher = BigUint::from_bytes_be(block);
            let plain = cipher.modpow(&key.exponent, &key.modulus);
            let plain_bytes = plain.to_bytes_be();
            let mut padded = [0u8; 128];
            if plain_bytes.len() <= 128 {
                padded[128 - plain_bytes.len()..].copy_from_slice(&plain_bytes);
            } else {
                return Err(CipherError::BadBlock("RSA block decrypted to > 128 bytes"));
            }
            let size = padded[3] as usize;
            if size > 124 {
                return Err(CipherError::BadBlock("inner block size > 124"));
            }
            let start = 128 - size - (124 - size) % 4;
            let mut data = [0u8; 124];
            data[..size].copy_from_slice(&padded[start..start + size]);
            Ok(DecBlock { len: size as u8, data })
        })
        .collect();

    let mut data_stream: Vec<u8> = Vec::with_capacity(body.len());
    for b in blocks {
        let b = b?;
        data_stream.extend_from_slice(&b.data[..b.len as usize]);
    }

    if data_stream.len() < 4 {
        return Err(CipherError::BadBlock("data stream shorter than size header"));
    }
    let _uncompressed_size = u32::from_le_bytes([
        data_stream[0],
        data_stream[1],
        data_stream[2],
        data_stream[3],
    ]) as usize;

    let mut decoder = ZlibDecoder::new(&data_stream[4..]);
    let mut out = Vec::new();
    decoder
        .read_to_end(&mut out)
        .map_err(|_| CipherError::BadBlock("zlib decompression failed"))?;
    Ok(out)
}

pub fn encrypt(
    plaintext: &[u8],
    key: &RsaKey,
    progress: impl Fn(usize, usize) + Send + Sync,
) -> Result<Vec<u8>, CipherError> {
    let original_size = plaintext.len() as u32;
    let mut compressed = Vec::new();
    {
        let mut enc = ZlibEncoder::new(&mut compressed, Compression::default());
        enc.write_all(plaintext)
            .map_err(|_| CipherError::BadBlock("zlib compression failed"))?;
        enc.finish()
            .map_err(|_| CipherError::BadBlock("zlib finish failed"))?;
    }
    let mut data_stream: Vec<u8> = Vec::with_capacity(4 + compressed.len());
    data_stream.extend_from_slice(&original_size.to_le_bytes());
    data_stream.extend_from_slice(&compressed);

    let total = data_stream.len().div_ceil(124);
    let started = std::time::Instant::now();
    eprintln!("[rsa] encrypting {total} blocks…");
    progress(0, total);
    let counter = std::sync::atomic::AtomicUsize::new(0);
    let overflow = std::sync::atomic::AtomicBool::new(false);

    let mut out = vec![0u8; total * 128];
    out.par_chunks_mut(128)
        .zip(data_stream.par_chunks(124))
        .for_each(|(out_block, chunk)| {
            let len = chunk.len();
            let mut block = [0u8; 128];
            block[0] = ((len >> 24) & 0xFF) as u8;
            block[1] = ((len >> 16) & 0xFF) as u8;
            block[2] = ((len >> 8) & 0xFF) as u8;
            block[3] = (len & 0xFF) as u8;
            let start = 128 - len - (124 - len) % 4;
            block[start..start + len].copy_from_slice(chunk);
            let plain_int = BigUint::from_bytes_be(&block);
            let cipher_int = plain_int.modpow(&key.exponent, &key.modulus);
            let cipher_bytes = cipher_int.to_bytes_be();
            if cipher_bytes.len() <= 128 {
                out_block[128 - cipher_bytes.len()..].copy_from_slice(&cipher_bytes);
            } else {
                overflow.store(true, std::sync::atomic::Ordering::Relaxed);
            }
            let done = counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            if done % 256 == 0 || done == total {
                progress(done, total);
            }
        });
    if overflow.load(std::sync::atomic::Ordering::Relaxed) {
        return Err(CipherError::BadBlock("RSA cipher overflowed 128 bytes"));
    }
    eprintln!("[rsa] encrypted {total} blocks in {:?}", started.elapsed());
    Ok(out)
}
