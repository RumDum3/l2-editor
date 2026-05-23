const PATTERN: &[u8] = b"Range check error while converting variant of type (%s) into type (%s)";

pub fn unwrap(body: &[u8]) -> Vec<u8> {
    let len = PATTERN.len();
    let mut pos = 28 % len;
    let mut out = Vec::with_capacity(body.len());
    for &b in body {
        out.push(b ^ PATTERN[pos]);
        pos += 1;
        if pos == len {
            pos = 0;
        }
    }
    out
}
