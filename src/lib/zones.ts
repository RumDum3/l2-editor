import { joinPath } from "./dataPaths";
import { ipc } from "./ipc";
import { REGION_SIZE } from "./worldCoords";

export interface Zone {
    name: string;
    type: string;
    points: Array<[number, number]>;
    minZ: number;
    maxZ: number;
    stats: Array<{ name: string; val: string }>;
    filePath: string;
}

export function zoneRing(z: Zone): Array<[number, number]> {
    if (z.points.length !== 2) return z.points;
    const [a, b] = z.points;
    return [a, [b[0], a[1]], b, [a[0], b[1]]];
}

export async function loadZones(dataRoot: string): Promise<Zone[]> {
    if (!dataRoot) return [];
    let files: Awaited<ReturnType<typeof ipc.listXmlFiles>>;
    try {
        files = await ipc.listXmlFiles(joinPath(dataRoot, "zones"), false);
    } catch {
        return [];
    }
    const parser = new DOMParser();
    const out: Zone[] = [];
    for (const f of files) {
        let xml: string;
        try {
            xml = await ipc.readXml(f.path);
        } catch {
            continue;
        }
        const doc = parser.parseFromString(xml, "application/xml");
        doc.querySelectorAll("zone").forEach((z) => {
            const points: Array<[number, number]> = [];
            z.querySelectorAll("node").forEach((n) => {
                const x = Number(n.getAttribute("X"));
                const y = Number(n.getAttribute("Y"));
                if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
            });
            if (points.length < 2) return;
            const stats: Array<{ name: string; val: string }> = [];
            z.querySelectorAll("stat").forEach((s) => {
                const name = s.getAttribute("name");
                if (name) stats.push({ name, val: s.getAttribute("val") ?? "" });
            });
            out.push({
                name: z.getAttribute("name") ?? "(unnamed)",
                type: z.getAttribute("type") ?? "",
                points,
                minZ: Number(z.getAttribute("minZ")) || 0,
                maxZ: Number(z.getAttribute("maxZ")) || 0,
                stats,
                filePath: f.path
            });
        });
    }
    return out;
}

export const ZONE_TYPE_INFO: Record<string, string> = {
    ArenaZone: "Free PvP arena — no flagging or karma for kills.",
    CastleZone: "Castle grounds.",
    ClanHallZone: "Clan hall grounds.",
    CleftZone: "The Cleft event battlefield.",
    ConditionZone: "Access restricted by conditions (level, items, …).",
    ConquestZone: "Conquest territory area.",
    DamageZone: "Periodically damages players standing inside.",
    DerbyTrackZone: "Monster Derby race track.",
    EffectZone: "Applies skills / buffs / debuffs to players inside.",
    FishingZone: "Fishing is allowed here.",
    FortZone: "Fortress grounds.",
    HqZone: "Siege headquarters flag may be placed here.",
    JailZone: "Jail — players are confined and restricted.",
    LandingZone: "Airships may land here.",
    MotherTreeZone: "Elven Mother Tree — bonus HP/MP regeneration.",
    NoLandingZone: "Airships cannot land here.",
    NoPvPZone: "PvP is disabled.",
    NoRestartZone: "Cannot log back in or restart at this spot.",
    NoStoreZone: "Private stores and crafting workshops are forbidden.",
    NoSummonFriendZone: "Summon Friend / teleporting into here is blocked.",
    OlympiadStadiumZone: "Olympiad match arena.",
    PeaceZone: "Peace zone — players cannot attack each other.",
    ResidenceTeleportZone: "Teleport points for a residence (castle/fort/hall).",
    RespawnZone: "Defines where players respawn after death.",
    SSQZone: "Seven Signs quest zone.",
    SayuneZone: "Sayune flight-route zone.",
    ScriptZone: "Generic zone that quests / scripts react to.",
    SiegeZone: "Castle or fortress siege battlefield.",
    SwampZone: "Swamp — slows movement speed.",
    TaxZone: "Castle tax-collection area.",
    TeleportZone: "Teleports players who enter it.",
    TerritoryWarZone: "Territory War battlefield.",
    TimedHuntingZone: "Timed / instanced hunting ground.",
    WaterZone: "Water — swimming physics apply.",
    banish: "Players entering are banished (teleported out).",
    blueBanishPoint: "Blue-team banish point (event).",
    blueStartPoint: "Blue-team start point (event).",
    chaotic: "Chaotic free-PvP sub-zone (event).",
    other: "Miscellaneous event sub-zone.",
    redBanishPoint: "Red-team banish point (event).",
    redStartPoint: "Red-team start point (event).",
    spectatorSpawn: "Spectator spawn point (event)."
};

export function zoneTypeInfo(type: string): string {
    return ZONE_TYPE_INFO[type] ?? "";
}

export function zoneColor(type: string): string {
    let h = 0;
    for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) % 360;
    return `hsl(${h}, 70%, 58%)`;
}

export function zoneCentroid(z: Zone): [number, number] {
    let sx = 0;
    let sy = 0;
    for (const [x, y] of z.points) {
        sx += x;
        sy += y;
    }
    return [Math.round(sx / z.points.length), Math.round(sy / z.points.length)];
}

type Pt = [number, number];

function polygonArea(ring: Pt[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
}

function clipToRect(ring: Pt[], x0: number, y0: number, x1: number, y1: number): Pt[] {
    const clip = (poly: Pt[], inside: (p: Pt) => boolean, cut: (a: Pt, b: Pt) => Pt): Pt[] => {
        if (poly.length === 0) return poly;
        const out: Pt[] = [];
        for (let i = 0; i < poly.length; i++) {
            const cur = poly[i];
            const prev = poly[(i + poly.length - 1) % poly.length];
            const curIn = inside(cur);
            if (inside(prev) !== curIn) out.push(cut(prev, cur));
            if (curIn) out.push(cur);
        }
        return out;
    };
    let p: Pt[] = ring;
    p = clip(
        p,
        (q) => q[0] >= x0,
        (a, b) => [x0, a[1] + ((x0 - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]
    );
    p = clip(
        p,
        (q) => q[0] <= x1,
        (a, b) => [x1, a[1] + ((x1 - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]
    );
    p = clip(
        p,
        (q) => q[1] >= y0,
        (a, b) => [a[0] + ((y0 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), y0]
    );
    p = clip(
        p,
        (q) => q[1] <= y1,
        (a, b) => [a[0] + ((y1 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), y1]
    );
    return p;
}

export function zoneCoverageOfRegion(z: Zone, rx: number, ry: number): number {
    const x0 = (rx - 20) * REGION_SIZE;
    const y0 = (ry - 18) * REGION_SIZE;
    const ring = zoneRing(z);
    const total = polygonArea(ring);
    if (total <= 0) return 0;
    const clipped = clipToRect(ring, x0, y0, x0 + REGION_SIZE, y0 + REGION_SIZE);
    const inside = clipped.length >= 3 ? polygonArea(clipped) : 0;
    return inside / total;
}

const REGION_OWNERSHIP = 0.75;

export function zonesInRegion(zones: Zone[], rx: number, ry: number): Zone[] {
    return zones.filter((z) => zoneCoverageOfRegion(z, rx, ry) >= REGION_OWNERSHIP);
}
