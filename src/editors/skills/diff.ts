import type { FieldValue, Skill } from "./model";

export type AttrDiff = {
    name: "id" | "name" | "toLevel";
    a: string;
    b: string;
    same: boolean;
};

export type LevelDiff = {
    level: number;
    a: string | null;
    b: string | null;
};

export type FieldDiff = {
    tag: string;
    kind: "same" | "different" | "onlyA" | "onlyB";
    a?: FieldValue;
    b?: FieldValue;
    levelDiffs?: LevelDiff[];
};

export type BlockDiff = {
    tag: string;
    kind: "same" | "different" | "onlyA" | "onlyB";
    xmlA?: string;
    xmlB?: string;
};

export type SkillDiff = {
    attrs: AttrDiff[];
    fields: FieldDiff[];
    blocks: BlockDiff[];
    differingCount: number;
    totalCount: number;
};

export function compareSkills(a: Skill, b: Skill): SkillDiff {
    const attrs: AttrDiff[] = [
        diffAttr("id", String(a.id), String(b.id)),
        diffAttr("name", a.name, b.name),
        diffAttr("toLevel", String(a.toLevel), String(b.toLevel))
    ];

    const fields: FieldDiff[] = [];
    const aFieldsByTag = new Map(a.fields.map((f) => [f.tag, f.value]));
    const bFieldsByTag = new Map(b.fields.map((f) => [f.tag, f.value]));
    const allFieldTags = unionOrdered([...aFieldsByTag.keys()], [...bFieldsByTag.keys()]);
    for (const tag of allFieldTags) {
        const av = aFieldsByTag.get(tag);
        const bv = bFieldsByTag.get(tag);
        if (av !== undefined && bv === undefined) {
            fields.push({ tag, kind: "onlyA", a: av });
        } else if (av === undefined && bv !== undefined) {
            fields.push({ tag, kind: "onlyB", b: bv });
        } else if (av !== undefined && bv !== undefined) {
            fields.push(diffField(tag, av, bv));
        }
    }

    const blocks: BlockDiff[] = [];
    const aBlocksByTag = new Map(a.blocks.map((b) => [b.tag, b.el]));
    const bBlocksByTag = new Map(b.blocks.map((b) => [b.tag, b.el]));
    const allBlockTags = unionOrdered([...aBlocksByTag.keys()], [...bBlocksByTag.keys()]);
    const ser = (el: Element) => new XMLSerializer().serializeToString(el);
    for (const tag of allBlockTags) {
        const ae = aBlocksByTag.get(tag);
        const be = bBlocksByTag.get(tag);
        if (ae && !be) {
            blocks.push({ tag, kind: "onlyA", xmlA: ser(ae) });
        } else if (!ae && be) {
            blocks.push({ tag, kind: "onlyB", xmlB: ser(be) });
        } else if (ae && be) {
            const xmlA = ser(ae);
            const xmlB = ser(be);
            blocks.push({
                tag,
                kind: xmlA === xmlB ? "same" : "different",
                xmlA,
                xmlB
            });
        }
    }

    let differingCount = 0;
    for (const a of attrs) if (!a.same) differingCount++;
    for (const f of fields) if (f.kind !== "same") differingCount++;
    for (const b of blocks) if (b.kind !== "same") differingCount++;

    return {
        attrs,
        fields,
        blocks,
        differingCount,
        totalCount: attrs.length + fields.length + blocks.length
    };
}

function diffAttr(name: AttrDiff["name"], a: string, b: string): AttrDiff {
    return { name, a, b, same: a === b };
}

function diffField(tag: string, a: FieldValue, b: FieldValue): FieldDiff {
    if (a.kind === "single" && b.kind === "single") {
        return {
            tag,
            kind: a.value === b.value ? "same" : "different",
            a,
            b
        };
    }
    if (a.kind === "perLevel" && b.kind === "perLevel") {
        const allLevels = new Set<number>([...a.values.keys(), ...b.values.keys()]);
        const sorted = [...allLevels].sort((x, y) => x - y);
        const levelDiffs: LevelDiff[] = sorted.map((lvl) => ({
            level: lvl,
            a: a.values.has(lvl) ? a.values.get(lvl)! : null,
            b: b.values.has(lvl) ? b.values.get(lvl)! : null
        }));
        const allSame = levelDiffs.every((d) => d.a === d.b);
        return {
            tag,
            kind: allSame ? "same" : "different",
            a,
            b,
            levelDiffs: allSame ? undefined : levelDiffs
        };
    }
    return { tag, kind: "different", a, b };
}

function unionOrdered<T>(a: T[], b: T[]): T[] {
    const seen = new Set<T>(a);
    const out = [...a];
    for (const x of b) {
        if (!seen.has(x)) {
            seen.add(x);
            out.push(x);
        }
    }
    return out;
}
