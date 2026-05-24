//! Every UE2 object starts its serialized form with a "tagged property" list
//! before the class-specific binary data. The list is a sequence of records
//! terminated by a reference to the name `"None"`.
//!
//! Record layout (UE2 era — Lineage 2 included):
//!
//! ```text
//! name_index  CompactIndex   // → names[name_index]
//! if names[name_index] == "None": END
//! info_byte   u8
//!   bits 0..3 → type   (PropertyType enum)
//!   bits 4..6 → size code
//!     0..4 → fixed size (1, 2, 4, 12, 16 bytes)
//!     5..7 → one extra byte / word / dword follows giving an explicit size
//!   bit  7   → array flag (for Bool this bit IS the value; for other types
//!              it means "next byte is an array element index")
//!
//! if type != Bool and array flag set:
//!   array_index  u8 (or 2-byte / compact-index variants, see below)
//!
//! if type == Struct:
//!   struct_name_index  CompactIndex   // tag like 'Vector'
//!
//! value_bytes  size bytes
//! ```
//!
//! All we want here is to **skip past the property list and land on the byte
//! immediately after the terminating "None" record**, so the class-specific
//! reader can start at the right place. We don't decode property values.
//!
//! References (consulted, not copied):
//!   - UEViewer `UnObject.cpp` (FPropertyTag::Serialize)
//!   - l2mapper `UObject.cpp`

use crate::cursor::Cursor;
use crate::package::PackageError;

const PROP_TYPE_BOOL: u8 = 2;
const PROP_TYPE_STRUCT: u8 = 9;

/// Skip the UObject tagged-property list. After return, the cursor is
/// positioned at the first byte of the class-specific data.
pub fn skip_property_block(c: &mut Cursor, names: &[String]) -> Result<(), PackageError> {
    loop {
        let name_idx = c.read_compact_index()?;
        let i = name_idx as usize;
        if name_idx < 0 || i >= names.len() {
            return Err(PackageError::IndexOutOfRange {
                table: "property.name",
                index: name_idx,
                len: names.len(),
            });
        }
        if names[i].eq_ignore_ascii_case("None") {
            return Ok(());
        }

        let info = c.read_u8()?;
        let ptype = info & 0x0F;
        let size_code = (info >> 4) & 0x07;
        let is_array = (info & 0x80) != 0;

        // Struct properties carry an FName tag identifying which struct type
        // ('Vector', 'Rotator', 'Color', etc.) before the value bytes.
        if ptype == PROP_TYPE_STRUCT {
            let _struct_name = c.read_compact_index()?;
        }

        // Resolve declared value size.
        let size = match size_code {
            0 => 1usize,
            1 => 2,
            2 => 4,
            3 => 12,
            4 => 16,
            5 => c.read_u8()? as usize,
            6 => c.read_u16()? as usize,
            7 => c.read_u32()? as usize,
            _ => unreachable!(),
        };

        // For non-bool properties the array bit means "this is an element of
        // an array", and the element index follows. Element index is one byte
        // for index < 128, two bytes (BE-encoded with the top bit set) for
        // index < 16384, and four bytes (top two bits set) above that. This
        // is the same trick FCompactIndex uses on the high bits but
        // big-endian-ordered.
        if ptype != PROP_TYPE_BOOL && is_array {
            let b0 = c.read_u8()?;
            if b0 & 0x80 != 0 {
                if b0 & 0x40 != 0 {
                    // 4-byte form: top 2 bits set, remaining 30 bits in
                    // big-endian over the 4 bytes total.
                    let _b1 = c.read_u8()?;
                    let _b2 = c.read_u8()?;
                    let _b3 = c.read_u8()?;
                } else {
                    // 2-byte form: top bit set, low 7 bits + next byte.
                    let _b1 = c.read_u8()?;
                }
            }
        }

        // For Bool the value lives in the array bit itself — no payload to
        // skip. For everything else we hop `size` bytes past it.
        if ptype != PROP_TYPE_BOOL {
            c.skip(size)?;
        }
    }
}
