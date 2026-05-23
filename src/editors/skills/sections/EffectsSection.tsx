import { ArrowRight, ChevronDown, ChevronRight, X } from "lucide-react";
import { useId, useState } from "react";
import { useSettings } from "../../../state/SettingsContext";
import { handlerDesc } from "../data/handlerDescriptions";
import { EFFECT_HANDLERS, humanizeHandler } from "../data/handlers";
import { type ParamSpec, handlerSchema, paramEnumChoices } from "../data/handlerSchemas";
import { Empty, FieldGroupHeader, PerLevelSummary, RawBlock, Section, scopeLabel } from "../widgets/fieldPrimitives";
import {
    addEffectItem,
    deleteItemPerLevelParam,
    deleteItemSublevelParam,
    EFFECT_SCOPES,
    promoteItemParamToPerLevel,
    removeItemParam,
    removeSkillItem,
    setItemList,
    setItemPerLevelParam,
    setItemSingleParam,
    setItemSublevelParam,
    type Skill,
    type SkillItem
} from "../model";
import { isZoneAttr, useZones, type ZoneCatalog } from "../data/zoneNames";
import { ZoneIdField } from "../widgets/ZonePicker";

export function EffectsSection({ skill, mutate }: { skill: Skill; mutate: (fn: () => void) => void }) {
    const [addOpen, setAddOpen] = useState(false);
    const primaryScope = EFFECT_SCOPES[0];
    const { config } = useSettings();
    const zones = useZones(config?.dataRoot);
    return (
        <Section title="Effects">
            {skill.effectGroups.length === 0 && <Empty>No effects yet — use “Add effect” below.</Empty>}
            {skill.effectGroups.map((g) => (
                <div key={g.scope}>
                    {g.scope !== primaryScope && <FieldGroupHeader>{scopeLabel(g.scope)}</FieldGroupHeader>}
                    <div className="space-y-1.5 px-3 pb-2 pt-1.5">
                        {g.items.map((item, idx) => (
                            <ItemCard
                                key={`${g.scope}:${idx}`}
                                mutate={mutate}
                                item={item}
                                zones={zones}
                                onRemove={() => mutate(() => removeSkillItem(skill, g, item))}
                            />
                        ))}
                    </div>
                </div>
            ))}
            <div className="px-3 pb-2 pt-1.5">
                <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="rounded border border-dashed border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-text)]"
                >
                    + Add effect…
                </button>
            </div>
            <AddItemModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                kind="effect"
                scopes={EFFECT_SCOPES}
                handlers={EFFECT_HANDLERS}
                onAdd={(scope, handler) => {
                    // biome-ignore lint/suspicious/noExplicitAny: scope is one of the known wrapper names
                    mutate(() => addEffectItem(skill, scope as any, handler));
                    setAddOpen(false);
                }}
            />
        </Section>
    );
}

export function ItemCard({
    mutate,
    item,
    onRemove,
    zones
}: {
    mutate: (fn: () => void) => void;
    item: SkillItem;
    onRemove: () => void;
    zones?: ZoneCatalog | null;
}) {
    const [open, setOpen] = useState(false);
    const [adding, setAdding] = useState(false);
    const paramCount = item.params.length + item.lists.length + item.blocks.length;
    const schema = handlerSchema(item.kind, item.handler);
    const desc = schema?.desc ?? handlerDesc(item.kind, item.handler) ?? undefined;
    const specFor = (tag: string): ParamSpec | undefined => schema?.params.find((s) => s.name === tag);
    const choicesFor = (spec: ParamSpec | undefined): readonly string[] | undefined =>
        spec?.type === "enum"
            ? (paramEnumChoices(spec.enumKey ?? spec.name) ?? undefined)
            : spec?.type === "bool"
              ? ["true", "false"]
              : undefined;
    const present = (name: string) =>
        item.params.some((p) => p.tag === name) ||
        item.lists.some((l) => l.tag === name) ||
        item.blocks.some((b) => b.tag === name);
    const missingSpecs = schema?.params.filter((s) => !present(s.name)) ?? [];
    return (
        <div className="rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)]">
            <div className="flex items-center gap-2 px-2 py-1">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                    aria-label={open ? "Collapse" : "Expand"}
                >
                    {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
                </button>
                <span className="text-[12px] font-medium text-[var(--color-text)]" title={desc}>
                    {humanizeHandler(item.handler) || "(unnamed)"}
                </span>
                <span className="mono text-[10px] text-[var(--color-text-faint)]">{item.handler}</span>
                <span className="ml-auto text-[10px] text-[var(--color-text-faint)]">
                    {paramCount} param{paramCount === 1 ? "" : "s"}
                </span>
                <button
                    type="button"
                    onClick={onRemove}
                    title={`Remove this ${item.kind}`}
                    aria-label={`Remove this ${item.kind}`}
                    className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                >
                    <X size={13} aria-hidden />
                </button>
            </div>
            {open && (
                <div className="space-y-1.5 border-t border-[var(--color-border)]/40 px-3 py-2">
                    {desc && <div className="text-[10px] leading-snug text-[var(--color-text-faint)]">{desc}</div>}
                    {paramCount === 0 && <div className="text-[11px] text-[var(--color-text-faint)]">No params.</div>}
                    {item.params.map((p) => {
                        if (p.value.kind !== "single") {
                            return (
                                <div key={p.tag} className="flex items-start gap-1.5">
                                    <div className="min-w-0 flex-1">
                                        <PerLevelSummary
                                            tag={p.tag}
                                            value={p.value}
                                            onCommitLevel={(lvl, v) =>
                                                mutate(() => setItemPerLevelParam(item, p.tag, lvl, v))
                                            }
                                            onDeleteLevel={(lvl) =>
                                                mutate(() => deleteItemPerLevelParam(item, p.tag, lvl))
                                            }
                                            onCommitSublevel={(lvl, sub, v) =>
                                                mutate(() => setItemSublevelParam(item, p.tag, lvl, sub, v))
                                            }
                                            onDeleteSublevel={(lvl, sub) =>
                                                mutate(() => deleteItemSublevelParam(item, p.tag, lvl, sub))
                                            }
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => mutate(() => removeItemParam(item, p.tag))}
                                        title={`Remove ${p.tag}`}
                                        aria-label={`Remove ${p.tag}`}
                                        className="mt-1.5 text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                                    >
                                        <X size={13} aria-hidden />
                                    </button>
                                </div>
                            );
                        }
                        const spec = specFor(p.tag);
                        const isBool = spec?.type === "bool";
                        const isZone = isZoneAttr(p.tag);
                        const choices = isBool || isZone ? undefined : choicesFor(spec);
                        return (
                            <ItemParamRow
                                key={p.tag}
                                tag={p.tag}
                                value={p.value.value}
                                bool={isBool}
                                choices={choices}
                                desc={spec?.desc}
                                zoneCatalog={isZone ? (zones ?? null) : undefined}
                                onCommit={(v) => mutate(() => setItemSingleParam(item, p.tag, v))}
                                onRemove={() => mutate(() => removeItemParam(item, p.tag))}
                                onPromote={
                                    isBool || isZone || choices
                                        ? undefined
                                        : () => mutate(() => promoteItemParamToPerLevel(item, p.tag))
                                }
                            />
                        );
                    })}
                    {item.lists.map((l) => (
                        <ItemListRow
                            key={l.tag}
                            tag={l.tag}
                            childTag={l.childTag}
                            items={l.items}
                            onSet={(items) => mutate(() => setItemList(item, l.tag, l.childTag, items))}
                            onRemove={() => mutate(() => removeItemParam(item, l.tag))}
                        />
                    ))}
                    {item.blocks.map((b) => (
                        <div key={b.tag}>
                            <div className="mb-1 flex items-center gap-2">
                                <span className="mono text-[10px] text-[var(--color-text-faint)]">
                                    {b.tag} (nested)
                                </span>
                                <button
                                    type="button"
                                    onClick={() => mutate(() => removeItemParam(item, b.tag))}
                                    className="text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                                >
                                    remove
                                </button>
                            </div>
                            <RawBlock tag={b.tag} el={b.el} />
                        </div>
                    ))}
                    {missingSpecs.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
                                add:
                            </span>
                            {missingSpecs.map((s) => (
                                <button
                                    key={s.name}
                                    type="button"
                                    title={s.desc ? `${s.name} — ${s.desc}` : s.name}
                                    onClick={() => mutate(() => setItemSingleParam(item, s.name, s.default ?? ""))}
                                    className="mono rounded border border-dashed border-[var(--color-border)] px-1.5 py-[1px] text-[10px] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-text)]"
                                >
                                    + {s.name}
                                </button>
                            ))}
                        </div>
                    )}
                    {adding ? (
                        <AddParamForm
                            onAdd={(name) => {
                                mutate(() => setItemSingleParam(item, name, ""));
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
                            + add custom param
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function ItemParamRow({
    tag,
    value,
    onCommit,
    onRemove,
    onPromote,
    choices,
    bool,
    desc,
    zoneCatalog
}: {
    tag: string;
    value: string;
    onCommit: (v: string) => void;
    onRemove: () => void;
    onPromote?: () => void;
    choices?: readonly string[];
    bool?: boolean;
    desc?: string;
    zoneCatalog?: ZoneCatalog | null;
}) {
    const boolOn = value.trim().toLowerCase() === "true";
    return (
        <div className="flex items-center gap-2">
            <span
                className="mono w-44 shrink-0 truncate text-[11px] text-[var(--color-text-faint)]"
                title={desc ? `${tag} — ${desc}` : tag}
            >
                {tag}
            </span>
            {zoneCatalog !== undefined ? (
                <ZoneIdField value={value} catalog={zoneCatalog} onCommit={onCommit} />
            ) : bool ? (
                <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                        type="checkbox"
                        checked={boolOn}
                        onChange={(e) => onCommit(e.target.checked ? "true" : "false")}
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent-2)]"
                    />
                    <span className="mono text-[12px] text-[var(--color-text-faint)]">{boolOn ? "true" : "false"}</span>
                </label>
            ) : choices ? (
                <select
                    value={value}
                    onChange={(e) => {
                        if (e.target.value !== value) onCommit(e.target.value);
                    }}
                    className="mono flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                >
                    {!choices.includes(value) && value && <option value={value}>{`${value} (custom)`}</option>}
                    {choices.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    className="mono flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                    defaultValue={value}
                    onBlur={(e) => {
                        if (e.target.value !== value) onCommit(e.target.value);
                    }}
                />
            )}
            {onPromote && (
                <button
                    type="button"
                    onClick={onPromote}
                    title="Make this param per-level (then edit the level values in the modal)"
                    className="inline-flex shrink-0 items-center gap-0.5 text-[9px] uppercase tracking-[0.1em] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                >
                    <ArrowRight size={10} aria-hidden /> lv
                </button>
            )}
            <button
                type="button"
                onClick={onRemove}
                title={`Remove ${tag}`}
                aria-label={`Remove ${tag}`}
                className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
            >
                <X size={13} aria-hidden />
            </button>
        </div>
    );
}

function ItemListRow({
    tag,
    childTag,
    items,
    onSet,
    onRemove
}: {
    tag: string;
    childTag: string;
    items: string[];
    onSet: (items: string[]) => void;
    onRemove: () => void;
}) {
    const [draft, setDraft] = useState("");
    const add = () => {
        const v = draft.trim();
        if (v && !items.includes(v)) onSet([...items, v]);
        setDraft("");
    };
    return (
        <div className="flex items-start gap-2">
            <span
                className="mono w-44 shrink-0 truncate pt-1 text-[11px] text-[var(--color-text-faint)]"
                title={`${tag} — list of <${childTag}>`}
            >
                {tag}
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-1">
                {items.map((v, i) => (
                    <span
                        key={`${v}:${i}`}
                        className="mono inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-[1px] text-[11px]"
                    >
                        {v}
                        <button
                            type="button"
                            onClick={() => onSet(items.filter((_, j) => j !== i))}
                            className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                            aria-label={`Remove ${v}`}
                        >
                            <X size={12} aria-hidden />
                        </button>
                    </span>
                ))}
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            add();
                        }
                    }}
                    onBlur={add}
                    placeholder="add…"
                    className="mono w-24 rounded border border-dashed border-[var(--color-border)] bg-transparent px-1.5 py-[1px] text-[11px] outline-none focus:border-[var(--color-accent-2)]"
                />
            </div>
            <button
                type="button"
                onClick={onRemove}
                title={`Remove ${tag}`}
                aria-label={`Remove ${tag}`}
                className="shrink-0 pt-1 text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
            >
                <X size={13} aria-hidden />
            </button>
        </div>
    );
}

function AddItemModal({
    open,
    onClose,
    kind,
    scopes,
    handlers,
    onAdd
}: {
    open: boolean;
    onClose: () => void;
    kind: "effect" | "condition";
    scopes: readonly string[];
    handlers: readonly string[];
    onAdd: (scope: string, handler: string) => void;
}) {
    const [scope, setScope] = useState(scopes[0]);
    const [handler, setHandler] = useState("");
    const listId = useId();
    if (!open) return null;
    const matched = handler.trim() && handlers.includes(handler.trim());
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="w-[480px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold tracking-wide">Add {kind}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                    >
                        <X size={15} aria-hidden />
                    </button>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                            Scope
                        </label>
                        <select
                            value={scope}
                            onChange={(e) => setScope(e.target.value)}
                            className="mono w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                        >
                            {scopes.map((s) => (
                                <option key={s} value={s}>
                                    {scopeLabel(s)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                            Handler
                        </label>
                        <input
                            // biome-ignore lint/a11y/noAutofocus: modal opens on demand, focus is expected
                            autoFocus
                            value={handler}
                            onChange={(e) => setHandler(e.target.value)}
                            list={listId}
                            placeholder={`type or pick — ${handlers.length} ${kind} handlers`}
                            className="mono w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                        />
                        <datalist id={listId}>
                            {handlers.map((h) => (
                                <option key={h} value={h}>
                                    {humanizeHandler(h)}
                                </option>
                            ))}
                        </datalist>
                        {handler.trim() && (
                            <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">
                                {humanizeHandler(handler.trim())}
                                {!matched && " · not in the known list (will be written verbatim)"}
                            </p>
                        )}
                    </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-xs hover:border-[var(--color-accent-2)]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!handler.trim()}
                        onClick={() => onAdd(scope, handler.trim())}
                        className="rounded border border-[var(--color-accent-2)] bg-[var(--color-surface-2)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-40"
                    >
                        Add
                    </button>
                </div>
            </div>
        </div>
    );
}

function AddParamForm({ onAdd, onCancel }: { onAdd: (name: string) => void; onCancel: () => void }) {
    const [name, setName] = useState("");
    return (
        <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
                e.preventDefault();
                const n = name.trim();
                if (n) onAdd(n);
            }}
        >
            <input
                // biome-ignore lint/a11y/noAutofocus: shown on demand right where the user clicked
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="param name (e.g. power, chance, mode)"
                className="mono flex-1 rounded border border-dashed border-[var(--color-border)] bg-transparent px-2 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
            />
            <button
                type="submit"
                disabled={!name.trim()}
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
