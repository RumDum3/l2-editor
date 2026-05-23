export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
    id: number;
    timestamp: number;
    level: LogLevel;
    category: string;
    message: string;
    detail?: unknown;
}

const MAX_ENTRIES = 500;
let counter = 0;
const buffer: LogEntry[] = [];
const subscribers = new Set<(entries: readonly LogEntry[]) => void>();

function notify(): void {
    for (const fn of subscribers) fn(buffer);
}

export function log(level: LogLevel, category: string, message: string, detail?: unknown): void {
    counter += 1;
    const entry: LogEntry = {
        id: counter,
        timestamp: Date.now(),
        level,
        category,
        message,
        detail
    };
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
    const tag = `[${category}]`;
    if (level === "error") console.error(tag, message, detail ?? "");
    else if (level === "warn") console.warn(tag, message, detail ?? "");
    else if (level === "debug") console.debug(tag, message, detail ?? "");
    else console.log(tag, message, detail ?? "");
    notify();
}

export const logger = {
    info: (cat: string, msg: string, detail?: unknown) => log("info", cat, msg, detail),
    warn: (cat: string, msg: string, detail?: unknown) => log("warn", cat, msg, detail),
    error: (cat: string, msg: string, detail?: unknown) => log("error", cat, msg, detail),
    debug: (cat: string, msg: string, detail?: unknown) => log("debug", cat, msg, detail)
};

export function subscribeLog(fn: (entries: readonly LogEntry[]) => void): () => void {
    subscribers.add(fn);
    fn(buffer);
    return () => {
        subscribers.delete(fn);
    };
}

export function clearLog(): void {
    buffer.length = 0;
    notify();
}
