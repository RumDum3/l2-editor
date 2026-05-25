use crate::cursor::Cursor;
use crate::package::PackageError;

const PROP_TYPE_BOOL: u8 = 2;
const PROP_TYPE_STRUCT: u8 = 9;

// Walks the UObject tagged-property stream until the terminating "None" name.
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

        if ptype == PROP_TYPE_STRUCT {
            let _struct_name = c.read_compact_index()?;
        }

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

        if ptype != PROP_TYPE_BOOL && is_array {
            let b0 = c.read_u8()?;
            if b0 & 0x80 != 0 {
                if b0 & 0x40 != 0 {
                    let _b1 = c.read_u8()?;
                    let _b2 = c.read_u8()?;
                    let _b3 = c.read_u8()?;
                } else {
                    let _b1 = c.read_u8()?;
                }
            }
        }

        if ptype != PROP_TYPE_BOOL {
            c.skip(size)?;
        }
    }
}
