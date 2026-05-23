import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { HelpIcon, Tooltip } from "../../../components/Tooltip";
import type { FieldHelp } from "../data/help";
import type { FieldValue } from "../model";

type Props = {
    open: boolean;
    onClose: () => void;
    tag: string;
    field: FieldValue;
    help?: FieldHelp | null;
    onCommitLevel: (level: number, value: string) => void;
    onDeleteLevel: (level: number) => void;
    onCommitSublevel: (level: number, sublevel: number, value: string) => void;
    onDeleteSublevel: (level: number, sublevel: number) => void;
};

export function PerLevelModal({
    open,
    onClose,
    tag,
    field,
    help,
    onCommitLevel,
    onDeleteLevel,
    onCommitSublevel,
    onDeleteSublevel
}: Props) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open || field.kind === "single") return null;

    const base = field.kind === "perLevel" ? field.values : field.base;
    const overrides = field.kind === "perSublevel" ? field.overrides : new Map<number, Map<number, string>>();
    const baseRows = [...base.entries()].sort((a, b) => a[0] - b[0]);
    const nextLevel = baseRows.length > 0 ? Math.max(...baseRows.map(([l]) => l)) + 1 : 1;

    const overrideRows: { level: number; sublevel: number; value: string }[] = [];
    for (const [lvl, inner] of overrides) {
        for (const [sub, val] of inner) {
            overrideRows.push({ level: lvl, sublevel: sub, value: val });
        }
    }
    overrideRows.sort((a, b) => a.level - b.level || a.sublevel - b.sublevel);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
            <div
                className="flex h-full max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-black/30 px-4 py-2">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                        Per-level
                    </span>
                    <span className="mono inline-flex items-center text-[12px] text-[var(--color-accent)]">
                        {tag}
                        {help && (
                            <Tooltip content={<HelpContentInline description={help.description} />}>
                                <HelpIcon />
                            </Tooltip>
                        )}
                    </span>
                    <span className="ml-auto text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                        {baseRows.length} base
                        {overrideRows.length > 0 && ` + ${overrideRows.length} overrides`}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                        aria-label="Close"
                    >
                        <X size={15} aria-hidden />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                        Base levels
                    </div>
                    {baseRows.length === 0 && (
                        <div className="px-2 py-3 text-[12px] text-[var(--color-text-faint)]">
                            No base entries yet — add one below.
                        </div>
                    )}
                    <div className="grid grid-cols-[auto,1fr,auto] items-center gap-x-3 gap-y-1 text-[12px]">
                        {baseRows.map(([lvl, v]) => (
                            <BaseRow
                                key={`b:${lvl}:${v}`}
                                level={lvl}
                                value={v}
                                onCommit={(nv) => onCommitLevel(lvl, nv)}
                                onDelete={() => onDeleteLevel(lvl)}
                            />
                        ))}
                    </div>
                    <AddLevelForm defaultLevel={nextLevel} onAdd={(lvl, v) => onCommitLevel(lvl, v)} />

                    <div className="mt-6 mb-1 flex items-baseline gap-3 text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                        <span>Sublevel overrides</span>
                        {overrideRows.length === 0 && (
                            <span className="lowercase tracking-normal text-[var(--color-text-faint)]">
                                — none yet. Add one below to give an enchant route a different value.
                            </span>
                        )}
                    </div>
                    {overrideRows.length > 0 && (
                        <div className="grid grid-cols-[auto,auto,1fr,auto] items-center gap-x-3 gap-y-1 text-[12px]">
                            {overrideRows.map(({ level, sublevel, value }) => (
                                <SublevelRow
                                    key={`s:${level}:${sublevel}:${value}`}
                                    level={level}
                                    sublevel={sublevel}
                                    value={value}
                                    onCommit={(nv) => onCommitSublevel(level, sublevel, nv)}
                                    onDelete={() => onDeleteSublevel(level, sublevel)}
                                />
                            ))}
                        </div>
                    )}
                    <AddSublevelForm onAdd={(lvl, sub, v) => onCommitSublevel(lvl, sub, v)} />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-xs hover:border-[var(--color-accent-2)]"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

function BaseRow({
    level,
    value,
    onCommit,
    onDelete
}: {
    level: number;
    value: string;
    onCommit: (v: string) => void;
    onDelete: () => void;
}) {
    return (
        <>
            <span className="mono pl-1 text-[var(--color-text-faint)]">lv {String(level).padStart(3)}</span>
            <input
                className="mono rounded border border-[var(--color-border)]/50 bg-[var(--color-surface)]/40 px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)] focus:bg-[var(--color-surface)]"
                defaultValue={value}
                onBlur={(e) => {
                    if (e.target.value !== value) onCommit(e.target.value);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                }}
            />
            <button
                type="button"
                onClick={onDelete}
                className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                title={`Remove level ${level}`}
                aria-label={`Remove level ${level}`}
            >
                <X size={13} aria-hidden />
            </button>
        </>
    );
}

function SublevelRow({
    level,
    sublevel,
    value,
    onCommit,
    onDelete
}: {
    level: number;
    sublevel: number;
    value: string;
    onCommit: (v: string) => void;
    onDelete: () => void;
}) {
    const route = Math.floor(sublevel / 1000);
    const step = sublevel % 1000;
    return (
        <>
            <span className="mono pl-1 text-[var(--color-text-faint)]">lv {String(level).padStart(3)}</span>
            <span className="mono text-[10px] text-[var(--color-warning)]" title={`route ${route}, step ${step}`}>
                r{route}·{String(step).padStart(2, "0")}
            </span>
            <input
                className="mono rounded border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)] focus:bg-[var(--color-surface)]"
                defaultValue={value}
                onBlur={(e) => {
                    if (e.target.value !== value) onCommit(e.target.value);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                }}
            />
            <button
                type="button"
                onClick={onDelete}
                className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                title={`Remove override at lv ${level}, sublevel ${sublevel}`}
                aria-label={`Remove override at lv ${level}, sublevel ${sublevel}`}
            >
                <X size={13} aria-hidden />
            </button>
        </>
    );
}

function AddLevelForm({
    defaultLevel,
    onAdd
}: {
    defaultLevel: number;
    onAdd: (level: number, value: string) => void;
}) {
    const [lvl, setLvl] = useState<string>(String(defaultLevel));
    const [val, setVal] = useState<string>("");

    useEffect(() => {
        setLvl(String(defaultLevel));
    }, [defaultLevel]);

    const submit = () => {
        const n = Number.parseInt(lvl, 10);
        if (!Number.isFinite(n) || n <= 0) return;
        onAdd(n, val);
        setVal("");
        setLvl(String(n + 1));
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
            className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)]/40 pt-3"
        >
            <span className="mono text-[11px] text-[var(--color-text-faint)]">lv</span>
            <input
                value={lvl}
                onChange={(e) => setLvl(e.target.value)}
                className="mono w-14 rounded border border-dashed border-[var(--color-border)] bg-transparent px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                placeholder="N"
            />
            <input
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder="value"
                className="mono flex-1 rounded border border-dashed border-[var(--color-border)] bg-transparent px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
            />
            <button
                type="submit"
                className="rounded border border-dashed border-[var(--color-border)] bg-transparent px-3 py-1 text-xs text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-accent-2)]"
            >
                Add level
            </button>
        </form>
    );
}

function AddSublevelForm({ onAdd }: { onAdd: (level: number, sublevel: number, value: string) => void }) {
    const [lvl, setLvl] = useState<string>("");
    const [route, setRoute] = useState<string>("1");
    const [step, setStep] = useState<string>("1");
    const [val, setVal] = useState<string>("");

    const submit = () => {
        const lvlN = Number.parseInt(lvl, 10);
        const routeN = Number.parseInt(route, 10);
        const stepN = Number.parseInt(step, 10);
        if (!Number.isFinite(lvlN) || lvlN <= 0) return;
        if (!Number.isFinite(routeN) || routeN <= 0) return;
        if (!Number.isFinite(stepN) || stepN <= 0) return;
        const sublevel = routeN * 1000 + stepN;
        onAdd(lvlN, sublevel, val);
        setVal("");
        setStep(String(stepN + 1));
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
            className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)]/40 pt-3"
        >
            <span className="mono text-[11px] text-[var(--color-text-faint)]">lv</span>
            <input
                value={lvl}
                onChange={(e) => setLvl(e.target.value)}
                className="mono w-14 rounded border border-dashed border-[var(--color-border)] bg-transparent px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                placeholder="N"
            />
            <span className="mono text-[11px] text-[var(--color-warning)]">route</span>
            <input
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                className="mono w-12 rounded border border-dashed border-[var(--color-warning)]/40 bg-transparent px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                placeholder="1"
            />
            <span className="mono text-[11px] text-[var(--color-warning)]">step</span>
            <input
                value={step}
                onChange={(e) => setStep(e.target.value)}
                className="mono w-12 rounded border border-dashed border-[var(--color-warning)]/40 bg-transparent px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                placeholder="1"
            />
            <input
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder="value"
                className="mono flex-1 rounded border border-dashed border-[var(--color-border)] bg-transparent px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
            />
            <button
                type="submit"
                className="rounded border border-dashed border-[var(--color-warning)]/50 bg-transparent px-3 py-1 text-xs text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10"
                title="Add a route-specific override (sublevel = route × 1000 + step)"
            >
                Add override
            </button>
        </form>
    );
}

function HelpContentInline({ description }: { description: string }) {
    return <div className="normal-case tracking-normal">{description}</div>;
}
