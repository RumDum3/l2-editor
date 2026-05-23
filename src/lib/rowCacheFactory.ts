import { useEffect, useState } from "react";

export type Fetcher<Row> = (ids: number[]) => Promise<Record<number, Row[]>>;

export type RowCache<Row> = {
    get(id: number): Row[] | null | undefined;
    ensure(id: number): Promise<Row[] | null>;
    invalidateId(id: number): void;
    invalidateAll(): void;
    useRows(id: number | null | undefined): Row[] | null | undefined;
};

export function createRowCache<Row>(fetcher: Fetcher<Row>): RowCache<Row> {
    const cache = new Map<number, Row[] | null>();
    const inflight = new Map<number, Promise<Row[] | null>>();
    const subscribers = new Map<number, Set<() => void>>();

    let pending = new Set<number>();
    let pendingResolves: Array<() => void> = [];
    let scheduled = false;

    const flush = () => {
        scheduled = false;
        if (pending.size === 0) return;
        const ids = [...pending];
        pending = new Set();
        const resolvers = pendingResolves;
        pendingResolves = [];

        fetcher(ids)
            .then((res) => {
                for (const id of ids) {
                    cache.set(id, res[id] ?? null);
                    inflight.delete(id);
                }
                for (const id of ids) {
                    const subs = subscribers.get(id);
                    if (subs) for (const cb of subs) cb();
                }
                for (const r of resolvers) r();
            })
            .catch((e) => {
                for (const id of ids) {
                    cache.set(id, null);
                    inflight.delete(id);
                }
                console.error("rowCache fetch failed:", e);
                for (const r of resolvers) r();
            });
    };

    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(flush);
    };

    const ensure = (id: number): Promise<Row[] | null> => {
        const existing = cache.get(id);
        if (existing !== undefined) return Promise.resolve(existing);
        const inFlight = inflight.get(id);
        if (inFlight) return inFlight;
        const p = new Promise<Row[] | null>((resolve) => {
            pendingResolves.push(() => resolve(cache.get(id) ?? null));
        });
        pending.add(id);
        inflight.set(id, p);
        schedule();
        return p;
    };

    return {
        get: (id) => cache.get(id),
        ensure,
        invalidateId(id) {
            cache.delete(id);
            inflight.delete(id);
            const subs = subscribers.get(id);
            if (subs) for (const cb of subs) cb();
            if (subs && subs.size > 0) void ensure(id);
        },
        invalidateAll() {
            const activeIds = [...subscribers.keys()];
            cache.clear();
            inflight.clear();
            for (const subs of subscribers.values()) for (const cb of subs) cb();
            for (const id of activeIds) void ensure(id);
        },
        useRows(id) {
            const [, force] = useState(0);
            useEffect(() => {
                if (id == null) return;
                const subs = subscribers.get(id) ?? new Set<() => void>();
                const cb = () => force((n) => n + 1);
                subs.add(cb);
                subscribers.set(id, subs);
                if (cache.get(id) === undefined) void ensure(id);
                return () => {
                    subs.delete(cb);
                    if (subs.size === 0) subscribers.delete(id);
                };
            }, [id]);
            return id == null ? undefined : cache.get(id);
        }
    };
}
