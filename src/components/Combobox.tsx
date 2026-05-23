import { useEffect, useId, useMemo, useRef, useState } from "react";

type Props = {
    value: string;
    choices: readonly string[];
    onCommit: (v: string) => void;
    placeholder?: string;
};

const VISIBLE_LIMIT = 200;

export function Combobox({ value, choices, onCommit, placeholder }: Props) {
    const [draft, setDraft] = useState(value);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();

    useEffect(() => {
        setDraft(value);
    }, [value]);

    const filtered = useMemo(() => {
        const q = draft.trim().toLowerCase();
        if (!q) return choices.slice(0, VISIBLE_LIMIT);
        return choices.filter((c) => c.toLowerCase().includes(q)).slice(0, VISIBLE_LIMIT);
    }, [choices, draft]);

    useEffect(() => {
        if (active >= filtered.length) setActive(0);
    }, [filtered.length, active]);

    const commit = (v: string) => {
        setDraft(v);
        setOpen(false);
        if (v !== value) onCommit(v);
    };

    return (
        <div className="relative">
            <input
                ref={inputRef}
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                placeholder={placeholder}
                className="mono w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                value={draft}
                onChange={(e) => {
                    setDraft(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={(e) => {
                    setTimeout(() => setOpen(false), 100);
                    if (e.target.value !== value) onCommit(e.target.value);
                }}
                onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setOpen(true);
                        setActive((i) => Math.min(filtered.length - 1, i + 1));
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActive((i) => Math.max(0, i - 1));
                    } else if (e.key === "Enter") {
                        e.preventDefault();
                        const pick = filtered[active] ?? draft;
                        commit(pick);
                    } else if (e.key === "Escape") {
                        setDraft(value);
                        setOpen(false);
                    }
                }}
            />
            {open && filtered.length > 0 && (
                <ul
                    id={listId}
                    role="listbox"
                    className="absolute left-0 right-0 z-10 mt-1 max-h-72 overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
                >
                    {filtered.map((c, i) => (
                        <li
                            key={c}
                            role="option"
                            aria-selected={i === active}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                commit(c);
                            }}
                            onMouseEnter={() => setActive(i)}
                            className={`mono cursor-pointer px-2 py-1 text-[11px] ${
                                i === active
                                    ? "bg-[var(--color-surface-2)] text-[var(--color-accent)]"
                                    : "hover:bg-[var(--color-surface-2)]"
                            }`}
                        >
                            {c}
                        </li>
                    ))}
                    {choices.length > VISIBLE_LIMIT && filtered.length === VISIBLE_LIMIT && (
                        <li className="px-2 py-1 text-[10px] text-[var(--color-text-faint)]">
                            … {choices.length - VISIBLE_LIMIT} more — keep typing to narrow.
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}
