import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { parseZoneIds, type ZoneCatalog, type ZoneInfo } from "../data/zoneNames";

const CHIP_CLS =
    "mono inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-[1px] text-[11px]";
const DASHED_BTN_CLS =
    "rounded border border-dashed border-[var(--color-border)] px-1.5 py-[1px] text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-text)] disabled:opacity-40";

export function ZoneIdField({
    value,
    onCommit,
    catalog
}: {
    value: string;
    onCommit: (v: string) => void;
    catalog: ZoneCatalog | null;
}) {
    const [picking, setPicking] = useState(false);
    const [draft, setDraft] = useState("");
    const ids = useMemo(() => parseZoneIds(value), [value]);
    const setIds = (next: number[]) => onCommit(next.join(", "));
    const labelOf = (id: number) => catalog?.byId.get(id)?.name ?? `#${id}`;
    const addDraft = () => {
        const t = draft.trim();
        setDraft("");
        if (!t) return;
        const n = Number(t);
        if (Number.isInteger(n) && !ids.includes(n)) setIds([...ids, n]);
    };
    return (
        <div className="flex-1">
            <div className="flex flex-wrap items-center gap-1">
                {ids.length === 0 && <span className="text-[11px] text-[var(--color-text-faint)]">no zones</span>}
                {ids.map((id) => {
                    const z = catalog?.byId.get(id);
                    return (
                        <span
                            key={id}
                            className={CHIP_CLS}
                            title={
                                z ? `#${id} · ${z.type || "zone"} · ${z.file}` : `id ${id} — not in the zone catalogue`
                            }
                        >
                            {z ? (
                                <span className="text-[var(--color-text)]">{z.name}</span>
                            ) : (
                                <span className="text-[var(--color-warning)]">#{id}</span>
                            )}
                            <button
                                type="button"
                                onClick={() => setIds(ids.filter((x) => x !== id))}
                                className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                                aria-label={`Remove ${labelOf(id)}`}
                            >
                                <X size={12} aria-hidden />
                            </button>
                        </span>
                    );
                })}
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addDraft();
                        }
                    }}
                    onBlur={addDraft}
                    placeholder="+ id"
                    className="mono w-16 rounded border border-dashed border-[var(--color-border)] bg-transparent px-1 py-[1px] text-[11px] outline-none focus:border-[var(--color-accent-2)]"
                />
                <button
                    type="button"
                    disabled={!catalog}
                    onClick={() => setPicking(true)}
                    title={catalog ? "Browse the zone list" : "Zone catalogue not loaded"}
                    className={DASHED_BTN_CLS}
                >
                    pick…
                </button>
            </div>
            {picking && catalog && (
                <ZonePickerModal
                    catalog={catalog}
                    selected={ids}
                    onClose={() => setPicking(false)}
                    onConfirm={(next) => {
                        setIds(next);
                        setPicking(false);
                    }}
                />
            )}
        </div>
    );
}

function fileLabel(file: string): string {
    return file.replace(/\.xml$/i, "");
}

function ZonePickerModal({
    catalog,
    selected,
    onClose,
    onConfirm
}: {
    catalog: ZoneCatalog;
    selected: number[];
    onClose: () => void;
    onConfirm: (ids: number[]) => void;
}) {
    const [checked, setChecked] = useState<Set<number>>(() => new Set(selected));
    const [q, setQ] = useState("");
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(catalog.list.map((z) => z.file)));
    const searching = q.trim() !== "";

    const groups = useMemo(() => {
        const query = q.trim().toLowerCase();
        const byFile = new Map<string, ZoneInfo[]>();
        for (const z of catalog.list) {
            if (
                query &&
                !String(z.id).includes(query) &&
                !z.name.toLowerCase().includes(query) &&
                !z.type.toLowerCase().includes(query) &&
                !z.file.toLowerCase().includes(query)
            ) {
                continue;
            }
            const arr = byFile.get(z.file);
            if (arr) arr.push(z);
            else byFile.set(z.file, [z]);
        }
        return [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [catalog.list, q]);

    const orphans = useMemo(
        () => [...checked].filter((id) => !catalog.byId.has(id)).sort((a, b) => a - b),
        [checked, catalog.byId]
    );

    const toggleId = (id: number) =>
        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const setGroup = (zs: readonly ZoneInfo[], on: boolean) =>
        setChecked((prev) => {
            const next = new Set(prev);
            for (const z of zs) {
                if (on) next.add(z.id);
                else next.delete(z.id);
            }
            return next;
        });
    const toggleGroupCollapsed = (file: string) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(file)) next.delete(file);
            else next.add(file);
            return next;
        });

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-dismiss is a standard modal affordance
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="flex max-h-[80vh] w-[600px] flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold tracking-wide">Pick zones</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                    >
                        <X size={15} aria-hidden />
                    </button>
                </div>
                <input
                    // biome-ignore lint/a11y/noAutofocus: modal opens on demand; focusing the search box is expected
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={`search ${catalog.list.length} zones — id, name, type, file`}
                    className="mono mb-2 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                />
                <div className="min-h-0 flex-1 overflow-y-auto rounded border border-[var(--color-border)]/60">
                    {groups.length === 0 && (
                        <div className="p-3 text-[11px] text-[var(--color-text-faint)]">No zones match “{q}”.</div>
                    )}
                    {groups.map(([file, zs]) => {
                        const isCollapsed = !searching && collapsed.has(file);
                        const checkedHere = zs.reduce((n, z) => n + (checked.has(z.id) ? 1 : 0), 0);
                        return (
                            <div key={file}>
                                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--color-border)]/40 bg-[var(--color-surface-2)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                                    <button
                                        type="button"
                                        disabled={searching}
                                        onClick={() => toggleGroupCollapsed(file)}
                                        className="flex items-center gap-1 hover:text-[var(--color-text)] disabled:cursor-default"
                                    >
                                        {!searching &&
                                            (isCollapsed ? (
                                                <ChevronRight size={11} aria-hidden />
                                            ) : (
                                                <ChevronDown size={11} aria-hidden />
                                            ))}
                                        {fileLabel(file)}
                                    </button>
                                    <span className="text-[var(--color-text-faint)]/60 normal-case tracking-normal">
                                        {zs.length} zone{zs.length === 1 ? "" : "s"}
                                        {checkedHere > 0 && ` · ${checkedHere} selected`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setGroup(zs, checkedHere < zs.length)}
                                        className="ml-auto normal-case tracking-normal underline hover:text-[var(--color-text)]"
                                    >
                                        {checkedHere < zs.length ? "select all" : "select none"}
                                    </button>
                                </div>
                                {!isCollapsed &&
                                    zs.map((z) => (
                                        <label
                                            key={z.id}
                                            className="flex cursor-pointer items-center gap-2 border-b border-[var(--color-border)]/30 px-2 py-1 pl-5 text-[12px] last:border-0 hover:bg-[var(--color-surface-2)]/60"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked.has(z.id)}
                                                onChange={() => toggleId(z.id)}
                                                className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent-2)]"
                                            />
                                            <span className="mono w-16 shrink-0 text-[var(--color-accent-2)]">
                                                {z.id}
                                            </span>
                                            <span className="flex-1 truncate text-[var(--color-text)]">{z.name}</span>
                                            {z.type && (
                                                <span className="shrink-0 text-[10px] text-[var(--color-text-faint)]">
                                                    {z.type}
                                                </span>
                                            )}
                                        </label>
                                    ))}
                            </div>
                        );
                    })}
                </div>
                {orphans.length > 0 && (
                    <div className="mt-1.5 text-[10px] text-[var(--color-text-faint)]">
                        keeping {orphans.length} id{orphans.length === 1 ? "" : "s"} not in the catalogue:{" "}
                        <span className="mono">{orphans.map((id) => `#${id}`).join(", ")}</span>
                    </div>
                )}
                <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-[var(--color-text-faint)]">
                        {checked.size} selected
                        {checked.size > 0 && (
                            <button
                                type="button"
                                onClick={() => setChecked(new Set())}
                                className="ml-2 underline hover:text-[var(--color-text)]"
                            >
                                clear
                            </button>
                        )}
                        {!searching && (
                            <>
                                {" · "}
                                <button
                                    type="button"
                                    onClick={() => setCollapsed(new Set())}
                                    className="underline hover:text-[var(--color-text)]"
                                >
                                    expand all
                                </button>
                                {" / "}
                                <button
                                    type="button"
                                    onClick={() => setCollapsed(new Set(catalog.list.map((z) => z.file)))}
                                    className="underline hover:text-[var(--color-text)]"
                                >
                                    collapse all
                                </button>
                            </>
                        )}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-xs hover:border-[var(--color-accent-2)]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => onConfirm([...checked].sort((a, b) => a - b))}
                            className="rounded border border-[var(--color-accent-2)] bg-[var(--color-surface-2)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                        >
                            Use selected
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
