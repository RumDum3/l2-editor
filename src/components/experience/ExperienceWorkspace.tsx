import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EXPERIENCE_FILE, EXPERIENCE_LOSS_FILE, joinPath, KARMA_LOSS_FILE, statsPlayersDir } from "../../lib/dataPaths";
import { ipc } from "../../lib/ipc";
import { logger } from "../../lib/logger";
import { toggleStringSetMember, useStringSetMember } from "../../lib/uiPrefs";
import { useFileUndo, useUndoHotkeys } from "../../lib/useFileUndo";
import { parseXml, serializeXml } from "../../lib/xml";
import { useSettings } from "../../state/SettingsContext";
import { useSetToolbarSlot } from "../../state/ToolbarSlot";
import { EditActions } from "../EditActions";
import { HelpIcon, Tooltip } from "../Tooltip";

function reparseExpFile(old: LoadedExpFile, xml: string): LoadedExpFile {
    try {
        const { doc } = parseXml(xml);
        const root = doc.documentElement;
        if (!root) return old;
        return { key: old.key, path: old.path, doc, root, rows: Array.from(root.children) };
    } catch {
        return old;
    }
}

const EXPANDED_TABLES_KEY = "experience.expandedTables";

type ExpFileMeta = {
    key: string;
    label: string;
    rel: string;
    blurb: string;
    attrHelp: Record<string, string>;
};

const EXP_FILES: ExpFileMeta[] = [
    {
        key: "experience",
        label: "Experience curve",
        rel: EXPERIENCE_FILE,
        blurb: "Cumulative XP needed to *reach* each level (`tolevel`) plus the Mentee training-rate factor. The root attributes cap the character / pet level.",
        attrHelp: {
            maxLevel: "Highest level a character can reach. Levels above this in the table are ignored.",
            maxPetLevel: "Highest level a pet/summon can reach.",
            level: "Character level this row defines.",
            tolevel:
                "Total accumulated XP a character must have to *be* at this level (i.e. the XP threshold for reaching it). Level 1 is 0; each row is the running total.",
            trainingRate:
                "Per-level factor for offline/Mentee 'training' XP gain (0 = none). Higher = faster catch-up XP at that level."
        }
    },
    {
        key: "experienceLoss",
        label: "Death XP loss",
        rel: EXPERIENCE_LOSS_FILE,
        blurb: "Percentage of the current level's XP lost when a character dies at that level — the PvE death penalty curve (typically large at low levels, ~0.5% at end-game).",
        attrHelp: {
            level: "Character level this row applies to.",
            val: "Percent of this level's XP that's lost on death at this level (e.g. 10.0 = 10%)."
        }
    },
    {
        key: "karmaLoss",
        label: "Karma decay",
        rel: KARMA_LOSS_FILE,
        blurb: "Per-level modifier in the karma-decay formula — how quickly a PK (red) character's karma works back down to 0 over time / kills.",
        attrHelp: {
            level: "Character level this row applies to.",
            val: "Karma-decay modifier at this level (used by the karma reduction formula; higher = faster decay)."
        }
    }
];

type LoadedExpFile = {
    key: string;
    path: string;
    doc: XMLDocument;
    root: Element;
    rows: Element[];
};

const REAL_ATTR = (a: Attr) => !a.name.startsWith("xmlns") && !a.name.startsWith("xsi:");

export function ExperienceWorkspace({ active }: { active: boolean }) {
    const { config } = useSettings();
    const dataRoot = config?.dataRoot ?? null;

    const [activated, setActivated] = useState(active);
    useEffect(() => {
        if (active && !activated) setActivated(true);
    }, [active, activated]);

    const [files, setFiles] = useState<LoadedExpFile[] | null>(null);
    const [loadErr, setLoadErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState<ReadonlySet<string>>(() => new Set());
    const [rev, setRev] = useState(0);
    const [selKey, setSelKey] = useState<string | null>(EXP_FILES[0]?.key ?? null);

    const load = useCallback(
        (_force: boolean) => {
            if (!dataRoot) {
                setFiles(null);
                return;
            }
            setLoading(true);
            setLoadErr(null);
            const playersDir = statsPlayersDir(dataRoot);
            Promise.all(
                EXP_FILES.map(async (meta): Promise<LoadedExpFile | null> => {
                    const path = joinPath(playersDir, meta.rel);
                    try {
                        const { doc } = parseXml(await ipc.readXml(path));
                        const root = doc.documentElement;
                        if (!root) return null;
                        const rows = Array.from(root.children);
                        return { key: meta.key, path, doc, root, rows };
                    } catch {
                        return null;
                    }
                })
            )
                .then((results) => {
                    const ok = results.filter((r): r is LoadedExpFile => r != null);
                    setFiles(ok);
                    setDirty(new Set());
                    setLoadErr(
                        ok.length === 0 ? "Couldn't read any of the experience XML files under stats/players/." : null
                    );
                    if (!selKey || !ok.some((f) => f.key === selKey)) setSelKey(ok[0]?.key ?? null);
                })
                .catch((e) => {
                    setFiles(null);
                    setLoadErr(e instanceof Error ? e.message : String(e));
                })
                .finally(() => setLoading(false));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [dataRoot]
    );

    useEffect(() => {
        if (activated) load(false);
    }, [activated, load]);

    const undoHist = useFileUndo({
        serialize: (path) => {
            const f = files?.find((x) => x.path === path);
            return f ? serializeXml(f.doc) : null;
        },
        restore: (path, xml) => {
            setFiles((prev) => (prev ? prev.map((f) => (f.path === path ? reparseExpFile(f, xml) : f)) : prev));
        }
    });
    useUndoHotkeys(active, undoHist.undo, undoHist.redo);

    const mutate = useCallback(
        (key: string, fn: () => void) => {
            const f = files?.find((x) => x.key === key);
            if (f) undoHist.snapshot(f.path);
            fn();
            setDirty((prev) => {
                if (prev.has(key)) return prev;
                const next = new Set(prev);
                next.add(key);
                return next;
            });
            setRev((r) => r + 1);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [files]
    );

    const save = useCallback(async () => {
        if (!files || dirty.size === 0 || saving) return;
        setSaving(true);
        const failed: string[] = [];
        for (const key of dirty) {
            const f = files.find((x) => x.key === key);
            if (!f) continue;
            try {
                await ipc.writeXml(f.path, serializeXml(f.doc));
            } catch (e) {
                failed.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        if (failed.length === 0) {
            setDirty(new Set());
            logger.info("experience", `saved ${dirty.size} file(s)`);
        } else {
            setDirty(new Set([...dirty].filter((k) => failed.some((f) => f.startsWith(`${k}:`)))));
            for (const f of failed) logger.error("experience", `save failed — ${f}`);
        }
        setSaving(false);
    }, [files, dirty, saving]);

    const sel = selKey && files ? (files.find((f) => f.key === selKey) ?? null) : null;
    const selMeta = selKey ? (EXP_FILES.find((e) => e.key === selKey) ?? null) : null;
    void rev;

    const setToolbarSlot = useSetToolbarSlot();
    useEffect(() => {
        if (!active) return;
        setToolbarSlot(
            <EditActions
                onUndo={undoHist.undo}
                onRedo={undoHist.redo}
                canUndo={undoHist.canUndo}
                canRedo={undoHist.canRedo}
                dirtyCount={dirty.size}
                dirtyTitle={dirty.size > 0 ? `Unsaved: ${[...dirty].join(", ")}` : undefined}
                saving={saving}
                saveDisabled={dirty.size === 0 || saving}
                saveTitle="Write every changed file"
                onSave={save}
                onReload={() => {
                    undoHist.reset();
                    load(true);
                }}
                reloadDisabled={loading}
            />
        );
        return () => setToolbarSlot(null);
    }, [active, setToolbarSlot, undoHist, dirty, saving, loading, save, load]);

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
                <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                    experience
                </span>
                {!files && loading && (
                    <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-faint)]">
                        <span
                            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-text-faint)] border-t-[var(--color-accent-2)]"
                            aria-hidden
                        />
                        loading…
                    </span>
                )}
            </div>

            {!dataRoot ? (
                <Placeholder>Set the L2J data folder in Settings to edit the experience tables.</Placeholder>
            ) : loadErr && !files ? (
                <Placeholder tone="danger">
                    <AlertTriangle size={13} className="inline align-[-2px]" aria-hidden /> {loadErr}
                </Placeholder>
            ) : !files ? (
                <Placeholder>{loading ? "Loading…" : "No data."}</Placeholder>
            ) : (
                <div className="flex min-h-0 flex-1">
                    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
                        <div className="border-b border-[var(--color-border)]/60 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                            tables
                        </div>
                        <div className="flex-1 overflow-y-auto py-1 text-[12px]">
                            {EXP_FILES.map((meta) => {
                                const f = files.find((x) => x.key === meta.key);
                                const ok = !!f;
                                const activeRow = selKey === meta.key;
                                return (
                                    <button
                                        type="button"
                                        key={meta.key}
                                        disabled={!ok}
                                        onClick={() => setSelKey(meta.key)}
                                        className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-2)] disabled:opacity-40 ${
                                            activeRow ? "bg-[var(--color-surface-2)] text-[var(--color-accent)]" : ""
                                        }`}
                                        title={
                                            ok ? `stats/players/${meta.rel}` : `stats/players/${meta.rel} — not found`
                                        }
                                    >
                                        <span className="truncate">{meta.label}</span>
                                        <span className="ml-auto shrink-0 text-[10px] text-[var(--color-text-faint)]">
                                            {ok ? `${f.rows.length} rows` : "—"}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>
                    <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--color-bg)] p-4">
                        {sel && selMeta ? (
                            <TableEditor key={`${sel.key}:${undoHist.rev}`} file={sel} meta={selMeta} mutate={mutate} />
                        ) : (
                            <Placeholder>Pick a table on the left.</Placeholder>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function TableEditor({
    file,
    meta,
    mutate
}: {
    file: LoadedExpFile;
    meta: ExpFileMeta;
    mutate: (key: string, fn: () => void) => void;
}) {
    const showRows = useStringSetMember(EXPANDED_TABLES_KEY, meta.key);
    const m = (fn: () => void) => mutate(meta.key, fn);
    const rootAttrs = Array.from(file.root.attributes).filter(REAL_ATTR);

    const cols: string[] = [];
    for (const r of file.rows) for (const a of Array.from(r.attributes)) if (!cols.includes(a.name)) cols.push(a.name);
    const keyCol = cols.includes("level") ? "level" : cols[0];
    const otherCols = cols.filter((c) => c !== keyCol);

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <div className="text-[11px] leading-relaxed text-[var(--color-text-faint)]">
                <span className="mono text-[var(--color-text)]">stats/players/{meta.rel}</span> — {meta.blurb}
            </div>

            {rootAttrs.length > 0 && (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                        root
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {rootAttrs.map((a) => (
                            <label key={a.name} className="flex items-center gap-2 text-[11px]">
                                <AttrLabel name={a.name} help={meta.attrHelp[a.name]} />
                                <input
                                    className="mono w-28 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent-2)]"
                                    defaultValue={a.value}
                                    onBlur={(e) => {
                                        if (e.target.value !== a.value)
                                            m(() => file.root.setAttribute(a.name, e.target.value));
                                    }}
                                />
                            </label>
                        ))}
                    </div>
                </div>
            )}

            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
                <button
                    type="button"
                    onClick={() => toggleStringSetMember(EXPANDED_TABLES_KEY, meta.key)}
                    className="flex w-full items-center gap-1.5 border-b border-[var(--color-border)]/60 px-3 py-1.5 text-left text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                >
                    {showRows ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
                    {file.rows.length} rows
                </button>
                {showRows && (
                    <div className="max-h-[520px] overflow-auto">
                        <table className="w-full border-collapse text-[11px]">
                            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
                                <tr>
                                    <th className="px-2 py-1 text-left">
                                        <AttrLabel name={keyCol} help={meta.attrHelp[keyCol]} className="text-[9px]" />
                                    </th>
                                    {otherCols.map((c) => (
                                        <th key={c} className="px-2 py-1 text-left">
                                            <AttrLabel name={c} help={meta.attrHelp[c]} className="text-[9px]" />
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {file.rows.map((row, i) => {
                                    const keyVal = row.getAttribute(keyCol) ?? String(i + 1);
                                    return (
                                        <tr key={`${keyVal}-${i}`} className="border-t border-[var(--color-border)]/30">
                                            <td className="mono px-2 py-0.5 text-[var(--color-accent-2)]">
                                                <input
                                                    className="mono w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-[var(--color-accent-2)] outline-none hover:border-[var(--color-border)] focus:border-[var(--color-accent-2)] focus:bg-[var(--color-surface)]"
                                                    defaultValue={keyVal}
                                                    onBlur={(e) => {
                                                        if (e.target.value !== keyVal)
                                                            m(() => row.setAttribute(keyCol, e.target.value));
                                                    }}
                                                />
                                            </td>
                                            {otherCols.map((col) => {
                                                const v = row.getAttribute(col) ?? "";
                                                return (
                                                    <td key={col} className="px-1 py-0.5">
                                                        <input
                                                            className="mono w-44 max-w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] outline-none hover:border-[var(--color-border)] focus:border-[var(--color-accent-2)] focus:bg-[var(--color-surface)]"
                                                            defaultValue={v}
                                                            onBlur={(e) => {
                                                                if (e.target.value !== v)
                                                                    m(() => row.setAttribute(col, e.target.value));
                                                            }}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function AttrLabel({ name, help, className }: { name: string; help?: string; className?: string }) {
    return (
        <span
            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-faint)] ${className ?? ""}`}
        >
            <span>{name}</span>
            {help && (
                <Tooltip content={<span className="text-[11px] normal-case tracking-normal">{help}</span>}>
                    <HelpIcon />
                </Tooltip>
            )}
        </span>
    );
}

function Placeholder({ children, tone }: { children: React.ReactNode; tone?: "danger" }) {
    return (
        <div
            className={`flex flex-1 items-center justify-center p-8 text-[12px] ${
                tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-text-faint)]"
            }`}
        >
            {children}
        </div>
    );
}
