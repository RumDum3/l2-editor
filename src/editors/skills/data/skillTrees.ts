import { useEffect, useState } from "react";
import { classListPath, skillTreesDir } from "../../../lib/dataPaths";
import { ipc } from "../../../lib/ipc";
import { parseXml } from "../../../lib/xml";

export type ClassInfo = { id: number; name: string; parent?: number };

export type SkillOwner = { classId: number; getLevel: number };

export type ClassSkillTrees = {
    classes: ClassInfo[];
    ownSkills: Map<number, Set<number>>;
    skillOwners: Map<number, SkillOwner[]>;
    commonSkills: Set<number>;
};

async function loadFromDisk(dataRoot: string): Promise<ClassSkillTrees> {
    const empty: ClassSkillTrees = {
        classes: [],
        ownSkills: new Map(),
        skillOwners: new Map(),
        commonSkills: new Set()
    };

    const classes: ClassInfo[] = [];
    try {
        const { doc } = parseXml(await ipc.readXml(classListPath(dataRoot)));
        for (const el of Array.from(doc.documentElement?.children ?? [])) {
            if (el.tagName !== "class") continue;
            const id = Number(el.getAttribute("classId"));
            if (!Number.isFinite(id)) continue;
            const parentRaw = el.getAttribute("parentClassId");
            classes.push({
                id,
                name: el.getAttribute("name") ?? `Class ${id}`,
                parent: parentRaw != null && parentRaw !== "" ? Number(parentRaw) : undefined
            });
        }
    } catch {
        return empty;
    }
    classes.sort((a, b) => a.id - b.id);

    const ownSkills = new Map<number, Set<number>>();
    const skillOwners = new Map<number, SkillOwner[]>();
    const commonSkills = new Set<number>();
    const noteOwner = (skillId: number, classId: number, getLevel: number) => {
        let arr = skillOwners.get(skillId);
        if (!arr) {
            arr = [];
            skillOwners.set(skillId, arr);
        }
        const ex = arr.find((o) => o.classId === classId);
        if (ex) {
            if (getLevel > 0 && (ex.getLevel === 0 || getLevel < ex.getLevel)) ex.getLevel = getLevel;
        } else {
            arr.push({ classId, getLevel });
        }
    };
    try {
        const files = await ipc.listXmlFiles(skillTreesDir(dataRoot), true);
        const docs = await Promise.all(
            files.map(async (f) => {
                try {
                    return parseXml(await ipc.readXml(f.path)).doc;
                } catch {
                    return null;
                }
            })
        );
        for (const doc of docs) {
            if (!doc) continue;
            for (const tree of Array.from(doc.querySelectorAll("skillTree"))) {
                if (tree.getAttribute("type") !== "classSkillTree") continue;
                const entries: { id: number; getLevel: number }[] = [];
                for (const s of Array.from(tree.children)) {
                    if (s.tagName !== "skill") continue;
                    const sid = Number(s.getAttribute("skillId"));
                    if (!Number.isFinite(sid)) continue;
                    const gl = Number(s.getAttribute("getLevel"));
                    entries.push({ id: sid, getLevel: Number.isFinite(gl) ? gl : 0 });
                }
                const classIdRaw = tree.getAttribute("classId");
                if (classIdRaw != null && classIdRaw !== "") {
                    const cid = Number(classIdRaw);
                    if (!Number.isFinite(cid)) continue;
                    let set = ownSkills.get(cid);
                    if (!set) {
                        set = new Set();
                        ownSkills.set(cid, set);
                    }
                    for (const e of entries) {
                        set.add(e.id);
                        noteOwner(e.id, cid, e.getLevel);
                    }
                } else {
                    for (const e of entries) commonSkills.add(e.id);
                }
            }
        }
    } catch {}
    return { classes, ownSkills, skillOwners, commonSkills };
}

let cached: { dataRoot: string; trees: ClassSkillTrees } | null = null;
let inflight: { dataRoot: string; p: Promise<ClassSkillTrees> } | null = null;

export function loadClassSkillTrees(dataRoot: string): Promise<ClassSkillTrees> {
    if (cached && cached.dataRoot === dataRoot) return Promise.resolve(cached.trees);
    if (inflight && inflight.dataRoot === dataRoot) return inflight.p;
    const p = loadFromDisk(dataRoot).then((trees) => {
        cached = { dataRoot, trees };
        inflight = null;
        return trees;
    });
    inflight = { dataRoot, p };
    return p;
}

export function useClassSkillTrees(dataRoot: string | null | undefined): ClassSkillTrees | null {
    const [trees, setTrees] = useState<ClassSkillTrees | null>(() =>
        cached && cached.dataRoot === dataRoot ? cached.trees : null
    );
    useEffect(() => {
        if (!dataRoot) {
            setTrees(null);
            return;
        }
        if (cached && cached.dataRoot === dataRoot) {
            setTrees(cached.trees);
            return;
        }
        let cancelled = false;
        void loadClassSkillTrees(dataRoot).then((t) => {
            if (!cancelled) setTrees(t);
        });
        return () => {
            cancelled = true;
        };
    }, [dataRoot]);
    return trees;
}

export function completeClassSkills(
    classId: number,
    trees: ClassSkillTrees,
    cache: Map<number, Set<number>> = new Map()
): Set<number> {
    const hit = cache.get(classId);
    if (hit) return hit;
    const out = new Set<number>(trees.commonSkills);
    cache.set(classId, out);
    const own = trees.ownSkills.get(classId);
    if (own) for (const id of own) out.add(id);
    const info = trees.classes.find((c) => c.id === classId);
    if (info?.parent != null) {
        for (const id of completeClassSkills(info.parent, trees, cache)) out.add(id);
    }
    return out;
}
