import { ipc } from "./ipc";
import { regionOf } from "./worldCoords";

export interface HuntingZone {
    id: number;
    type: number;
    name: string;
    desc: string;
    levelMin: number;
    levelMax: number;
    start: [number, number, number];
    npcId: number;
}

function num(row: Record<string, unknown>, key: string): number {
    const v = row[key];
    return typeof v === "number" ? v : Number(v) || 0;
}

function str(row: Record<string, unknown>, key: string): string {
    const v = row[key];
    return typeof v === "string" ? v : "";
}

export async function loadHuntingZones(): Promise<HuntingZone[]> {
    let rows: Record<string, unknown>[];
    try {
        rows = await ipc.dumpGenericDatRows("hunting_zone");
    } catch {
        return [];
    }
    return rows.map((r) => ({
        id: num(r, "id"),
        type: num(r, "type"),
        name: str(r, "name"),
        desc: str(r, "desc"),

        levelMin: num(r, "rc_level_min") || num(r, "rc_level"),
        levelMax: num(r, "rc_level_max") || num(r, "rc_level"),
        start: [num(r, "start_npc_x"), num(r, "start_npc_y"), num(r, "start_npc_z")],
        npcId: num(r, "npc_id")
    }));
}

export function huntingZonesInRegion(zones: HuntingZone[], rx: number, ry: number): HuntingZone[] {
    return zones.filter((z) => {
        const [x, y] = z.start;
        if (x === 0 && y === 0) return false;
        const r = regionOf(x, y);
        return r.rx === rx && r.ry === ry;
    });
}
