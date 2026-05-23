import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Combobox } from "../../../components/Combobox";
import { TagPicker } from "../../../components/TagPicker";
import { HelpIcon, Tooltip } from "../../../components/Tooltip";
import { labelFor } from "../data/enums";
import { type FieldHelp } from "../data/help";
import { PerLevelModal } from "./PerLevelModal";
import { toggleSectionCollapsed, useSectionCollapsed } from "../sectionCollapse";
import type { FieldValue } from "../model";

export function scopeLabel(scope: string): string {
    return scope.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

export function truncate(s: string, n = 32): string {
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function Field({
    label,
    value,
    onCommit,
    help,
    placeholder
}: {
    label: string;
    value: string;
    onCommit: (v: string) => void;
    help?: FieldHelp | null;
    placeholder?: string;
}) {
    return (
        <label className="block">
            <Label help={help}>{label}</Label>
            <input
                className="mono w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                defaultValue={value}
                placeholder={placeholder}
                onBlur={(e) => {
                    if (e.target.value !== value) onCommit(e.target.value);
                }}
            />
        </label>
    );
}

export function BoolField({
    label,
    value,
    defaultValue,
    onCommit,
    onRemove,
    help
}: {
    label: string;
    value: string;
    defaultValue: string;
    onCommit: (v: string) => void;
    onRemove: () => void;
    help?: FieldHelp | null;
}) {
    const cur = value.trim().toLowerCase() === "true" ? "true" : "false";
    const toggle = (next: boolean) => {
        const v = next ? "true" : "false";
        if (v === defaultValue) onRemove();
        else onCommit(v);
    };
    return (
        <label className="flex cursor-pointer items-center gap-2">
            <input
                type="checkbox"
                checked={cur === "true"}
                onChange={(e) => toggle(e.target.checked)}
                className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent-2)]"
            />
            <span className="mono inline-flex items-center text-[12px] text-[var(--color-text)]">
                {label}
                {help && (
                    <Tooltip content={<HelpContent help={help} />}>
                        <HelpIcon />
                    </Tooltip>
                )}
            </span>
            <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                {cur}
                {cur === defaultValue && <span className="text-[var(--color-text-faint)]/60"> · default</span>}
            </span>
        </label>
    );
}

export function EnumField({
    label,
    value,
    choices,
    onCommit,
    help
}: {
    label: string;
    value: string;
    choices: readonly string[];
    onCommit: (v: string) => void;
    help?: FieldHelp | null;
}) {
    const present = choices.includes(value);
    return (
        <label className="block">
            <Label help={help}>{label}</Label>
            <select
                className="mono w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                value={value}
                onChange={(e) => {
                    if (e.target.value !== value) onCommit(e.target.value);
                }}
            >
                {!present && value && <option value={value}>{`${value}  (unknown — kept verbatim)`}</option>}
                {choices.map((c) => (
                    <option key={c} value={c}>
                        {labelFor(label, c)}
                    </option>
                ))}
            </select>
        </label>
    );
}

export function ComboField({
    label,
    value,
    choices,
    onCommit,
    help
}: {
    label: string;
    value: string;
    choices: readonly string[];
    onCommit: (v: string) => void;
    help?: FieldHelp | null;
}) {
    return (
        <div>
            <Label help={help}>{label}</Label>
            <Combobox value={value} choices={choices} onCommit={onCommit} />
        </div>
    );
}

export function TagsField({
    label,
    value,
    choices,
    onCommit,
    help
}: {
    label: string;
    value: string;
    choices: readonly string[];
    onCommit: (v: string) => void;
    help?: FieldHelp | null;
}) {
    return (
        <div>
            <Label help={help}>{label}</Label>
            <TagPicker value={value} choices={choices} onCommit={onCommit} />
        </div>
    );
}

export function Label({ children, help }: { children: React.ReactNode; help?: FieldHelp | null }) {
    return (
        <span className="mb-0.5 flex items-center text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
            {children}
            {help && (
                <Tooltip content={<HelpContent help={help} />}>
                    <HelpIcon />
                </Tooltip>
            )}
        </span>
    );
}

export function HelpContent({ help }: { help: FieldHelp }) {
    return (
        <div>
            <div className="normal-case tracking-normal">{help.description}</div>
            {help.unit && <div className="mt-1 text-[10px] text-[var(--color-text-faint)]">unit: {help.unit}</div>}
            {help.values && (
                <div className="mt-2 space-y-0.5 normal-case tracking-normal">
                    {Object.entries(help.values).map(([k, v]) => (
                        <div key={k} className="text-[10px]">
                            <span className="mono text-[var(--color-accent)]">{k}</span>
                            <span className="text-[var(--color-text-faint)]">{" — "}</span>
                            <span>{v}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function Section({
    title,
    storageKey,
    children
}: {
    title: string;
    storageKey?: string;
    children: React.ReactNode;
}) {
    const key = storageKey ?? title;
    const collapsed = useSectionCollapsed(key);
    return (
        <div className="border-b border-[var(--color-border)]/60">
            <button
                type="button"
                onClick={() => toggleSectionCollapsed(key)}
                aria-expanded={!collapsed}
                className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
            >
                {collapsed ? (
                    <ChevronRight size={12} className="text-[var(--color-text-faint)]" aria-hidden />
                ) : (
                    <ChevronDown size={12} className="text-[var(--color-text-faint)]" aria-hidden />
                )}
                {title}
            </button>
            {!collapsed && <div className="pb-2">{children}</div>}
        </div>
    );
}

export function Empty({ children }: { children: React.ReactNode }) {
    return <div className="px-3 py-2 text-[11px] text-[var(--color-text-faint)]">{children}</div>;
}

export function FieldGroupHeader({ children }: { children: React.ReactNode }) {
    return (
        <div className="mt-1 border-y border-[var(--color-border)]/40 bg-[var(--color-surface-2)]/40 px-3 py-1 text-[9px] uppercase tracking-[0.3em] text-[var(--color-text-faint)]">
            {children}
        </div>
    );
}

export function RawBlock({ tag, el }: { tag: string; el: Element }) {
    const xml = useMemo(() => new XMLSerializer().serializeToString(el), [el]);
    return (
        <div className="rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)] p-2">
            <div className="mb-1 flex items-center justify-between">
                <span className="mono text-[11px] text-[var(--color-accent)]">{tag}</span>
                <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">raw xml</span>
            </div>
            <pre className="mono max-h-60 overflow-auto whitespace-pre-wrap text-[11px] text-[var(--color-text)]">
                {xml}
            </pre>
        </div>
    );
}

export function PerLevelSummary({
    tag,
    value,
    help,
    onCommitLevel,
    onDeleteLevel,
    onCommitSublevel,
    onDeleteSublevel
}: {
    tag: string;
    value: Extract<FieldValue, { kind: "perLevel" } | { kind: "perSublevel" }>;
    help?: FieldHelp | null;
    onCommitLevel: (level: number, v: string) => void;
    onDeleteLevel: (level: number) => void;
    onCommitSublevel: (level: number, sublevel: number, v: string) => void;
    onDeleteSublevel: (level: number, sublevel: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const baseMap = value.kind === "perLevel" ? value.values : value.base;
    const overrideCount =
        value.kind === "perSublevel" ? [...value.overrides.values()].reduce((n, m) => n + m.size, 0) : 0;
    const rows = useMemo(() => [...baseMap.entries()].sort((a, b) => a[0] - b[0]), [baseMap]);
    const first = rows[0];
    const last = rows[rows.length - 1];
    const preview =
        first && last && first[0] !== last[0]
            ? `lv ${first[0]}: ${truncate(first[1])} → lv ${last[0]}: ${truncate(last[1])}`
            : first
              ? `lv ${first[0]}: ${truncate(first[1])}`
              : "(empty)";

    return (
        <>
            <div className="flex items-center gap-3 rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)] px-3 py-1.5">
                <span className="mono inline-flex items-center text-[11px] text-[var(--color-text-faint)]">
                    {tag}
                    {help && (
                        <Tooltip content={<HelpContent help={help} />}>
                            <HelpIcon />
                        </Tooltip>
                    )}
                </span>
                <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                    {rows.length} entries
                </span>
                {overrideCount > 0 && (
                    <span
                        className="rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--color-warning)]"
                        title={`${overrideCount} per-sublevel override${overrideCount === 1 ? "" : "s"} authored for this field`}
                    >
                        +{overrideCount} sub
                    </span>
                )}
                <span className="mono truncate text-[11px] text-[var(--color-text)]" title={preview}>
                    {preview}
                </span>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="ml-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] hover:border-[var(--color-accent-2)]"
                >
                    Edit
                </button>
            </div>

            <PerLevelModal
                open={open}
                onClose={() => setOpen(false)}
                tag={tag}
                field={value}
                help={help}
                onCommitLevel={onCommitLevel}
                onDeleteLevel={onDeleteLevel}
                onCommitSublevel={onCommitSublevel}
                onDeleteSublevel={onDeleteSublevel}
            />
        </>
    );
}
