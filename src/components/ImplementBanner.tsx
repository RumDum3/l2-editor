import { useState } from "react";

export function ImplementBanner({
    label,
    note,
    onImplement,
    actionLabel = "implement"
}: {
    label: string;
    note?: string;
    onImplement: () => Promise<{ ok: boolean; error?: string }>;
    actionLabel?: string;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await onImplement();
            if (!res.ok) setError(res.error ?? "Implement failed.");
        } catch (e) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="mb-3 flex items-center gap-3 rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-2 text-[11px] text-[var(--color-warning)]">
            <span className="font-bold leading-none">!</span>
            <span className="flex-1">
                {label}
                {note && <> · <span className="text-[var(--color-text-faint)]">{note}</span></>}
            </span>
            <button
                type="button"
                onClick={run}
                disabled={busy}
                className={`shrink-0 rounded border border-[var(--color-warning)]/60 bg-[var(--color-warning)]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-warning)] hover:bg-[var(--color-warning)]/30 ${busy ? "opacity-50" : ""}`}
                title={`${actionLabel} (Save flushes to disk)`}
            >
                {busy ? "implementing…" : actionLabel}
            </button>
            {error && <span className="text-[var(--color-danger)]">{error}</span>}
        </div>
    );
}
