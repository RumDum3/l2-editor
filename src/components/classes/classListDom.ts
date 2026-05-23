import { type ClassDef, type ClassList, ROOT_PARENT } from "../../classes/model";

export function addClassEl(list: ClassList, parentId: number | null): Element {
    const root = list.doc.documentElement;
    const nextId = list.classes.reduce((m, c) => Math.max(m, c.id), -1) + 1;
    const el = list.doc.createElement("class");
    el.setAttribute("classId", String(nextId));
    el.setAttribute("name", `New class ${nextId}`);
    if (parentId != null) el.setAttribute("parentClassId", String(parentId));
    root.appendChild(list.doc.createTextNode("\t"));
    root.appendChild(el);
    root.appendChild(list.doc.createTextNode("\n"));
    return el;
}

export function removeClassEl(cls: ClassDef): void {
    const el = cls.el;
    const next = el.nextSibling;
    if (next && next.nodeType === Node.TEXT_NODE && /^\s*$/.test(next.textContent ?? "")) next.remove();
    el.remove();
}

export function rebuildClasses(list: ClassList): void {
    const classes: ClassDef[] = [];
    for (const el of Array.from(list.doc.documentElement?.children ?? [])) {
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
    list.classes = classes;
    list.byId = new Map(classes.map((c) => [c.id, c]));
    const childrenOf = new Map<number, ClassDef[]>();
    for (const c of classes) {
        const key = c.parent != null && list.byId.has(c.parent) ? c.parent : ROOT_PARENT;
        const arr = childrenOf.get(key);
        if (arr) arr.push(c);
        else childrenOf.set(key, [c]);
    }
    list.childrenOf = childrenOf;
}
