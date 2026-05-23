import { useEffect, useState } from "react";
import { ipc } from "../../../lib/ipc";
import { logger } from "../../../lib/logger";
import { parseXml } from "../../../lib/xml";

export type ZoneInfo = { id: number; name: string; type: string; file: string };

export type ZoneCatalog = {
    list: readonly ZoneInfo[];
    byId: ReadonlyMap<number, ZoneInfo>;
};

function joinPath(root: string, ...parts: string[]): string {
    const sep = root.includes("\\") ? "\\" : "/";
    return [root.replace(/[\\/]+$/, ""), ...parts].join(sep);
}

function baseName(p: string): string {
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i >= 0 ? p.slice(i + 1) : p;
}

let cached: { dataRoot: string; cat: ZoneCatalog } | null = null;
let inflight: { dataRoot: string; p: Promise<ZoneCatalog> } | null = null;

async function load(dataRoot: string): Promise<ZoneCatalog> {
    const list: ZoneInfo[] = [];
    try {
        const files = await ipc.listXmlFiles(joinPath(dataRoot, "zones"), true);
        const parsed = await Promise.all(
            files.map(async (f) => {
                try {
                    return { file: baseName(f.path), doc: parseXml(await ipc.readXml(f.path)).doc };
                } catch {
                    return { file: baseName(f.path), doc: null as Document | null };
                }
            })
        );
        for (const { file, doc } of parsed) {
            if (!doc) continue;
            for (const z of Array.from(doc.querySelectorAll("zone"))) {
                const idRaw = z.getAttribute("id");
                if (idRaw == null) continue;
                const id = Number(idRaw);
                if (!Number.isFinite(id)) continue;
                list.push({
                    id,
                    name: z.getAttribute("name") ?? `zone ${id}`,
                    type: z.getAttribute("type") ?? "",
                    file
                });
            }
        }
    } catch (e) {
        logger.warn("zones", "failed to load zone catalogue", { message: String(e) });
    }
    list.sort((a, b) => a.id - b.id);
    return { list, byId: new Map(list.map((z) => [z.id, z] as const)) };
}

export function loadZones(dataRoot: string): Promise<ZoneCatalog> {
    if (cached && cached.dataRoot === dataRoot) return Promise.resolve(cached.cat);
    if (inflight && inflight.dataRoot === dataRoot) return inflight.p;
    const p = load(dataRoot).then((cat) => {
        cached = { dataRoot, cat };
        inflight = null;
        return cat;
    });
    inflight = { dataRoot, p };
    return p;
}

export function useZones(dataRoot: string | null | undefined): ZoneCatalog | null {
    const [cat, setCat] = useState<ZoneCatalog | null>(() =>
        cached && cached.dataRoot === dataRoot ? cached.cat : null
    );
    useEffect(() => {
        if (!dataRoot) {
            setCat(null);
            return;
        }
        if (cached && cached.dataRoot === dataRoot) {
            setCat(cached.cat);
            return;
        }
        let cancelled = false;
        void loadZones(dataRoot).then((c) => {
            if (!cancelled) setCat(c);
        });
        return () => {
            cancelled = true;
        };
    }, [dataRoot]);
    return cat;
}

export function isZoneAttr(name: string): boolean {
    return name.toLowerCase().includes("zoneid");
}

export function parseZoneIds(value: string): number[] {
    const out: number[] = [];
    for (const tok of value.split(",")) {
        const t = tok.trim();
        if (!t) continue;
        const n = Number(t);
        if (Number.isInteger(n) && !out.includes(n)) out.push(n);
    }
    return out;
}
