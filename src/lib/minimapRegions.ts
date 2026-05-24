import { ipc } from "./ipc";

export interface MinimapSheet {
    tileName: string;
    worldX: number;
    worldY: number;
    worldW: number;
    worldH: number;
}

function pickStr(row: Record<string, unknown>, keys: string[]): string | null {
    for (const k of keys) {
        const v = row[k];
        if (typeof v === "string" && v.length > 0) return v;
    }
    return null;
}

function pickNum(row: Record<string, unknown>, keys: string[]): number | null {
    for (const k of keys) {
        const v = row[k];
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string") {
            const n = Number(v);
            if (Number.isFinite(n)) return n;
        }
    }
    return null;
}

export async function loadMinimapRegions(): Promise<MinimapSheet[] | null> {
    let rows: Record<string, unknown>[];
    try {
        rows = await ipc.dumpGenericDatRows("minimap_region");
    } catch {
        return null;
    }
    if (rows.length === 0) return null;
    const out: MinimapSheet[] = [];
    for (const r of rows) {
        const icon = pickStr(r, ["IconTexNormal", "icon_tex_normal", "icontexnormal"]);
        if (!icon) continue;
        const tileName = icon.toLowerCase().trim();
        if (!tileName.startsWith("radarmap")) continue;
        const wx = pickNum(r, ["WorldLocX", "world_loc_x", "worldlocx"]);
        const wy = pickNum(r, ["WorldLocY", "world_loc_y", "worldlocy"]);
        const ww = pickNum(r, ["Width", "width"]);
        const wh = pickNum(r, ["Height", "height"]);
        if (wx == null || wy == null || ww == null || wh == null) continue;
        if (ww <= 0 || wh <= 0) continue;
        out.push({ tileName, worldX: wx, worldY: wy, worldW: ww, worldH: wh });
    }
    return out.length > 0 ? out : null;
}
