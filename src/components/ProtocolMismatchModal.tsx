type Props = {
    open: boolean;
    onDismiss: () => void;
    clientProtocol: number;
    serverProtocols: number[];
    onOpenSettings: () => void;
};

export function ProtocolMismatchModal({ open, onDismiss, clientProtocol, serverProtocols, onOpenSettings }: Props) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6" onClick={onDismiss}>
            <div
                className="w-[480px] rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-surface)] p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center gap-2">
                    <span className="rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-[var(--color-warning)]">
                        warning
                    </span>
                    <h2 className="text-sm font-semibold text-[var(--color-text)]">Protocol mismatch</h2>
                </div>

                <p className="mb-3 text-[12px] leading-relaxed text-[var(--color-text)]">
                    The L2 client and the L2J server are reporting different protocol versions. Players using this
                    client won't be able to connect to this server until they match.
                </p>

                <div className="mb-4 grid grid-cols-2 gap-3 text-[11px]">
                    <div className="rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)] p-2">
                        <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                            Client
                        </div>
                        <div className="mono mt-1 text-[14px] text-[var(--color-danger)]">{clientProtocol}</div>
                    </div>
                    <div className="rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)] p-2">
                        <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                            Server allows
                        </div>
                        <div className="mono mt-1 text-[14px] text-[var(--color-success)]">
                            {serverProtocols.length > 0 ? serverProtocols.join(", ") : "(empty)"}
                        </div>
                    </div>
                </div>

                <p className="mb-4 text-[11px] text-[var(--color-text-faint)]">
                    Editing data for a chronicle you're not running is fine — dismiss this if you know what you're
                    doing. To match, edit <span className="mono">AllowedProtocolRevisions</span> in Server.ini or use
                    the matching client build.
                </p>

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            onDismiss();
                            onOpenSettings();
                        }}
                        className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-xs hover:border-[var(--color-accent-2)]"
                    >
                        Open Settings
                    </button>
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-warning)]/20"
                    >
                        Continue anyway
                    </button>
                </div>
            </div>
        </div>
    );
}
