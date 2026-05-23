import { classListPath, relUnder, skillTreesDir, templatesDir } from "../lib/dataPaths";
import { ipc } from "../lib/ipc";
import { parseXml } from "../lib/xml";
import {
    type ClassDef,
    type ClassList,
    indexClasses,
    type PlayerTemplates,
    type SkillTreeBlock,
    type SkillTreeFile,
    type SkillTrees,
    type TemplateFile,
    type TreeSkillRow
} from "./model";

export function parseClassDefs(doc: XMLDocument): ClassDef[] {
    const classes: ClassDef[] = [];
    for (const el of Array.from(doc.documentElement?.children ?? [])) {
        if (el.tagName !== "class") continue;
        const id = Number(el.getAttribute("classId"));
        if (!Number.isFinite(id)) continue;
        const parentRaw = el.getAttribute("parentClassId");
        classes.push({
            id,
            name: el.getAttribute("name") ?? `Class ${id}`,
            parent: parentRaw != null && parentRaw !== "" ? Number(parentRaw) : null,
            el
        });
    }
    return classes;
}

export function buildClassList(path: string, doc: XMLDocument): ClassList {
    return indexClasses(path, doc, parseClassDefs(doc));
}

export async function loadClassListFromDisk(dataRoot: string): Promise<ClassList> {
    const path = classListPath(dataRoot);
    const { doc } = parseXml(await ipc.readXml(path));
    return buildClassList(path, doc);
}

const SKILL_ROW_RESERVED = new Set(["skillId", "skillName", "skillLevel"]);

function parseTreeRow(el: Element): TreeSkillRow | null {
    const skillId = Number(el.getAttribute("skillId"));
    if (!Number.isFinite(skillId)) return null;
    const attrs = new Map<string, string>();
    for (const a of Array.from(el.attributes)) {
        if (SKILL_ROW_RESERVED.has(a.name)) continue;
        attrs.set(a.name, a.value);
    }
    const removeSkills: number[] = [];
    for (const c of Array.from(el.children)) {
        if (c.tagName !== "removeSkill") continue;
        const rid = Number(c.getAttribute("id") ?? c.getAttribute("skillId"));
        if (Number.isFinite(rid)) removeSkills.push(rid);
    }
    const lvl = Number(el.getAttribute("skillLevel"));
    return {
        skillId,
        skillName: el.getAttribute("skillName") ?? "",
        skillLevel: Number.isFinite(lvl) ? lvl : 1,
        attrs,
        removeSkills,
        el
    };
}

const TREE_RESERVED = new Set(["type", "classId", "parentClassId"]);

export function parseSkillTreeFile(path: string, relPath: string, doc: XMLDocument): SkillTreeFile {
    const file: SkillTreeFile = { path, relPath, doc, blocks: [] };
    for (const treeEl of Array.from(doc.querySelectorAll("skillTree"))) {
        const type = treeEl.getAttribute("type") ?? "";
        const classIdRaw = treeEl.getAttribute("classId");
        const parentRaw = treeEl.getAttribute("parentClassId");
        const attrs = new Map<string, string>();
        for (const a of Array.from(treeEl.attributes)) {
            if (TREE_RESERVED.has(a.name)) continue;
            attrs.set(a.name, a.value);
        }
        const rows: TreeSkillRow[] = [];
        for (const c of Array.from(treeEl.children)) {
            if (c.tagName !== "skill") continue;
            const row = parseTreeRow(c);
            if (row) rows.push(row);
        }
        const block: SkillTreeBlock = {
            type,
            classId: classIdRaw != null && classIdRaw !== "" ? Number(classIdRaw) : null,
            parentClassId: parentRaw != null && parentRaw !== "" ? Number(parentRaw) : null,
            attrs,
            rows,
            el: treeEl,
            file
        };
        file.blocks.push(block);
    }
    return file;
}

export function indexSkillTrees(files: SkillTreeFile[]): SkillTrees {
    const blocks: SkillTreeBlock[] = [];
    const byType = new Map<string, SkillTreeBlock[]>();
    const byClassId = new Map<number, SkillTreeBlock[]>();
    for (const f of files) {
        for (const b of f.blocks) {
            blocks.push(b);
            (byType.get(b.type) ?? byType.set(b.type, []).get(b.type)!).push(b);
            if (b.classId != null && Number.isFinite(b.classId)) {
                (byClassId.get(b.classId) ?? byClassId.set(b.classId, []).get(b.classId)!).push(b);
            }
        }
    }
    return { files, blocks, byType, byClassId };
}

export async function loadSkillTreesFromDisk(dataRoot: string): Promise<SkillTrees> {
    const dir = skillTreesDir(dataRoot);
    let entries: { path: string }[];
    try {
        entries = await ipc.listXmlFiles(dir, true);
    } catch {
        return { files: [], blocks: [], byType: new Map(), byClassId: new Map() };
    }
    const files = (
        await Promise.all(
            entries.map(async (e) => {
                try {
                    const { doc } = parseXml(await ipc.readXml(e.path));
                    return parseSkillTreeFile(e.path, relUnder(dir, e.path), doc);
                } catch {
                    return null;
                }
            })
        )
    ).filter((f): f is SkillTreeFile => f != null);
    return indexSkillTrees(files);
}

function directChild(parent: Element, tag: string): Element | null {
    for (const c of Array.from(parent.children)) if (c.tagName === tag) return c;
    return null;
}

export function parseTemplateFile(path: string, relPath: string, doc: XMLDocument): TemplateFile | null {
    const root = doc.documentElement;
    if (!root) return null;
    const classIdEl = directChild(root, "classId");
    const raw = classIdEl?.textContent?.trim() ?? "";
    const classId = raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
    return {
        path,
        relPath,
        doc,
        classId,
        staticData: directChild(root, "staticData"),
        lvlUpgain: directChild(root, "lvlUpgainData")
    };
}

export function indexTemplates(files: TemplateFile[]): PlayerTemplates {
    const byClassId = new Map<number, TemplateFile>();
    for (const f of files) {
        if (f.classId != null && Number.isFinite(f.classId) && !byClassId.has(f.classId)) byClassId.set(f.classId, f);
    }
    return { files, byClassId };
}

export async function loadTemplatesFromDisk(dataRoot: string): Promise<PlayerTemplates> {
    const dir = templatesDir(dataRoot);
    let entries: { path: string }[];
    try {
        entries = await ipc.listXmlFiles(dir, true);
    } catch {
        return { files: [], byClassId: new Map() };
    }
    const files = (
        await Promise.all(
            entries.map(async (e) => {
                try {
                    const { doc } = parseXml(await ipc.readXml(e.path));
                    return parseTemplateFile(e.path, relUnder(dir, e.path), doc);
                } catch {
                    return null;
                }
            })
        )
    ).filter((f): f is TemplateFile => f != null);
    return indexTemplates(files);
}

type Memo<T> = {
    get(dataRoot: string): Promise<T>;
    invalidate(): void;
    peek(dataRoot: string): T | null;
};

function makeMemo<T>(load: (dataRoot: string) => Promise<T>): Memo<T> {
    let cached: { dataRoot: string; value: T } | null = null;
    let inflight: { dataRoot: string; p: Promise<T> } | null = null;
    return {
        get(dataRoot) {
            if (cached && cached.dataRoot === dataRoot) return Promise.resolve(cached.value);
            if (inflight && inflight.dataRoot === dataRoot) return inflight.p;
            const p = load(dataRoot).then((value) => {
                cached = { dataRoot, value };
                inflight = null;
                return value;
            });
            inflight = { dataRoot, p };
            return p;
        },
        invalidate() {
            cached = null;
            inflight = null;
        },
        peek(dataRoot) {
            return cached && cached.dataRoot === dataRoot ? cached.value : null;
        }
    };
}

export const classListMemo = makeMemo(loadClassListFromDisk);
export const skillTreesMemo = makeMemo(loadSkillTreesFromDisk);
export const templatesMemo = makeMemo(loadTemplatesFromDisk);
