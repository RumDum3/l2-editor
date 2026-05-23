import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Combobox } from "./Combobox";

type Props = {
    value: string;
    choices: readonly string[];
    onCommit: (v: string) => void;
    delimiter?: string;
};

export function TagPicker({ value, choices, onCommit, delimiter = ";" }: Props) {
    const tags = useMemo(() => splitTags(value, delimiter), [value, delimiter]);
    const [draft, setDraft] = useState("");

    const commit = (next: string[]) => {
        const seen = new Set<string>();
        const cleaned: string[] = [];
        for (const t of next) {
            const trimmed = t.trim();
            if (trimmed && !seen.has(trimmed)) {
                seen.add(trimmed);
                cleaned.push(trimmed);
            }
        }
        const joined = cleaned.join(delimiter);
        if (joined !== value) onCommit(joined);
    };

    const addTag = (t: string) => {
        const trimmed = t.trim();
        if (!trimmed) return;
        if (tags.includes(trimmed)) return;
        commit([...tags, trimmed]);
        setDraft("");
    };

    const removeTag = (t: string) => commit(tags.filter((x) => x !== t));

    return (
        <div className="space-y-1.5">
            {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {tags.map((t) => (
                        <Chip key={t} label={t} onRemove={() => removeTag(t)} />
                    ))}
                </div>
            )}
            <Combobox
                value={draft}
                choices={choices}
                onCommit={(v) => addTag(v)}
                placeholder={tags.length === 0 ? "Pick or type a value…" : "Add another…"}
            />
        </div>
    );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="mono inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px]">
            {label}
            <button
                type="button"
                onClick={onRemove}
                className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                title="Remove"
                aria-label={`Remove ${label}`}
            >
                <X size={12} aria-hidden />
            </button>
        </span>
    );
}

function splitTags(value: string, delimiter: string): string[] {
    if (!value) return [];
    return value
        .split(delimiter)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
