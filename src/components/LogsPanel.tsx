import { useEffect, useMemo, useRef, useState } from "react";
import { clearLog, type LogEntry, type LogLevel, subscribeLog } from "../lib/logger";

interface Props {
    onClose: () => void;
}

const STORAGE_KEY = "xml-editor.logs.height";
const DEFAULT_HEIGHT = 220;
const MIN_HEIGHT = 90;
const maxHeight = () => Math.max(MIN_HEIGHT + 20, Math.floor(window.innerHeight * 0.8));

const levelClass: Record<LogLevel, string> = {
    info: "text-[var(--color-text)]",
    warn: "text-[var(--color-warning)]",
    error: "text-[var(--color-danger)]",
    debug: "text-[var(--color-text-faint)]"
};

const levelLabel: Record<LogLevel, string> = {
    info: "INFO",
    warn: "WARN",
    error: "ERR ",
    debug: "DBG "
};

export function LogsPanel({ onClose }: Props) {
    const [entries, setEntries] = useState<readonly LogEntry[]>([]);
    const [filterText, setFilterText] = useState("");
    const [hideDebug, setHideDebug] = useState(true);
    const [height, setHeight] = useState<number>(() => {
        const saved = Number(localStorage.getItem(STORAGE_KEY));
        return Number.isFinite(saved) && saved >= MIN_HEIGHT ? saved : DEFAULT_HEIGHT;
    });
    const draggingRef = useRef(false);
    const startRef = useRef<{ y: number; h: number } | null>(null);

    useEffect(() => {
        return subscribeLog((all) => setEntries([...all]));
    }, []);

    const filtered = useMemo(() => {
        const q = filterText.trim().toLowerCase();
        return entries.filter((e) => {
            if (hideDebug && e.level === "debug") return false;
            if (!q) return true;
            return (
                e.category.toLowerCase().includes(q) ||
                e.message.toLowerCase().includes(q) ||
                JSON.stringify(e.detail ?? "")
                    .toLowerCase()
                    .includes(q)
            );
        });
    }, [entries, filterText, hideDebug]);

    useEffect(() => {
        function onMove(e: MouseEvent) {
            if (!draggingRef.current || !startRef.current) return;
            const dy = startRef.current.y - e.clientY;
            const next = Math.min(maxHeight(), Math.max(MIN_HEIGHT, startRef.current.h + dy));
            setHeight(next);
        }
        function onUp() {
            if (draggingRef.current) {
                draggingRef.current = false;
                startRef.current = null;
                document.body.style.userSelect = "";
                document.body.style.cursor = "";
                localStorage.setItem(STORAGE_KEY, String(height));
            }
        }
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [height]);

    function startDrag(e: React.MouseEvent) {
        e.preventDefault();
        draggingRef.current = true;
        startRef.current = { y: e.clientY, h: height };
        document.body.style.userSelect = "none";
        document.body.style.cursor = "ns-resize";
    }

    return (
        <div
            className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
            style={{ height }}
        >
            <div
                onMouseDown={startDrag}
                className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize hover:bg-[var(--color-accent-2)]/30"
                title="Drag to resize"
            />
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-black/30 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                    Logs · {filtered.length} / {entries.length}
                </span>
                <input
                    value={filterText}
                    onChange={(e) => setFilterText(e.currentTarget.value)}
                    placeholder="Filter…"
                    className="mono h-6 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-[11px] outline-none focus:border-[var(--color-accent-2)]"
                />
                <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-faint)]">
                    <input
                        type="checkbox"
                        checked={hideDebug}
                        onChange={(e) => setHideDebug(e.currentTarget.checked)}
                        className="accent-[var(--color-accent-2)]"
                    />
                    hide debug
                </label>
                <button
                    type="button"
                    onClick={clearLog}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-xs hover:border-[var(--color-accent-2)]"
                >
                    Clear
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-xs hover:border-[var(--color-accent-2)]"
                >
                    Close
                </button>
            </div>
            <div className="mono flex-1 overflow-auto text-[11px]">
                {filtered.length === 0 && (
                    <div className="px-3 py-6 text-center text-[var(--color-text-faint)]">No log entries.</div>
                )}
                {filtered.map((e) => (
                    <LogRow key={e.id} entry={e} />
                ))}
            </div>
        </div>
    );
}

function LogRow({ entry }: { entry: LogEntry }) {
    const time = new Date(entry.timestamp);
    const stamp = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}.${time
        .getMilliseconds()
        .toString()
        .padStart(3, "0")}`;
    const detailStr =
        entry.detail !== undefined && entry.detail !== null
            ? typeof entry.detail === "string"
                ? entry.detail
                : JSON.stringify(entry.detail)
            : "";
    return (
        <div className={`border-b border-[var(--color-border)]/40 px-3 py-1 ${levelClass[entry.level]}`}>
            <span className="mr-2 text-[10px] text-[var(--color-text-faint)]">{stamp}</span>
            <span className="mr-2 text-[10px] font-semibold">{levelLabel[entry.level]}</span>
            <span className="mr-2 text-[var(--color-accent-2)]">[{entry.category}]</span>
            <span>{entry.message}</span>
            {detailStr && <span className="ml-2 text-[var(--color-text-faint)]">· {detailStr}</span>}
        </div>
    );
}

function pad(n: number) {
    return n.toString().padStart(2, "0");
}
