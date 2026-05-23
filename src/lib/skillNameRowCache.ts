import { ipc, type SkillnameRow } from "./ipc";
import { createRowCache } from "./rowCacheFactory";

const cache = createRowCache<SkillnameRow>(ipc.lookupSkillnameRows);

export const useSkillnameRows = cache.useRows;
export const ensureSkillnameRows = cache.ensure;
export const getCachedSkillnameRows = cache.get;
export const invalidateSkillnameId = cache.invalidateId;
export const invalidateAllSkillnames = cache.invalidateAll;

export function pickCanonicalSkillname(
    rows: SkillnameRow[] | null | undefined,
    targetLevel = 1
): SkillnameRow | undefined {
    if (!rows || rows.length === 0) return undefined;
    const exact = rows.find((r) => r.skill_level === targetLevel && (r.skill_sublevel ?? 0) === 0);
    if (exact) return exact;
    return [...rows].sort(
        (a, b) => (a.skill_level ?? 0) - (b.skill_level ?? 0) || (a.skill_sublevel ?? 0) - (b.skill_sublevel ?? 0)
    )[0];
}
