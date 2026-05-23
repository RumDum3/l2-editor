import type { ClientFieldUpdate, ClientSkillRow } from "./ipc";
import type { FieldValue, Skill } from "../editors/skills/model";

type ToDat = (xmlText: string) => string | number | null;
type FromDat = (datVal: unknown) => string | null;

export type SkillFieldMapping = {
    xmlField: string;
    datField: string;

    toDat: ToDat;
    fromDat: FromDat;
};

const intParse = (s: string): number | null => {
    const n = Number.parseInt(s.trim(), 10);
    return Number.isFinite(n) ? n : null;
};
const numParse = (s: string): number | null => {
    const n = Number.parseFloat(s.trim());
    return Number.isFinite(n) ? n : null;
};

const msToSec: ToDat = (s) => {
    const n = numParse(s);
    return n == null ? null : n / 1000;
};
const secToMs: FromDat = (v) => {
    if (typeof v !== "number") return null;
    return String(Math.round(v * 1000));
};

const OPERATE_TYPE_TO_INT: Record<string, number> = {
    A1: 0,
    A2: 1,
    P: 2,
    T: 3
};
const INT_TO_OPERATE_TYPE = Object.fromEntries(Object.entries(OPERATE_TYPE_TO_INT).map(([k, v]) => [v, k]));

const TARGET_TYPE_TO_INT: Record<string, number> = {
    ADVANCE_BASE: 0,
    ARTILLERY: 0,
    DOOR_TREASURE: 0,
    ENEMY: 1,
    ENEMY_NOT: 3,
    ENEMY_ONLY: 2,
    FORTRESS_FLAGPOLE: 0,
    GROUND: 0,
    HOLYTHING: 0,
    ITEM: 0,
    MY_MENTOR: 0,
    MY_PARTY: 0,
    NONE: 0,
    NPC_BODY: 0,
    OTHERS: 0,
    OWNER_PET: 6,
    PC_BODY: 0,
    SELF: 4,
    SUMMON: 5,
    TARGET: 6,
    WYVERN_TARGET: 0
};
const INT_TO_TARGET_TYPE: Record<number, string> = (() => {
    const canonical: Record<number, string> = {
        0: "NONE",
        1: "ENEMY",
        2: "ENEMY_ONLY",
        3: "ENEMY_NOT",
        4: "SELF",
        5: "SUMMON",
        6: "TARGET"
    };
    return canonical;
})();

const AFFECT_SCOPE_TO_INT: Record<string, number> = {
    DEAD_PARTY: 0,
    DEAD_PLEDGE: 0,
    DEAD_UNION: 0,
    FAN: 4,
    FAN_PB: 0,
    NONE: 0,
    PARTY: 2,
    PARTY_PLEDGE: 0,
    PLEDGE: 3,
    POINT_BLANK: 5,
    RANGE: 8,
    RANGE_SORT_BY_HP: 7,
    RING_RANGE: 0,
    SINGLE: 1,
    SQUARE: 9,
    SQUARE_PB: 0,
    STATIC_OBJECT_SCOPE: 0,
    SUMMON_EXCEPT_MASTER: 0,
    VALAKAS_SCOPE: 0,
    WYVERN_SCOPE: 0
};
const INT_TO_AFFECT_SCOPE: Record<number, string> = {
    0: "NONE",
    1: "SINGLE",
    2: "PARTY",
    3: "PLEDGE",
    4: "FAN",
    5: "POINT_BLANK",
    7: "RANGE_SORT_BY_HP",
    8: "RANGE",
    9: "SQUARE"
};

export const SHARED_FIELDS: SkillFieldMapping[] = [
    {
        xmlField: "icon",
        datField: "icon",
        toDat: (s) => s.trim() || null,
        fromDat: (v) => (typeof v === "string" ? v : null)
    },

    {
        xmlField: "mpConsume",
        datField: "mp_consume",
        toDat: intParse,
        fromDat: (v) => (typeof v === "number" ? String(v) : null)
    },
    {
        xmlField: "hpConsume",
        datField: "hp_consume",
        toDat: intParse,
        fromDat: (v) => (typeof v === "number" ? String(v) : null)
    },
    {
        xmlField: "castRange",
        datField: "cast_range",
        toDat: intParse,
        fromDat: (v) => (typeof v === "number" ? String(v) : null)
    },
    {
        xmlField: "effectPoint",
        datField: "effect_point",
        toDat: intParse,
        fromDat: (v) => (typeof v === "number" ? String(v) : null)
    },
    {
        xmlField: "abnormalTime",
        datField: "abnormal_time",
        toDat: intParse,
        fromDat: (v) => (typeof v === "number" ? String(v) : null)
    },
    {
        xmlField: "isMagic",
        datField: "is_magic",
        toDat: intParse,
        fromDat: (v) => (typeof v === "number" ? String(v) : null)
    },
    {
        xmlField: "magicType",
        datField: "MagicType",
        toDat: intParse,
        fromDat: (v) => (typeof v === "number" ? String(v) : null)
    },

    { xmlField: "hitTime", datField: "hit_time", toDat: msToSec, fromDat: secToMs },
    { xmlField: "coolTime", datField: "cool_time", toDat: msToSec, fromDat: secToMs },
    { xmlField: "reuseDelay", datField: "reuse_delay", toDat: msToSec, fromDat: secToMs },

    {
        xmlField: "operateType",
        datField: "operate_type",
        toDat: (s) => {
            const v = OPERATE_TYPE_TO_INT[s.trim()];
            return v === undefined ? null : v;
        },
        fromDat: (v) => (typeof v === "number" ? (INT_TO_OPERATE_TYPE[v] ?? null) : null)
    },
    {
        xmlField: "targetType",
        datField: "target_type",
        toDat: (s) => {
            const v = TARGET_TYPE_TO_INT[s.trim()];
            return v === undefined ? null : v;
        },
        fromDat: (v) => (typeof v === "number" ? (INT_TO_TARGET_TYPE[v] ?? null) : null)
    },
    {
        xmlField: "affectScope",
        datField: "affect_scope",
        toDat: (s) => {
            const v = AFFECT_SCOPE_TO_INT[s.trim()];
            return v === undefined ? null : v;
        },
        fromDat: (v) => (typeof v === "number" ? (INT_TO_AFFECT_SCOPE[v] ?? null) : null)
    }
];

const FIELD_BY_XML = new Map(SHARED_FIELDS.map((m) => [m.xmlField, m]));
const FIELD_BY_DAT = new Map(SHARED_FIELDS.map((m) => [m.datField, m]));

export function mappingForXmlTag(tag: string): SkillFieldMapping | undefined {
    return FIELD_BY_XML.get(tag);
}

export function mappingForDatField(name: string): SkillFieldMapping | undefined {
    return FIELD_BY_DAT.get(name);
}

export function valueAtLevel(field: FieldValue, level: number): string {
    if (field.kind === "single") return field.value;
    const map = field.kind === "perLevel" ? field.values : field.base;
    const sorted = [...map.entries()].sort((a, b) => a[0] - b[0]);
    let current = "";
    for (const [lvl, v] of sorted) {
        if (lvl > level) break;
        current = v;
    }
    return current;
}

export type Mismatch = {
    level: number;
    datField: string;
    expected: string | number;
    actual: unknown;
};

export function findMismatches(skill: Skill, rows: ClientSkillRow[]): Mismatch[] {
    if (rows.length === 0) return [];
    const byLevel = new Map<number, ClientSkillRow>();
    for (const r of rows) {
        if ((r.skill_sublevel ?? 0) !== 0) continue;
        if (typeof r.skill_level === "number") byLevel.set(r.skill_level, r);
    }
    const out: Mismatch[] = [];
    const toLevel = Math.max(1, skill.toLevel | 0);
    for (let level = 1; level <= toLevel; level++) {
        const row = byLevel.get(level);
        if (!row) continue;
        for (const f of skill.fields) {
            const m = mappingForXmlTag(f.tag);
            if (!m) continue;
            const xmlText = valueAtLevel(f.value, level);
            if (xmlText === "") continue;
            const expected = m.toDat(xmlText);
            if (expected == null) continue;
            const actual = row[m.datField];
            if (!datValuesEqual(expected, actual)) {
                out.push({ level, datField: m.datField, expected, actual });
            }
        }
    }
    return out;
}

function datValuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    if (typeof a === "number" && typeof b === "number") {
        return Math.abs(a - b) < 1e-4;
    }
    return String(a) === String(b);
}

export function buildUpdatesForField(skill: Skill, datField: string): ClientFieldUpdate[] {
    const m = mappingForDatField(datField);
    if (!m) return [];
    const field = skill.fields.find((f) => f.tag === m.xmlField);
    if (!field) return [];
    const out: ClientFieldUpdate[] = [];
    const toLevel = Math.max(1, skill.toLevel | 0);
    for (let level = 1; level <= toLevel; level++) {
        const xmlText = valueAtLevel(field.value, level);
        if (xmlText === "") continue;
        const datVal = m.toDat(xmlText);
        if (datVal == null) continue;
        out.push({ level, sublevel: 0, fields: { [datField]: datVal } });
    }
    if (field.value.kind === "perSublevel") {
        for (const [level, inner] of field.value.overrides) {
            for (const [sublevel, xmlText] of inner) {
                if (xmlText === "") continue;
                const datVal = m.toDat(xmlText);
                if (datVal == null) continue;
                out.push({ level, sublevel, fields: { [datField]: datVal } });
            }
        }
    }
    return out;
}

export function buildUpdatesForSkill(skill: Skill): ClientFieldUpdate[] {
    const updates: ClientFieldUpdate[] = [];
    const toLevel = Math.max(1, skill.toLevel | 0);

    for (let level = 1; level <= toLevel; level++) {
        const fields: Record<string, string | number> = {};
        for (const f of skill.fields) {
            const m = mappingForXmlTag(f.tag);
            if (!m) continue;
            const xmlText = valueAtLevel(f.value, level);
            if (xmlText === "") continue;
            const datVal = m.toDat(xmlText);
            if (datVal == null) continue;
            fields[m.datField] = datVal;
        }
        if (Object.keys(fields).length > 0) {
            updates.push({ level, sublevel: 0, fields });
        }
    }

    const overrideMap = new Map<string, { level: number; sublevel: number; fields: Record<string, string | number> }>();
    for (const f of skill.fields) {
        if (f.value.kind !== "perSublevel") continue;
        const m = mappingForXmlTag(f.tag);
        if (!m) continue;
        for (const [level, inner] of f.value.overrides) {
            for (const [sublevel, xmlText] of inner) {
                if (xmlText === "") continue;
                const datVal = m.toDat(xmlText);
                if (datVal == null) continue;
                const key = `${level}:${sublevel}`;
                let bucket = overrideMap.get(key);
                if (!bucket) {
                    bucket = { level, sublevel, fields: {} };
                    overrideMap.set(key, bucket);
                }
                bucket.fields[m.datField] = datVal;
            }
        }
    }
    for (const v of overrideMap.values()) updates.push(v);

    return updates;
}
