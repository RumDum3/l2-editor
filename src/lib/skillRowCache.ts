import { type ClientSkillRow, ipc } from "./ipc";
import { createRowCache } from "./rowCacheFactory";

const cache = createRowCache<ClientSkillRow>(ipc.lookupSkillRows);

export const useSkillRows = cache.useRows;
export const ensureRows = cache.ensure;
export const getCachedRows = cache.get;
export const invalidateId = cache.invalidateId;
export const invalidateAll = cache.invalidateAll;

export function pickCanonicalRow(
    rows: ClientSkillRow[] | null | undefined,
    targetLevel = 1
): ClientSkillRow | undefined {
    if (!rows || rows.length === 0) return undefined;
    const exact = rows.find((r) => r.skill_level === targetLevel && (r.skill_sublevel ?? 0) === 0);
    if (exact) return exact;
    return [...rows].sort(
        (a, b) => (a.skill_level ?? 0) - (b.skill_level ?? 0) || (a.skill_sublevel ?? 0) - (b.skill_sublevel ?? 0)
    )[0];
}
