import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Issue } from "../classData";

const ISSUE_TONE = {
    error: "text-[var(--color-danger)]",
    warn: "text-[var(--color-warning)]",
    note: "text-[var(--color-text-faint)]"
} as const;
const ISSUE_DOT = {
    error: "bg-[var(--color-danger)]",
    warn: "bg-[var(--color-warning)]",
    note: "bg-[var(--color-text-faint)]"
} as const;

export function IssuesPanel({ issues, onSelect }: { issues: Issue[]; onSelect: (id: number) => void }) {
    const [open, setOpen] = useState(false);
    const errs = issues.filter((i) => i.severity === "error").length;
    const warns = issues.filter((i) => i.severity === "warn").length;
    const notes = issues.filter((i) => i.severity === "note").length;
    const summary = [
        errs > 0 ? `${errs} error${errs === 1 ? "" : "s"}` : null,
        warns > 0 ? `${warns} warning${warns === 1 ? "" : "s"}` : null,
        notes > 0 ? `${notes} note${notes === 1 ? "" : "s"}` : null
    ]
        .filter(Boolean)
        .join(" · ");
    return (
        <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-[var(--color-surface-2)]"
            >
                {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
                <AlertTriangle
                    size={13}
                    aria-hidden
                    className={errs > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-warning)]"}
                />
                <span className="font-medium">
                    {issues.length} issue{issues.length === 1 ? "" : "s"}
                </span>
                <span className="text-[var(--color-text-faint)]">{summary}</span>
            </button>
            {open && (
                <ul className="max-h-48 overflow-y-auto border-t border-[var(--color-border)]/40 px-3 py-1.5 text-[11px] leading-relaxed">
                    {issues.map((it, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                            <span
                                className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${ISSUE_DOT[it.severity]}`}
                                aria-hidden
                            />
                            {it.classId != null ? (
                                <button
                                    type="button"
                                    onClick={() => onSelect(it.classId!)}
                                    className={`text-left hover:underline ${ISSUE_TONE[it.severity]}`}
                                >
                                    {it.message}
                                </button>
                            ) : (
                                <span className={ISSUE_TONE[it.severity]}>{it.message}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
