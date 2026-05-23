import { AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { type ClassSkillTrees, completeClassSkills, loadClassSkillTrees } from "../editors/skills/data/skillTrees";
import { useEditor } from "../state/EditorContext";
import { useSettings } from "../state/SettingsContext";

const PAGE_SIZE = 60;

export function CardGrid() {
    const { loaded, loading, folderError, enterDetail, refreshFolder } = useEditor();
    const { config, skillgrp, skillNames, probe, serverProtocols } = useSettings();
    const [filter, setFilter] = useState("");
    const [page, setPage] = useState(0);
    const [classTrees, setClassTrees] = useState<ClassSkillTrees | "loading" | null>(null);
    const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

    useEffect(() => {
        if (loaded?.plugin.id !== "skills" || !config?.dataRoot) {
            setClassTrees(null);
            setSelectedClassId(null);
            return;
        }
        let cancelled = false;
        setClassTrees("loading");
        setSelectedClassId(null);
        loadClassSkillTrees(config.dataRoot)
            .then((t) => {
                if (!cancelled) setClassTrees(t);
            })
            .catch(() => {
                if (!cancelled) setClassTrees(null);
            });
        return () => {
            cancelled = true;
        };
    }, [loaded?.plugin.id, config?.dataRoot]);

    const classFilterSet = useMemo<Set<number> | null>(() => {
        if (selectedClassId == null || classTrees === null || classTrees === "loading") return null;
        return completeClassSkills(selectedClassId, classTrees);
    }, [selectedClassId, classTrees]);

    const createEntity = () => {
        if (!loaded?.plugin.newEntity) return;
        const idAttr = loaded.plugin.idAttr ?? "id";
        const maxId = loaded.index.reduce(
            (m, e) => (typeof e.summary.id === "number" ? Math.max(m, e.summary.id) : m),
            0
        );
        const newId = maxId + 1;
        let fileIdx = loaded.files.findIndex((f) => {
            const mm = f.name.match(/^(\d+)-(\d+)\.xml$/i);
            return mm ? newId >= Number(mm[1]) && newId <= Number(mm[2]) : false;
        });
        if (fileIdx < 0) fileIdx = loaded.files.length - 1;
        const file = loaded.files[fileIdx];
        const list = file.doc.documentElement;
        if (!list) return;
        const el = loaded.plugin.newEntity(file.doc, newId);
        const after = Array.from(list.children).find((c) => {
            const cid = Number(c.getAttribute(idAttr) ?? "");
            return Number.isFinite(cid) && cid > newId;
        });
        list.insertBefore(el, after ?? null);
        refreshFolder();
        const idx = loaded.index.findIndex((e) => String(e.summary.id) === String(newId));
        if (idx >= 0) enterDetail(idx);
    };

    const clientChronicle = useMemo(() => {
        const variant =
            skillgrp.kind === "done"
                ? skillgrp.summary.meta.schemaVariant
                : skillNames.kind === "done"
                  ? skillNames.summary.meta.schemaVariant
                  : null;
        const proto = probe.kind === "done" ? probe.protocol : null;
        if (variant && proto) return `${variant} · p${proto}`;
        if (variant) return variant;
        if (proto) return `p${proto}`;
        return null;
    }, [skillgrp, skillNames, probe]);

    const protocolState = useMemo<
        { kind: "match" } | { kind: "mismatch"; client: number; allowed: number[] } | null
    >(() => {
        if (probe.kind !== "done" || serverProtocols.kind !== "done") return null;
        return serverProtocols.protocols.includes(probe.protocol)
            ? { kind: "match" }
            : { kind: "mismatch", client: probe.protocol, allowed: serverProtocols.protocols };
    }, [probe, serverProtocols]);

    const deferredFilter = useDeferredValue(filter);

    const visible = useMemo(() => {
        if (!loaded) return [];
        const q = deferredFilter.trim().toLowerCase();
        const inClass = (id: string | number) =>
            !classFilterSet || classFilterSet.has(typeof id === "number" ? id : Number(id));
        const out: { entry: (typeof loaded.index)[number]; idx: number }[] = [];
        for (let i = 0; i < loaded.index.length; i++) {
            const e = loaded.index[i];
            if (q && !e.searchKey.includes(q)) continue;
            if (!inClass(e.summary.id)) continue;
            out.push({ entry: e, idx: i });
        }
        return out;
    }, [loaded, deferredFilter, classFilterSet]);

    useEffect(() => {
        const last = Math.max(0, Math.ceil(visible.length / PAGE_SIZE) - 1);
        if (page > last) setPage(last);
    }, [visible.length, page]);

    if (loading) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[12px] text-[var(--color-text-faint)]">
                <span>Loading {loading.total} files…</span>
                <div className="h-1 w-64 overflow-hidden rounded bg-[var(--color-surface-2)]">
                    <div
                        className="h-full bg-[var(--color-accent-2)] transition-[width]"
                        style={{ width: `${(loading.done / Math.max(1, loading.total)) * 100}%` }}
                    />
                </div>
                <span className="mono">
                    {loading.done} / {loading.total}
                </span>
            </div>
        );
    }

    if (folderError) {
        return (
            <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-[var(--color-danger)]">
                {folderError}
            </div>
        );
    }

    if (!loaded) {
        return (
            <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-faint)]">
                Pick a <span className="mx-1 text-[var(--color-text)]">category</span> in the sidebar to begin.
            </div>
        );
    }

    const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    const start = page * PAGE_SIZE;
    const slice = visible.slice(start, start + PAGE_SIZE);
    const Card = loaded.plugin.Card;

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
                <input
                    autoFocus
                    value={filter}
                    onChange={(e) => {
                        setFilter(e.target.value);
                        setPage(0);
                    }}
                    placeholder={`Search ${loaded.plugin.label.toLowerCase()} (id, name, file)…`}
                    className="mono w-80 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                />
                {loaded.plugin.id === "skills" && (
                    <select
                        value={selectedClassId ?? ""}
                        onChange={(e) => {
                            setSelectedClassId(e.target.value ? Number(e.target.value) : null);
                            setPage(0);
                        }}
                        disabled={classTrees === null || classTrees === "loading"}
                        title="Filter the grid to skills a class can learn (from the skill trees, parent classes included)"
                        className="mono w-48 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)] disabled:opacity-50"
                    >
                        <option value="">
                            {classTrees === "loading"
                                ? "loading classes…"
                                : classTrees === null
                                  ? "(no class data)"
                                  : "All classes"}
                        </option>
                        {classTrees !== null &&
                            classTrees !== "loading" &&
                            classTrees.classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                    </select>
                )}
                <span className="text-[11px] text-[var(--color-text-faint)]">
                    {visible.length.toLocaleString()} / {loaded.index.length.toLocaleString()} · {loaded.files.length}{" "}
                    file{loaded.files.length === 1 ? "" : "s"}
                </span>
                {loaded.plugin.newEntity && (
                    <button
                        type="button"
                        onClick={createEntity}
                        title={`Create a new ${loaded.plugin.label.replace(/s$/i, "").toLowerCase()}`}
                        className="rounded border border-dashed border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-text)]"
                    >
                        + New {loaded.plugin.label.replace(/s$/i, "").toLowerCase()}
                    </button>
                )}
                {clientChronicle && (
                    <span
                        className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]"
                        title="Client chronicle — schema variant matched on the imported Skillgrp / SkillName, plus the L2.exe protocol if probed"
                    >
                        {clientChronicle}
                    </span>
                )}
                {protocolState?.kind === "mismatch" && (
                    <span
                        className="inline-flex items-center gap-1 rounded border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--color-danger)]"
                        title={`Client protocol p${protocolState.client} is not in the server's AllowedProtocolRevisions [${protocolState.allowed.join(", ")}] — the client won't be able to connect`}
                    >
                        <AlertTriangle size={11} aria-hidden /> protocol mismatch
                    </span>
                )}
                <div className="ml-auto">
                    <Pager page={page} total={totalPages} onChange={setPage} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {slice.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-faint)]">
                        No matches.
                    </div>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                        {slice.map(({ entry, idx }) => {
                            const file = loaded.files[entry.fileIndex];
                            const ent = file.entities[entry.entityIndex];
                            const onSelect = () => enterDetail(idx);
                            if (Card) {
                                // biome-ignore lint/suspicious/noExplicitAny: type-erased shell
                                return (
                                    <Card
                                        key={`${entry.fileIndex}:${entry.entityIndex}`}
                                        entity={ent as any}
                                        onSelect={onSelect}
                                    />
                                );
                            }
                            return (
                                <DefaultCard
                                    key={`${entry.fileIndex}:${entry.entityIndex}`}
                                    id={entry.summary.id}
                                    label={entry.summary.label}
                                    onSelect={onSelect}
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            {totalPages > 1 && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5">
                    <Pager page={page} total={totalPages} onChange={setPage} />
                </div>
            )}
        </div>
    );
}

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
    const human = Math.min(page + 1, total);
    return (
        <div className="flex items-center gap-1 text-[11px]">
            <PageBtn
                label={<ChevronsLeft size={13} aria-hidden />}
                disabled={page === 0}
                onClick={() => onChange(0)}
                title="First"
            />
            <PageBtn
                label={<ChevronLeft size={13} aria-hidden />}
                disabled={page === 0}
                onClick={() => onChange(page - 1)}
                title="Previous"
            />
            <span className="mono px-2 text-[var(--color-text-faint)]">
                page <span className="text-[var(--color-text)]">{human}</span> / {total}
            </span>
            <PageBtn
                label={<ChevronRight size={13} aria-hidden />}
                disabled={page >= total - 1}
                onClick={() => onChange(page + 1)}
                title="Next"
            />
            <PageBtn
                label={<ChevronsRight size={13} aria-hidden />}
                disabled={page >= total - 1}
                onClick={() => onChange(total - 1)}
                title="Last"
            />
        </div>
    );
}

function PageBtn({
    label,
    disabled,
    onClick,
    title
}: {
    label: React.ReactNode;
    disabled: boolean;
    onClick: () => void;
    title: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            aria-label={title}
            className="mono inline-flex items-center rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-xs hover:border-[var(--color-accent-2)] disabled:opacity-30"
        >
            {label}
        </button>
    );
}

function DefaultCard({ id, label, onSelect }: { id: string | number; label: string; onSelect: () => void }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className="flex h-24 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left hover:border-[var(--color-accent-2)] hover:bg-[var(--color-surface-2)]"
        >
            <div className="mono text-[10px] text-[var(--color-text-faint)]">
                #{typeof id === "number" ? String(id).padStart(5, "0") : id}
            </div>
            <div className="truncate text-[13px] font-semibold">{label}</div>
        </button>
    );
}
