export function Placeholder({ children, tone }: { children: React.ReactNode; tone?: "danger" }) {
    return (
        <div
            className={`flex flex-1 items-center justify-center p-8 text-[12px] ${
                tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-text-faint)]"
            }`}
        >
            {children}
        </div>
    );
}

export function Section({
    title,
    action,
    children
}: {
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)]/60 px-3 py-1.5">
                <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">{title}</span>
                {action}
            </div>
            <div className="space-y-2 p-3">{children}</div>
        </div>
    );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                {label}
            </span>
            <div className="flex min-w-0 flex-1 items-center">{children}</div>
        </div>
    );
}

export function ModeBtn({
    active,
    onClick,
    children
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded border px-2 py-0.5 text-[11px] ${
                active
                    ? "border-[var(--color-accent-2)] bg-[var(--color-surface-2)] text-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-accent-2)]"
            }`}
        >
            {children}
        </button>
    );
}
