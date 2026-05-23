import { ipc, type NpcInfo, type SpawnPoint } from "./ipc";
import { regionOf } from "./worldCoords";

const BOSS_TYPES = new Set(["RaidBoss", "GrandBoss", "RaidBossr"]);

export interface Boss {
    npcId: number;
    name: string;
    type: string;
    level: number;
    x: number;
    y: number;
    respawn: string;
}

export interface WorldSpawnIndex {
    npcs: Map<number, NpcInfo>;
    bosses: Boss[];
    spawns: SpawnPoint[];
}

export const EMPTY_SPAWN_INDEX: WorldSpawnIndex = { npcs: new Map(), bosses: [], spawns: [] };

export async function loadWorldSpawns(dataRoot: string): Promise<WorldSpawnIndex> {
    if (!dataRoot) return EMPTY_SPAWN_INDEX;
    let raw: Awaited<ReturnType<typeof ipc.loadWorldSpawns>>;
    try {
        raw = await ipc.loadWorldSpawns(dataRoot);
    } catch {
        return EMPTY_SPAWN_INDEX;
    }
    const npcs = new Map<number, NpcInfo>();
    for (const n of raw.npcs) npcs.set(n.id, n);

    const bosses: Boss[] = [];
    const spawns: SpawnPoint[] = [];
    for (const s of raw.spawns) {
        const info = npcs.get(s.npcId);
        if (info && BOSS_TYPES.has(info.type)) {
            bosses.push({
                npcId: s.npcId,
                name: info.name || `#${s.npcId}`,
                type: info.type,
                level: info.level,
                x: s.x,
                y: s.y,
                respawn: s.respawn
            });
        } else {
            spawns.push(s);
        }
    }
    return { npcs, bosses, spawns };
}

export interface RegionNpcGroup {
    npcId: number;
    name: string;
    type: string;
    level: number;
    count: number;
    spots: number;
}

export function npcsInRegion(
    spawns: SpawnPoint[],
    npcs: Map<number, NpcInfo>,
    rx: number,
    ry: number
): RegionNpcGroup[] {
    const groups = new Map<number, RegionNpcGroup>();
    for (const s of spawns) {
        const r = regionOf(s.x, s.y);
        if (r.rx !== rx || r.ry !== ry) continue;
        let g = groups.get(s.npcId);
        if (!g) {
            const info = npcs.get(s.npcId);
            g = {
                npcId: s.npcId,
                name: info?.name || `#${s.npcId}`,
                type: info?.type ?? "",
                level: info?.level ?? 0,
                count: 0,
                spots: 0
            };
            groups.set(s.npcId, g);
        }
        g.count += s.count;
        g.spots += 1;
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
}

export function bossesInRegion(bosses: Boss[], rx: number, ry: number): Boss[] {
    return bosses.filter((b) => {
        const r = regionOf(b.x, b.y);
        return r.rx === rx && r.ry === ry;
    });
}
