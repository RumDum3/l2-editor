export type ClassDef = {
    id: number;
    name: string;
    parent: number | null;
    el: Element;
};

export type ClassList = {
    path: string;
    doc: XMLDocument;
    classes: ClassDef[];
    byId: Map<number, ClassDef>;
    childrenOf: Map<number, ClassDef[]>;
};

export const ROOT_PARENT = -1;

export function indexClasses(path: string, doc: XMLDocument, classes: ClassDef[]): ClassList {
    const byId = new Map<number, ClassDef>();
    for (const c of classes) byId.set(c.id, c);
    const childrenOf = new Map<number, ClassDef[]>();
    for (const c of classes) {
        const key = c.parent != null && byId.has(c.parent) ? c.parent : ROOT_PARENT;
        const arr = childrenOf.get(key);
        if (arr) arr.push(c);
        else childrenOf.set(key, [c]);
    }
    return { path, doc, classes, byId, childrenOf };
}

export function ancestorsOf(cls: ClassDef, list: ClassList): ClassDef[] {
    const out: ClassDef[] = [];
    const seen = new Set<number>([cls.id]);
    let cur = cls.parent != null ? list.byId.get(cls.parent) : undefined;
    while (cur && !seen.has(cur.id)) {
        out.push(cur);
        seen.add(cur.id);
        cur = cur.parent != null ? list.byId.get(cur.parent) : undefined;
    }
    return out;
}

export function wouldCycle(cls: ClassDef, newParentId: number | null, list: ClassList): boolean {
    if (newParentId == null) return false;
    if (newParentId === cls.id) return true;
    let cur: ClassDef | undefined = list.byId.get(newParentId);
    const seen = new Set<number>();
    while (cur) {
        if (cur.id === cls.id) return true;
        if (seen.has(cur.id)) return false;
        seen.add(cur.id);
        cur = cur.parent != null ? list.byId.get(cur.parent) : undefined;
    }
    return false;
}

export function depthOf(cls: ClassDef, list: ClassList): number {
    return ancestorsOf(cls, list).length;
}

export type TreeSkillRow = {
    skillId: number;
    skillName: string;
    skillLevel: number;
    attrs: Map<string, string>;
    removeSkills: number[];
    el: Element;
};

export type SkillTreeBlock = {
    type: string;
    classId: number | null;
    parentClassId: number | null;
    attrs: Map<string, string>;
    rows: TreeSkillRow[];
    el: Element;
    file: SkillTreeFile;
};

export type SkillTreeFile = {
    path: string;
    relPath: string;
    doc: XMLDocument;
    blocks: SkillTreeBlock[];
};

export type SkillTrees = {
    files: SkillTreeFile[];
    blocks: SkillTreeBlock[];
    byType: Map<string, SkillTreeBlock[]>;
    byClassId: Map<number, SkillTreeBlock[]>;
};

export type TemplateFile = {
    path: string;
    relPath: string;
    doc: XMLDocument;
    classId: number | null;
    staticData: Element | null;
    lvlUpgain: Element | null;
};

export type PlayerTemplates = {
    files: TemplateFile[];
    byClassId: Map<number, TemplateFile>;
};
