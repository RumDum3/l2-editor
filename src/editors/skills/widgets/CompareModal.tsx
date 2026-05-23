import { ArrowLeftRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useEditor } from "../../../state/EditorContext";
import { compareSkills, type FieldDiff, type LevelDiff, type SkillDiff } from "../diff";
import type { Skill } from "../model";

type Props = {
    open: boolean;
    onClose: () => void;
    base: Skill;
};

export function CompareModal({ open, onClose, base }: Props) {
    const { loaded } = useEditor();
    const [other, setOther] = useState<Skill | null>(null);
    const [filter, setFilter] = useState("");
    const [hideEqual, setHideEqual] = useState(true);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
            <div
                className="flex h-full max-h-[88vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <Header
                    base={base}
                    other={other}
                    onBack={() => setOther(null)}
                    onClose={() => {
                        setOther(null);
                        setFilter("");
                        onClose();
                    }}
                    hideEqual={hideEqual}
                    setHideEqual={setHideEqual}
                />

                {!other ? (
                    <Picker loaded={loaded} base={base} filter={filter} setFilter={setFilter} onPick={setOther} />
                ) : (
                    <DiffView base={base} other={other} hideEqual={hideEqual} />
                )}
            </div>
        </div>
    );
}

function Header({
    base,
    other,
    onBack,
    onClose,
    hideEqual,
    setHideEqual
}: {
    base: Skill;
    other: Skill | null;
    onBack: () => void;
    onClose: () => void;
    hideEqual: boolean;
    setHideEqual: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-black/30 px-4 py-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">Compare</span>
            <span className="mono text-[11px] text-[var(--color-accent-2)]">#{String(base.id).padStart(5, "0")}</span>
            <span className="truncate text-[12px] text-[var(--color-accent)]">{base.name}</span>
            <ArrowLeftRight size={13} className="text-[var(--color-text-faint)]" aria-hidden />
            {other ? (
                <>
                    <span className="mono text-[11px] text-[var(--color-accent-2)]">
                        #{String(other.id).padStart(5, "0")}
                    </span>
                    <span className="truncate text-[12px] text-[var(--color-accent)]">{other.name}</span>
                    <button
                        type="button"
                        onClick={onBack}
                        className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] hover:border-[var(--color-accent-2)]"
                    >
                        Pick another…
                    </button>
                </>
            ) : (
                <span className="text-[12px] text-[var(--color-text-faint)]">pick a skill to compare with</span>
            )}

            {other && (
                <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-faint)]">
                    <input
                        type="checkbox"
                        checked={hideEqual}
                        onChange={(e) => setHideEqual(e.target.checked)}
                        className="accent-[var(--color-accent-2)]"
                    />
                    only differences
                </label>
            )}

            <button
                type="button"
                onClick={onClose}
                className="ml-auto text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                aria-label="Close"
            >
                <X size={15} aria-hidden />
            </button>
        </div>
    );
}

function Picker({
    loaded,
    base,
    filter,
    setFilter,
    onPick
}: {
    loaded: ReturnType<typeof useEditor>["loaded"];
    base: Skill;
    filter: string;
    setFilter: (s: string) => void;
    onPick: (s: Skill) => void;
}) {
    const visible = useMemo(() => {
        if (!loaded) return [];
        const q = filter.trim().toLowerCase();
        const out: { entity: unknown; id: string | number; label: string }[] = [];
        for (let i = 0; i < loaded.index.length; i++) {
            const e = loaded.index[i];
            const ent = loaded.files[e.fileIndex].entities[e.entityIndex];
            if (ent === base) continue;
            if (!q || String(e.summary.id).toLowerCase().includes(q) || e.summary.label.toLowerCase().includes(q)) {
                out.push({ entity: ent, id: e.summary.id, label: e.summary.label });
            }
            if (out.length >= 200) break;
        }
        return out;
    }, [loaded, filter, base]);

    return (
        <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
                <input
                    autoFocus
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search by id or name…"
                    className="mono w-96 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                {visible.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-faint)]">
                        No matches.
                    </div>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                        {visible.map((v) => (
                            <button
                                type="button"
                                key={`${v.id}:${v.label}`}
                                onClick={() => onPick(v.entity as Skill)}
                                className="flex flex-col items-start rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left hover:border-[var(--color-accent-2)] hover:bg-[var(--color-surface-2)]"
                            >
                                <span className="mono text-[10px] text-[var(--color-text-faint)]">
                                    #{typeof v.id === "number" ? String(v.id).padStart(5, "0") : v.id}
                                </span>
                                <span className="truncate text-[12px]">{v.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function DiffView({ base, other, hideEqual }: { base: Skill; other: Skill; hideEqual: boolean }) {
    const diff: SkillDiff = useMemo(() => compareSkills(base, other), [base, other]);
    const visibleAttrs = diff.attrs.filter((a) => !hideEqual || !a.same);
    const visibleFields = diff.fields.filter((f) => !hideEqual || f.kind !== "same");
    const visibleBlocks = diff.blocks.filter((b) => !hideEqual || b.kind !== "same");

    return (
        <div className="flex flex-1 flex-col overflow-hidden">
            <Summary diff={diff} />

            <div className="grid grid-cols-2 gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[11px] text-[var(--color-text-faint)]">
                <ColumnHeader label="Skill A" id={base.id} name={base.name} />
                <ColumnHeader label="Skill B" id={other.id} name={other.name} />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
                {visibleAttrs.length > 0 && (
                    <Section title="Attributes">
                        {visibleAttrs.map((a) => (
                            <SplitRow
                                key={a.name}
                                same={a.same}
                                left={<KV tag={a.name} value={a.a} accent={a.same ? undefined : "danger"} />}
                                right={<KV tag={a.name} value={a.b} accent={a.same ? undefined : "success"} />}
                            />
                        ))}
                    </Section>
                )}

                {visibleFields.length > 0 && (
                    <Section title="Fields">
                        {visibleFields.map((f) => (
                            <FieldSplitRow key={f.tag} d={f} />
                        ))}
                    </Section>
                )}

                {hideEqual && visibleAttrs.length === 0 && visibleFields.length === 0 && visibleBlocks.length === 0 && (
                    <Empty>All comparable rows match. Toggle "only differences" off to see them.</Empty>
                )}

                {visibleBlocks.length > 0 && (
                    <Section title="Blocks">
                        {visibleBlocks.map((b) => (
                            <SplitRow
                                key={b.tag}
                                same={b.kind === "same"}
                                left={b.kind === "onlyB" ? <Absent /> : <BlockBlock tag={b.tag} xml={b.xmlA ?? ""} />}
                                right={b.kind === "onlyA" ? <Absent /> : <BlockBlock tag={b.tag} xml={b.xmlB ?? ""} />}
                            />
                        ))}
                    </Section>
                )}
            </div>
        </div>
    );
}

function ColumnHeader({ label, id, name }: { label: string; id: number; name: string }) {
    return (
        <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em]">{label}</span>
            <span className="mono text-[var(--color-accent-2)]">#{String(id).padStart(5, "0")}</span>
            <span className="truncate text-[var(--color-accent)]" title={name}>
                {name}
            </span>
        </div>
    );
}

function SplitRow({ same, left, right }: { same: boolean; left: React.ReactNode; right: React.ReactNode }) {
    return (
        <div
            className={`grid grid-cols-2 items-start gap-4 border-b border-[var(--color-border)]/40 px-2 py-1 ${
                same ? "" : "bg-[var(--color-warning)]/5"
            }`}
        >
            <div className="min-w-0">{left}</div>
            <div className="min-w-0">{right}</div>
        </div>
    );
}

function KV({ tag, value, accent }: { tag: string; value: string; accent?: "danger" | "success" }) {
    const valueClass =
        accent === "danger"
            ? "text-[var(--color-danger)]"
            : accent === "success"
              ? "text-[var(--color-success)]"
              : "text-[var(--color-text)]";
    return (
        <div className="mono flex min-w-0 items-baseline gap-2 text-[12px]">
            <span className="shrink-0 text-[var(--color-text-faint)]">{tag}:</span>
            <span className={`min-w-0 truncate ${valueClass}`} title={value}>
                {value}
            </span>
        </div>
    );
}

function Absent() {
    return <span className="mono text-[12px] italic text-[var(--color-text-faint)]">— absent —</span>;
}

function BlockBlock({ tag, xml }: { tag: string; xml: string }) {
    return (
        <div className="min-w-0">
            <div className="mono mb-0.5 text-[11px] text-[var(--color-text-faint)]">{tag}</div>
            <pre className="mono max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[var(--color-border)]/30 bg-[var(--color-surface)] px-2 py-1 text-[10px] text-[var(--color-text)]">
                {xml}
            </pre>
        </div>
    );
}

function FieldSplitRow({ d }: { d: FieldDiff }) {
    if (d.kind === "onlyA") {
        return (
            <SplitRow
                same={false}
                left={<KV tag={d.tag} value={renderValue(d.a!)} accent="danger" />}
                right={<Absent />}
            />
        );
    }
    if (d.kind === "onlyB") {
        return (
            <SplitRow
                same={false}
                left={<Absent />}
                right={<KV tag={d.tag} value={renderValue(d.b!)} accent="success" />}
            />
        );
    }
    if (d.levelDiffs && d.levelDiffs.length > 0) {
        return <PerLevelSplit tag={d.tag} levels={d.levelDiffs} />;
    }
    const same = d.kind === "same";
    const aText = d.a ? renderValue(d.a) : "";
    const bText = d.b ? renderValue(d.b) : "";
    return (
        <SplitRow
            same={same}
            left={<KV tag={d.tag} value={aText} accent={same ? undefined : "danger"} />}
            right={<KV tag={d.tag} value={bText} accent={same ? undefined : "success"} />}
        />
    );
}

function PerLevelSplit({ tag, levels }: { tag: string; levels: LevelDiff[] }) {
    const renderSide = (side: "a" | "b") => (
        <div className="min-w-0">
            <div className="mono mb-0.5 text-[11px] text-[var(--color-text-faint)]">{tag}</div>
            <div className="grid grid-cols-[auto,1fr] gap-x-2 text-[11px]">
                {levels.map((l) => {
                    const same = l.a === l.b;
                    const value = side === "a" ? l.a : l.b;
                    const valueClass = same
                        ? "text-[var(--color-text-faint)]"
                        : side === "a"
                          ? "text-[var(--color-danger)]"
                          : "text-[var(--color-success)]";
                    return (
                        <div key={`${side}-${l.level}`} className="contents">
                            <span className="mono text-[var(--color-text-faint)]">
                                lv {String(l.level).padStart(3)}
                            </span>
                            <span className={`mono truncate ${valueClass}`} title={value ?? ""}>
                                {value ?? "—"}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
    return <SplitRow same={false} left={renderSide("a")} right={renderSide("b")} />;
}

function Summary({ diff }: { diff: SkillDiff }) {
    const same = diff.totalCount - diff.differingCount;
    return (
        <div className="flex items-center gap-3 border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-4 py-1.5 text-[11px] text-[var(--color-text-faint)]">
            <span>
                <span className="text-[var(--color-accent)]">{diff.differingCount}</span> differ
            </span>
            <span>
                <span className="text-[var(--color-success)]">{same}</span> match
            </span>
            <span>· {diff.totalCount} comparable rows</span>
        </div>
    );
}

function renderValue(v: import("../model").FieldValue): string {
    if (v.kind === "single") return v.value;
    if (v.kind === "perLevel") return `<${v.values.size} levels>`;
    const overrideCount = [...v.overrides.values()].reduce((n, m) => n + m.size, 0);
    return `<${v.base.size} levels + ${overrideCount} sublevel overrides>`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mb-4">
            <div className="mb-1 border-b border-[var(--color-border)]/60 pb-1 text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                {title}
            </div>
            <div>{children}</div>
        </div>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return <div className="px-2 py-2 text-[11px] text-[var(--color-text-faint)]">{children}</div>;
}
