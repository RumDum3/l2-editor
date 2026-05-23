import { useEffect, useState } from "react";
import { statsSkillsDir } from "../lib/dataPaths";
import { ipc } from "../lib/ipc";
import { parseXml } from "../lib/xml";

export type SkillBrief = {
    id: number;
    name: string;
    toLevel: number;
    icon: string | null;
    operateType: string | null;
    isMagic: string | null;
    reuseDelayMs: number | null;
    hitTimeMs: number | null;
    mpConsume: string | null;
    castRange: string | null;
};

function directChild(parent: Element, tag: string): Element | null {
    for (const c of Array.from(parent.children)) if (c.tagName === tag) return c;
    return null;
}
const NUM_RE = /^-?\d+(\.\d+)?$/;
function firstNum(el: Element | null): number | null {
    if (!el) return null;
    const txt = (el.textContent ?? "").trim();
    if (NUM_RE.test(txt)) return Number(txt);
    const vt = (el.querySelector("value")?.textContent ?? "").trim();
    return NUM_RE.test(vt) ? Number(vt) : null;
}
function firstStr(el: Element | null): string | null {
    if (!el) return null;
    const txt = (el.textContent ?? "").trim();
    if (txt && !txt.includes("\n")) return txt;
    const vt = (el.querySelector("value")?.textContent ?? "").trim();
    if (vt) return vt;
    return txt || null;
}

async function loadCatalogFromDisk(dataRoot: string): Promise<Map<number, SkillBrief>> {
    const dir = statsSkillsDir(dataRoot);
    const out = new Map<number, SkillBrief>();
    let files: { path: string }[];
    try {
        files = await ipc.listXmlFiles(dir, true);
    } catch {
        return out;
    }
    await Promise.all(
        files.map(async (f) => {
            let doc: XMLDocument;
            try {
                doc = parseXml(await ipc.readXml(f.path)).doc;
            } catch {
                return;
            }
            for (const el of Array.from(doc.documentElement?.children ?? [])) {
                if (el.tagName !== "skill") continue;
                const id = Number(el.getAttribute("id"));
                if (!Number.isFinite(id) || out.has(id)) continue;
                out.set(id, {
                    id,
                    name: el.getAttribute("name") ?? `Skill ${id}`,
                    toLevel: Number(el.getAttribute("toLevel") ?? "1") || 1,
                    icon: firstStr(directChild(el, "icon")),
                    operateType: firstStr(directChild(el, "operateType")),
                    isMagic: firstStr(directChild(el, "isMagic")),
                    reuseDelayMs: firstNum(directChild(el, "reuseDelay")),
                    hitTimeMs: firstNum(directChild(el, "hitTime")),
                    mpConsume: firstStr(directChild(el, "mpConsume")),
                    castRange: firstStr(directChild(el, "castRange"))
                });
            }
        })
    );
    return out;
}

let cached: { dataRoot: string; map: Map<number, SkillBrief> } | null = null;
let inflight: { dataRoot: string; p: Promise<Map<number, SkillBrief>> } | null = null;

export function loadSkillCatalog(dataRoot: string): Promise<Map<number, SkillBrief>> {
    if (cached && cached.dataRoot === dataRoot) return Promise.resolve(cached.map);
    if (inflight && inflight.dataRoot === dataRoot) return inflight.p;
    const p = loadCatalogFromDisk(dataRoot).then((map) => {
        cached = { dataRoot, map };
        inflight = null;
        return map;
    });
    inflight = { dataRoot, p };
    return p;
}

export function peekSkillCatalog(dataRoot: string | null | undefined): Map<number, SkillBrief> | null {
    return cached && dataRoot && cached.dataRoot === dataRoot ? cached.map : null;
}

export function useSkillCatalog(dataRoot: string | null | undefined): Map<number, SkillBrief> | null {
    const [map, setMap] = useState<Map<number, SkillBrief> | null>(() => peekSkillCatalog(dataRoot));
    useEffect(() => {
        if (!dataRoot) {
            setMap(null);
            return;
        }
        const hit = peekSkillCatalog(dataRoot);
        if (hit) {
            setMap(hit);
            return;
        }
        let cancelled = false;
        void loadSkillCatalog(dataRoot).then((m) => {
            if (!cancelled) setMap(m);
        });
        return () => {
            cancelled = true;
        };
    }, [dataRoot]);
    return map;
}

export function operateTypeLabel(code: string | null | undefined): string {
    switch (code) {
        case "A1":
            return "Active (instant)";
        case "A2":
            return "Active";
        case "A3":
            return "Active (channel)";
        case "A4":
            return "Active (continuous)";
        case "P":
            return "Passive";
        case "T":
            return "Toggle";
        default:
            return code || "—";
    }
}
