import { useSyncExternalStore } from "react";
import { ipc } from "./ipc";
import { logger } from "./logger";

logger.info("ui-prefs", "store ready (disk-backed via ui_prefs.json)");

type Prefs = Record<string, unknown>;

let prefs: Prefs = {};
let hydrated = false;
const setCache = new Map<string, ReadonlySet<string>>();
const listeners = new Set<() => void>();

function notify(): void {
    for (const l of listeners) l();
}

function saveNow(): void {
    logger.info("ui-prefs", `saving (${Object.keys(prefs).length} key(s))`);
    void ipc.writeUiPrefs(prefs).catch((e) => {
        logger.error(
            "ui-prefs",
            `write failed (collapse state won't persist): ${e instanceof Error ? e.message : String(e)}`
        );
    });
}

function currentSet(key: string): ReadonlySet<string> {
    const cached = setCache.get(key);
    if (cached) return cached;
    const v = prefs[key];
    const s: ReadonlySet<string> = new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    setCache.set(key, s);
    return s;
}

let loadStarted = false;
function ensureLoaded(): void {
    if (loadStarted) return;
    loadStarted = true;
    logger.info("ui-prefs", "loading from disk…");
    void ipc
        .readUiPrefs()
        .then((onDisk) => {
            let added = 0;
            if (onDisk && typeof onDisk === "object") {
                for (const [k, v] of Object.entries(onDisk)) {
                    if (!(k in prefs)) {
                        prefs[k] = v;
                        added++;
                    }
                }
            }
            hydrated = true;
            setCache.clear();
            notify();
            logger.info("ui-prefs", `loaded (${added} key(s) from disk; ${Object.keys(prefs).length} total)`);
        })
        .catch((e) => {
            hydrated = true;
            logger.error(
                "ui-prefs",
                `read failed (collapse state won't restore): ${e instanceof Error ? e.message : String(e)}`
            );
        });
}

export function uiPrefsHydrated(): boolean {
    return hydrated;
}

export function toggleStringSetMember(key: string, member: string): void {
    const next = new Set(currentSet(key));
    if (next.has(member)) next.delete(member);
    else next.add(member);
    setCache.set(key, next);
    prefs[key] = [...next];
    saveNow();
    notify();
}

export function setStringSet(key: string, members: Iterable<string>): void {
    const next: ReadonlySet<string> = new Set(members);
    setCache.set(key, next);
    prefs[key] = [...next];
    saveNow();
    notify();
}

export function useStringSetMember(key: string, member: string): boolean {
    return useSyncExternalStore(
        (cb) => {
            ensureLoaded();
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        () => currentSet(key).has(member),
        () => currentSet(key).has(member)
    );
}

export function useStringSet(key: string): ReadonlySet<string> {
    return useSyncExternalStore(
        (cb) => {
            ensureLoaded();
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        () => currentSet(key),
        () => currentSet(key)
    );
}

export function getJsonPref<T>(key: string, fallback: T): T {
    const v = prefs[key];
    return v === undefined ? fallback : (v as T);
}

export function setJsonPref(key: string, value: unknown): void {
    prefs[key] = value;
    saveNow();
    notify();
}

export function useJsonPref<T>(key: string, fallback: T): T {
    return useSyncExternalStore(
        (cb) => {
            ensureLoaded();
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        () => getJsonPref(key, fallback),
        () => getJsonPref(key, fallback)
    );
}
