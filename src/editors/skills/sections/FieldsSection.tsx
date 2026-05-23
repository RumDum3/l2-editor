import { AlertTriangle, Check, X } from "lucide-react";
import { useState } from "react";
import { ipc } from "../../../lib/ipc";
import { logger } from "../../../lib/logger";
import { buildUpdatesForField, findMismatches, mappingForDatField, mappingForXmlTag } from "../../../lib/skillFieldMap";
import { invalidateId, useSkillRows } from "../../../lib/skillRowCache";
import { useSettings } from "../../../state/SettingsContext";
import { widgetFor } from "../data/enums";
import {
    catalogBySection,
    catalogEntry,
    fieldOrder,
    isBoolField,
    SKILL_SECTIONS,
    sectionOf,
    type SkillSectionId
} from "../data/fieldCatalog";
import {
    BoolField,
    ComboField,
    EnumField,
    Empty,
    Field,
    FieldGroupHeader,
    PerLevelSummary,
    Section,
    TagsField
} from "../widgets/fieldPrimitives";
import { helpFor } from "../data/help";
import {
    deletePerLevelValue,
    deleteSublevelValue,
    type FieldValue,
    removeSingleField,
    setPerLevelValue,
    setSingleField,
    setSublevelValue,
    type Skill
} from "../model";

function valueKey(v: FieldValue): string {
    return JSON.stringify(v, (_k, x) => (x instanceof Map ? [...x] : x));
}

export function FieldsSection({ skill, mutate }: { skill: Skill; mutate: (fn: () => void) => void }) {
    const [addOpen, setAddOpen] = useState(false);
    const { skillgrp, refreshPendingClientEdits } = useSettings();
    const rows = useSkillRows(skillgrp.kind === "done" ? skill.id : null);
    const mismatches = rows ? findMismatches(skill, rows) : [];
    const mismatchedTags = new Set<string>();
    for (const m of mismatches) {
        const xmlTag = mappingForDatField(m.datField)?.xmlField;
        if (xmlTag) mismatchedTags.add(xmlTag);
    }

    const pushField = (datField: string) => {
        const updates = buildUpdatesForField(skill, datField);
        if (updates.length === 0) return;
        ipc.applySkillEdits(skill.id, updates)
            .then(() => {
                invalidateId(skill.id);
                refreshPendingClientEdits();
            })
            .catch((e) =>
                logger.warn("skill-sync", "push failed", {
                    skillId: skill.id,
                    datField,
                    message: String(e)
                })
            );
    };

    const bySection = new Map<SkillSectionId, typeof skill.fields>();
    for (const f of skill.fields) {
        const sec = sectionOf(f.tag);
        const bucket = bySection.get(sec);
        if (bucket) bucket.push(f);
        else bySection.set(sec, [f]);
    }
    for (const bucket of bySection.values()) {
        bucket.sort((a, b) => fieldOrder(a.tag) - fieldOrder(b.tag));
    }

    const renderField = (f: (typeof skill.fields)[number]) => {
        const mapping = mappingForXmlTag(f.tag);
        const clientInfo =
            mapping && mismatchedTags.has(f.tag)
                ? { datField: mapping.datField, mismatched: true, onPush: () => pushField(mapping.datField) }
                : null;
        return (
            <FieldRow
                key={`${f.tag}:${valueKey(f.value)}`}
                tag={f.tag}
                value={f.value}
                clientInfo={clientInfo}
                onCommitSingle={(v) => mutate(() => setSingleField(skill, f.tag, v))}
                onRemove={() => mutate(() => removeSingleField(skill, f.tag))}
                onCommitLevel={(lvl, v) => mutate(() => setPerLevelValue(skill, f.tag, lvl, v))}
                onDeleteLevel={(lvl) => mutate(() => deletePerLevelValue(skill, f.tag, lvl))}
                onCommitSublevel={(lvl, sub, v) => mutate(() => setSublevelValue(skill, f.tag, lvl, sub, v))}
                onDeleteSublevel={(lvl, sub) => mutate(() => deleteSublevelValue(skill, f.tag, lvl, sub))}
            />
        );
    };

    const present = new Set(skill.fields.map((f) => f.tag));
    const addField = (name: string) => {
        const entry = catalogEntry(name);
        const init = entry?.type === "bool" ? (entry.default === "true" ? "false" : "true") : (entry?.default ?? "");
        mutate(() => setSingleField(skill, name, init));
    };

    return (
        <Section title="Fields">
            {skill.fields.length === 0 && <Empty>No top-level fields yet — use “Add option” below.</Empty>}
            {SKILL_SECTIONS.map((sec) => {
                const fields = bySection.get(sec.id);
                if (!fields || fields.length === 0) return null;
                return (
                    <div key={sec.id}>
                        <FieldGroupHeader>{sec.title}</FieldGroupHeader>
                        <div className="grid gap-2 px-3 pb-2 pt-1.5">{fields.map(renderField)}</div>
                    </div>
                );
            })}
            <div className="px-3 pb-2 pt-1.5">
                <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="rounded border border-dashed border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-text)]"
                >
                    + Add option…
                </button>
            </div>
            <AddFieldModal open={addOpen} present={present} onClose={() => setAddOpen(false)} onAdd={addField} />
        </Section>
    );
}

function AddFieldModal({
    open,
    present,
    onClose,
    onAdd
}: {
    open: boolean;
    present: ReadonlySet<string>;
    onClose: () => void;
    onAdd: (name: string) => void;
}) {
    const [filter, setFilter] = useState("");
    if (!open) return null;
    const q = filter.trim().toLowerCase();
    const groups = catalogBySection()
        .map((g) => ({
            ...g,
            entries: q
                ? g.entries.filter((e) => e.name.toLowerCase().includes(q) || g.title.toLowerCase().includes(q))
                : g.entries
        }))
        .filter((g) => g.entries.length > 0);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="flex max-h-[80vh] w-[560px] flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2.5">
                    <h2 className="text-sm font-semibold tracking-wide">Add option</h2>
                    <input
                        autoFocus
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter…"
                        className="mono ml-auto w-44 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                    />
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                    >
                        <X size={15} aria-hidden />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                    {groups.length === 0 && (
                        <div className="px-2 py-6 text-center text-[12px] text-[var(--color-text-faint)]">
                            No matches.
                        </div>
                    )}
                    {groups.map((g) => (
                        <div key={g.id} className="mb-3">
                            <div className="mb-1 text-[9px] uppercase tracking-[0.3em] text-[var(--color-text-faint)]">
                                {g.title}
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                                {g.entries.map((e) => {
                                    const added = present.has(e.name);
                                    const help = helpFor(e.name);
                                    return (
                                        <button
                                            key={e.name}
                                            type="button"
                                            disabled={added}
                                            onClick={() => onAdd(e.name)}
                                            title={help?.description ?? `${e.type} · default ${e.default || "(empty)"}`}
                                            className={`flex items-center gap-2 rounded border px-2 py-1 text-left text-[11px] ${
                                                added
                                                    ? "cursor-default border-[var(--color-border)]/40 text-[var(--color-text-faint)]"
                                                    : "border-[var(--color-border)] hover:border-[var(--color-accent-2)] hover:bg-[var(--color-surface-2)]"
                                            }`}
                                        >
                                            <span className="mono truncate">{e.name}</span>
                                            <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
                                                {added ? (
                                                    <>
                                                        <Check size={10} aria-hidden /> added
                                                    </>
                                                ) : (
                                                    e.type
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

type FieldClientInfo = {
    datField: string;
    mismatched: boolean;
    onPush: () => void;
};

function FieldRow({
    tag,
    value,
    clientInfo,
    onCommitSingle,
    onRemove,
    onCommitLevel,
    onDeleteLevel,
    onCommitSublevel,
    onDeleteSublevel
}: {
    tag: string;
    value: FieldValue;
    clientInfo: FieldClientInfo | null;
    onCommitSingle: (v: string) => void;
    onRemove: () => void;
    onCommitLevel: (level: number, v: string) => void;
    onDeleteLevel: (level: number) => void;
    onCommitSublevel: (level: number, sublevel: number, v: string) => void;
    onDeleteSublevel: (level: number, sublevel: number) => void;
}) {
    const help = helpFor(tag);
    const inner = (() => {
        if (value.kind === "single") {
            if (isBoolField(tag)) {
                return (
                    <BoolField
                        label={tag}
                        value={value.value}
                        defaultValue={catalogEntry(tag)?.default ?? "false"}
                        onCommit={onCommitSingle}
                        onRemove={onRemove}
                        help={help}
                    />
                );
            }
            const widget = widgetFor(tag);
            if (widget?.kind === "select") {
                return (
                    <EnumField
                        label={tag}
                        value={value.value}
                        choices={widget.choices}
                        onCommit={onCommitSingle}
                        help={help}
                    />
                );
            }
            if (widget?.kind === "combo") {
                return (
                    <ComboField
                        label={tag}
                        value={value.value}
                        choices={widget.choices}
                        onCommit={onCommitSingle}
                        help={help}
                    />
                );
            }
            if (widget?.kind === "tags") {
                return (
                    <TagsField
                        label={tag}
                        value={value.value}
                        choices={widget.choices}
                        onCommit={onCommitSingle}
                        help={help}
                    />
                );
            }
            return <Field label={tag} value={value.value} onCommit={onCommitSingle} help={help} />;
        }
        return (
            <PerLevelSummary
                tag={tag}
                value={value}
                help={help}
                onCommitLevel={onCommitLevel}
                onDeleteLevel={onDeleteLevel}
                onCommitSublevel={onCommitSublevel}
                onDeleteSublevel={onDeleteSublevel}
            />
        );
    })();
    if (!clientInfo) return inner;
    return (
        <div>
            {inner}
            <ClientInline info={clientInfo} />
        </div>
    );
}

function ClientInline({ info }: { info: FieldClientInfo }) {
    if (!info.mismatched) return null;
    return (
        <div className="mt-0.5 flex items-center gap-1.5 pl-3 text-[10px]">
            <AlertTriangle size={11} className="text-[var(--color-warning)]" aria-hidden />
            <span className="text-[var(--color-warning)]">client out of sync</span>
            <button
                type="button"
                onClick={info.onPush}
                className="rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-1 py-[1px] text-[8px] font-semibold uppercase tracking-[0.15em] text-[var(--color-warning)] hover:bg-[var(--color-warning)]/20"
                title="Push the server XML value to the client (Save flushes to disk)"
            >
                push
            </button>
        </div>
    );
}
