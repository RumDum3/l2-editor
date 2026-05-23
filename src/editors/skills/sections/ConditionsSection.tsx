import { X } from "lucide-react";
import { useState } from "react";
import { Combobox } from "../../../components/Combobox";
import { useSettings } from "../../../state/SettingsContext";
import { ItemCard } from "./EffectsSection";
import { Empty, FieldGroupHeader, RawBlock, Section, scopeLabel } from "../widgets/fieldPrimitives";
import { CONDITION_HANDLERS } from "../data/handlers";
import {
    addCondCheck,
    addCondHandler,
    addConditionGroup,
    type CondLeaf,
    type ConditionGroup,
    CONDITION_SCOPES,
    removeCondLeaf,
    removeConditionGroup,
    renameCondCheck,
    setCondCheckAttr,
    setConditionMsgId,
    setConditionOp,
    type Skill
} from "../model";
import { isZoneAttr, useZones, type ZoneCatalog } from "../data/zoneNames";
import { ZoneIdField } from "../widgets/ZonePicker";

const COND_OP_LABEL: Record<"and" | "or" | "not", string> = {
    and: "match all (AND)",
    or: "match any (OR)",
    not: "match none (NOT)"
};

export function ConditionsSection({ skill, mutate }: { skill: Skill; mutate: (fn: () => void) => void }) {
    const primaryScope = CONDITION_SCOPES[0];
    const { config } = useSettings();
    const zones = useZones(config?.dataRoot);
    return (
        <Section title="Conditions">
            {skill.conditionGroups.length === 0 && (
                <Empty>
                    No conditions —{" "}
                    <button
                        type="button"
                        onClick={() => mutate(() => addConditionGroup(skill, "conditions"))}
                        className="underline hover:text-[var(--color-accent-2)]"
                    >
                        add a condition block
                    </button>
                    .
                </Empty>
            )}
            {skill.conditionGroups.map((g, gi) => (
                <div key={`${g.scope}:${gi}`}>
                    {g.scope !== primaryScope && <FieldGroupHeader>{scopeLabel(g.scope)}</FieldGroupHeader>}
                    <ConditionGroupView skill={skill} mutate={mutate} group={g} zones={zones} />
                </div>
            ))}
            <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-1.5">
                {CONDITION_SCOPES.map((sc) => (
                    <button
                        key={sc}
                        type="button"
                        onClick={() => mutate(() => addConditionGroup(skill, sc))}
                        className="rounded border border-dashed border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-text)]"
                    >
                        + {sc} block
                    </button>
                ))}
            </div>
        </Section>
    );
}

function ConditionGroupView({
    skill,
    mutate,
    group,
    zones
}: {
    skill: Skill;
    mutate: (fn: () => void) => void;
    group: ConditionGroup;
    zones: ZoneCatalog | null;
}) {
    const [adding, setAdding] = useState<null | "handler" | "check">(null);
    return (
        <div className="space-y-1.5 border-l-2 border-[var(--color-border)]/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <select
                    value={group.op}
                    onChange={(e) => mutate(() => setConditionOp(group, e.target.value as "and" | "or" | "not"))}
                    className="mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent-2)]"
                    title="How the conditions below combine"
                >
                    {(["and", "or", "not"] as const).map((op) => (
                        <option key={op} value={op}>
                            {COND_OP_LABEL[op]}
                        </option>
                    ))}
                </select>
                <span className="text-[var(--color-text-faint)]">·</span>
                <label className="flex items-center gap-1 text-[var(--color-text-faint)]">
                    msgId
                    <input
                        className="mono w-16 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent-2)]"
                        defaultValue={group.msgId}
                        placeholder="—"
                        onBlur={(e) => {
                            if (e.target.value !== group.msgId) mutate(() => setConditionMsgId(group, e.target.value));
                        }}
                    />
                </label>
                <button
                    type="button"
                    onClick={() => mutate(() => removeConditionGroup(skill, group))}
                    title="Remove this whole block"
                    className="ml-auto inline-flex items-center gap-1 text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                >
                    <X size={12} aria-hidden /> block
                </button>
            </div>
            {group.leaves.length === 0 && (
                <div className="text-[11px] text-[var(--color-text-faint)]">No conditions in this block yet.</div>
            )}
            {group.leaves.map((leaf, i) => {
                const onRemove = () => mutate(() => removeCondLeaf(skill, group, i));
                if (leaf.kind === "handler") {
                    return (
                        <ItemCard key={`h${i}`} mutate={mutate} item={leaf.item} onRemove={onRemove} zones={zones} />
                    );
                }
                if (leaf.kind === "check") {
                    return <CheckLeaf key={`c${i}`} mutate={mutate} leaf={leaf} onRemove={onRemove} zones={zones} />;
                }
                return (
                    <div key={`r${i}`}>
                        <div className="mb-1 flex items-center gap-2">
                            <span className="mono text-[10px] text-[var(--color-text-faint)]">
                                {leaf.tag} (no editor)
                            </span>
                            <button
                                type="button"
                                onClick={onRemove}
                                className="text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                            >
                                remove
                            </button>
                        </div>
                        <RawBlock tag={leaf.tag} el={leaf.el} />
                    </div>
                );
            })}
            {adding === "handler" ? (
                <AddHandlerForm
                    handlers={CONDITION_HANDLERS}
                    onAdd={(h) => {
                        mutate(() => addCondHandler(group, h));
                        setAdding(null);
                    }}
                    onCancel={() => setAdding(null)}
                />
            ) : adding === "check" ? (
                <AddCheckForm
                    onAdd={(tag) => {
                        mutate(() => addCondCheck(group, tag));
                        setAdding(null);
                    }}
                    onCancel={() => setAdding(null)}
                />
            ) : (
                <div className="flex gap-1.5 pt-0.5">
                    <button
                        type="button"
                        onClick={() => setAdding("handler")}
                        className="text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                    >
                        + condition handler
                    </button>
                    <span className="text-[10px] text-[var(--color-text-faint)]/50">·</span>
                    <button
                        type="button"
                        onClick={() => setAdding("check")}
                        className="text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                    >
                        + builtin check
                    </button>
                </div>
            )}
        </div>
    );
}

function CheckLeaf({
    mutate,
    leaf,
    onRemove,
    zones
}: {
    mutate: (fn: () => void) => void;
    leaf: Extract<CondLeaf, { kind: "check" }>;
    onRemove: () => void;
    zones: ZoneCatalog | null;
}) {
    const [adding, setAdding] = useState(false);
    return (
        <div className="rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)] p-2">
            <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">check</span>
                <input
                    className="mono w-40 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                    defaultValue={leaf.tag}
                    onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== leaf.tag)
                            mutate(() => renameCondCheck(leaf, e.target.value));
                    }}
                />
                <button
                    type="button"
                    onClick={onRemove}
                    title="Remove this check"
                    aria-label="Remove this check"
                    className="ml-auto text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                >
                    <X size={13} aria-hidden />
                </button>
            </div>
            <div className="space-y-1">
                {leaf.attrs.length === 0 && (
                    <div className="text-[11px] text-[var(--color-text-faint)]">No attributes.</div>
                )}
                {leaf.attrs.map((a) => (
                    <div key={a.name} className="flex items-center gap-2">
                        <span className="mono w-44 shrink-0 truncate text-[11px] text-[var(--color-text-faint)]">
                            {a.name}
                        </span>
                        {isZoneAttr(a.name) ? (
                            <ZoneIdField
                                value={a.value}
                                catalog={zones}
                                onCommit={(v) => mutate(() => setCondCheckAttr(leaf, a.name, v))}
                            />
                        ) : (
                            <input
                                className="mono flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                                defaultValue={a.value}
                                onBlur={(e) => {
                                    if (e.target.value !== a.value)
                                        mutate(() => setCondCheckAttr(leaf, a.name, e.target.value));
                                }}
                            />
                        )}
                        <button
                            type="button"
                            onClick={() => mutate(() => setCondCheckAttr(leaf, a.name, ""))}
                            title={`Remove ${a.name}`}
                            aria-label={`Remove ${a.name}`}
                            className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                        >
                            <X size={13} aria-hidden />
                        </button>
                    </div>
                ))}
                {adding ? (
                    <AddCheckAttrForm
                        present={new Set(leaf.attrs.map((a) => a.name))}
                        onAdd={(n, v) => {
                            mutate(() => setCondCheckAttr(leaf, n, v));
                            setAdding(false);
                        }}
                        onCancel={() => setAdding(false)}
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                    >
                        + attribute
                    </button>
                )}
            </div>
        </div>
    );
}

function AddHandlerForm({
    handlers,
    onAdd,
    onCancel
}: {
    handlers: readonly string[];
    onAdd: (handler: string) => void;
    onCancel: () => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1">
                <Combobox
                    value=""
                    choices={handlers}
                    placeholder="condition handler — type & press Enter"
                    onCommit={(v) => {
                        if (v.trim()) onAdd(v.trim());
                    }}
                />
            </div>
            <button
                type="button"
                onClick={onCancel}
                className="text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
            >
                cancel
            </button>
        </div>
    );
}

function AddCheckForm({ onAdd, onCancel }: { onAdd: (tag: string) => void; onCancel: () => void }) {
    const [tag, setTag] = useState("");
    return (
        <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
                e.preventDefault();
                const t = tag.trim();
                if (t) onAdd(t);
            }}
        >
            <input
                // biome-ignore lint/a11y/noAutofocus: shown on demand right where the user clicked
                autoFocus
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="builtin tag (e.g. player, target, using)"
                className="mono flex-1 rounded border border-dashed border-[var(--color-border)] bg-transparent px-2 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
            />
            <button
                type="submit"
                disabled={!tag.trim()}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] hover:border-[var(--color-accent-2)] disabled:opacity-40"
            >
                Add
            </button>
            <button
                type="button"
                onClick={onCancel}
                className="text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
            >
                cancel
            </button>
        </form>
    );
}

function AddCheckAttrForm({
    present,
    onAdd,
    onCancel
}: {
    present: ReadonlySet<string>;
    onAdd: (name: string, value: string) => void;
    onCancel: () => void;
}) {
    const [name, setName] = useState("");
    const [value, setValue] = useState("");
    const dup = present.has(name.trim());
    return (
        <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
                e.preventDefault();
                const n = name.trim();
                if (n && !dup) onAdd(n, value);
            }}
        >
            <input
                // biome-ignore lint/a11y/noAutofocus: shown on demand right where the user clicked
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="attr"
                className="mono w-32 rounded border border-dashed border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
            />
            <span className="text-[var(--color-text-faint)]">=</span>
            <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="value"
                className="mono flex-1 rounded border border-dashed border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
            />
            <button
                type="submit"
                disabled={!name.trim() || dup}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] hover:border-[var(--color-accent-2)] disabled:opacity-40"
            >
                Add
            </button>
            <button
                type="button"
                onClick={onCancel}
                aria-label="Cancel"
                className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
            >
                <X size={13} aria-hidden />
            </button>
        </form>
    );
}
