import { ipc } from "./ipc";
import { type RowCache, createRowCache } from "./rowCacheFactory";

type TierRow = Record<string, unknown>;

const caches = new Map<string, RowCache<TierRow>>();

function cacheFor(key: string): RowCache<TierRow> {
    let c = caches.get(key);
    if (!c) {
        c = createRowCache<TierRow>((ids) => ipc.lookupGenericRows(key, ids));
        caches.set(key, c);
    }
    return c;
}

export function useTier2Rows(key: string, skillId: number | null | undefined) {
    return cacheFor(key).useRows(skillId);
}

export function invalidateTier2Id(key: string, id: number) {
    caches.get(key)?.invalidateId(id);
}

export function invalidateTier2(key: string) {
    caches.get(key)?.invalidateAll();
}
