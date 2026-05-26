import { invoke } from "@tauri-apps/api/core";
import { logger } from "./logger";

type Status = "loading" | "loaded" | "missing" | "error";

export interface TextureEntry {
    status: Status;
    url: string | null;
    error?: string;
}

const cache = new Map<string, TextureEntry>();
const subscribers = new Map<string, Set<(e: TextureEntry) => void>>();

export interface TextureStats {
    loaded: number;
    loading: number;
    missing: number;
    error: number;
    total: number;
}

const statsSubscribers = new Set<(s: TextureStats) => void>();

function computeStats(): TextureStats {
    const out: TextureStats = { loaded: 0, loading: 0, missing: 0, error: 0, total: 0 };
    for (const e of cache.values()) {
        out[e.status] += 1;
        out.total += 1;
    }
    return out;
}

function notifyStats(): void {
    if (statsSubscribers.size === 0) return;
    const s = computeStats();
    for (const fn of statsSubscribers) fn(s);
}

export function subscribeTextureStats(fn: (s: TextureStats) => void): () => void {
    statsSubscribers.add(fn);
    fn(computeStats());
    return () => {
        statsSubscribers.delete(fn);
    };
}

function notify(key: string, entry: TextureEntry): void {
    const subs = subscribers.get(key);
    if (subs) for (const fn of subs) fn(entry);
    notifyStats();
}

function set(key: string, entry: TextureEntry): void {
    cache.set(key, entry);
    notify(key, entry);
}

const MAX_CONCURRENT = 4;
let inFlight = 0;
const waiters: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (inFlight >= MAX_CONCURRENT) {
        await new Promise<void>((resolve) => waiters.push(resolve));
    }
    inFlight++;
    try {
        return await fn();
    } finally {
        inFlight--;
        const next = waiters.shift();
        if (next) next();
    }
}

export interface TextureRef {
    package: string;
    name: string;
}

export function parseTextureRef(file: string | null | undefined): TextureRef | null {
    if (!file) return null;
    const trimmed = file.trim();
    if (!trimmed) return null;
    const firstDot = trimmed.indexOf(".");
    if (firstDot < 0) return { package: "", name: trimmed };
    const lastDot = trimmed.lastIndexOf(".");
    return {
        package: trimmed.slice(0, firstDot),
        name: trimmed.slice(lastDot + 1)
    };
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:${mime};base64,${btoa(bin)}`;
}

export function getTextureFromCache(file: string): TextureEntry | undefined {
    const ref = parseTextureRef(file);
    if (!ref) return undefined;
    return cache.get(`${ref.package}/${ref.name}`);
}

export function subscribeTexture(file: string, fn: (e: TextureEntry) => void): () => void {
    const ref = parseTextureRef(file);
    if (!ref) return () => {};
    const key = `${ref.package}/${ref.name}`;
    let subs = subscribers.get(key);
    if (!subs) {
        subs = new Set();
        subscribers.set(key, subs);
    }
    subs.add(fn);
    return () => {
        subs?.delete(fn);
    };
}

export async function loadTexture(file: string, clientRoot: string): Promise<TextureEntry> {
    const ref = parseTextureRef(file);
    if (!ref) {
        return { status: "error", url: null, error: "invalid texture ref" };
    }
    const key = `${ref.package}/${ref.name}`;
    const existing = cache.get(key);
    if (existing && existing.status === "loaded") {
        logger.debug("texture", `js-cache hit ${file}`, { status: existing.status });
        return existing;
    }
    if (existing && existing.status !== "loaded") {
        cache.delete(key);
    }

    set(key, { status: "loading", url: null });
    const t0 = performance.now();
    try {
        const candidates: string[] = [ref.name];
        const lower = ref.name.toLowerCase();
        if (!lower.endsWith("_ori") && !lower.endsWith("_sp")) {
            candidates.push(`${ref.name}_ori`, `${ref.name}_sp`);
        }
        let result: number[] | null = null;
        let usedName = ref.name;
        for (const candidate of candidates) {
            result = await withSlot(() =>
                invoke<number[] | null>("read_texture", {
                    clientRoot,
                    package: ref.package,
                    name: candidate
                })
            );
            if (result) {
                usedName = candidate;
                break;
            }
        }
        const ms = Math.round(performance.now() - t0);
        if (!result) {
            const e: TextureEntry = { status: "missing", url: null };
            set(key, e);
            logger.debug("texture", `missing ${file} (tried ${candidates.join(", ")})`, { ms });
            return e;
        }
        if (usedName !== ref.name) {
            logger.debug("texture", `resolved ${file} via fallback to ${usedName}`, {});
        }
        const bytes = new Uint8Array(result);
        const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
        const url = bytesToDataUrl(bytes, isJpg ? "image/jpeg" : "image/png");
        const entry: TextureEntry = { status: "loaded", url };
        set(key, entry);
        logger.info("texture", `loaded ${file}`, { bytes: bytes.length, ms });
        return entry;
    } catch (err) {
        const ms = Math.round(performance.now() - t0);
        const entry: TextureEntry = { status: "error", url: null, error: String(err) };
        set(key, entry);
        logger.error("texture", `failed ${file}`, { error: String(err), ms });
        return entry;
    }
}

export async function listTextures(packageName: string, clientRoot: string): Promise<string[]> {
    if (!clientRoot) return [];
    try {
        return await invoke<string[]>("list_textures", { clientRoot, package: packageName });
    } catch (err) {
        logger.error("texture", `list ${packageName} failed`, { error: String(err) });
        return [];
    }
}

export function clearTextureCache(): void {
    cache.clear();
    for (const subs of subscribers.values()) {
        for (const fn of subs) fn({ status: "missing", url: null });
    }
    notifyStats();
}
