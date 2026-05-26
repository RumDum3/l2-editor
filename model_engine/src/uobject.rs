use crate::cursor::Cursor;
use crate::package::PackageError;

const PROP_TYPE_BOOL: u8 = 2;
const PROP_TYPE_STRUCT: u8 = 9;

// Walks the UObject tagged-property stream until the terminating "None" name.
pub fn skip_property_block(c: &mut Cursor, names: &[String]) -> Result<(), PackageError> {
    let _ = read_property_block(c, names)?;
    Ok(())
}

#[derive(Default, Debug)]
pub struct PropertySummary {
    pub material_refs: Vec<i32>,
}

pub fn read_property_block(c: &mut Cursor, names: &[String]) -> Result<PropertySummary, PackageError> {
    let mut out = PropertySummary::default();
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
        let prop_name = &names[i];
        if prop_name.eq_ignore_ascii_case("None") {
            return Ok(out);
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

        if ptype == PROP_TYPE_BOOL {
            continue;
        }

        let value_start = c.position();
        let value_end = value_start + size;

        if prop_name.eq_ignore_ascii_case("Materials")
            || prop_name.eq_ignore_ascii_case("Textures")
            || prop_name.eq_ignore_ascii_case("Skins")
        {
            let count = c.read_compact_index().unwrap_or(0).max(0) as usize;
            let mut guard = 0usize;
            while c.position() < value_end && guard < count {
                let r = c.read_compact_index().unwrap_or(0);
                out.material_refs.push(r);
                guard += 1;
            }
        }

        if c.position() < value_end {
            c.skip(value_end - c.position())?;
        }
    }
}
