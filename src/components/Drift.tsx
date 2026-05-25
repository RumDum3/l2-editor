import type { Drift, DriftField } from "../lib/drift";

export function DriftBadge({ drift, className = "" }: { drift: Drift; className?: string }) {
    if (drift.fields.length === 0) return null;
    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1 rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-warning)] ${className}`}
            title={driftTooltip(drift)}
        >
            <span className="font-bold leading-none">!</span>
            <span className="font-mono">{driftSummary(drift)}</span>
        </span>
    );
}

export function DriftMarker({ drift, className = "" }: { drift: Drift; className?: string }) {
    if (drift.fields.length === 0) return null;
    return (
        <span
            className={`font-bold text-[var(--color-warning)] ${className}`}
            title={driftTooltip(drift)}
        >
            !
        </span>
    );
}

export function DriftBanner({ drift, title }: { drift: Drift; title?: string }) {
    if (drift.fields.length === 0) return null;
    const headline = title ?? "client / server disagreement";
    return (
        <section className="rounded border border-[var(--color-warning)] bg-[var(--color-warning)]/5 px-3 py-2">
            <div className="mb-1 flex items-baseline gap-2">
                <span className="font-mono text-[12px] font-bold text-[var(--color-warning)]">!</span>
                <h3 className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-warning)]">{headline}</h3>
                {drift.subject && (
                    <span className="font-mono text-[10px] text-[var(--color-text-faint)]">{drift.subject}</span>
                )}
                {drift.clientSource && (
                    <span className="ml-auto font-mono text-[10px] text-[var(--color-text-faint)]">
                        {drift.clientSource}
                    </span>
                )}
            </div>
            <div className="flex flex-col gap-2 font-mono text-[11px]">
                {drift.fields.map((f, i) => (
                    <DriftFieldRow key={`${f.label}-${i}`} field={f} />
                ))}
            </div>
        </section>
    );
}

function DriftFieldRow({ field }: { field: DriftField }) {
    return (
        <div className="flex flex-col gap-0.5 border-t border-white/5 pt-1.5 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-faint)]">
                <span>field: {field.label}</span>
                {field.note && (
                    <>
                        <span>·</span>
                        <span>{field.note}</span>
                    </>
                )}
            </div>
            <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-[9px] uppercase tracking-wider text-[var(--color-accent-2)]">
                    server
                </span>
                {field.kind === "missingOnServer" ? (
                    <span className="text-[var(--color-warning)]">(not set on server)</span>
                ) : (
                    <span className="truncate" title={field.server ?? ""}>
                        {field.server || "(empty)"}
                    </span>
                )}
            </div>
            <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-[9px] uppercase tracking-wider text-[var(--color-warning)]">
                    client
                </span>
                {field.kind === "missingInClient" ? (
                    <span className="text-[var(--color-warning)]">(missing in client)</span>
                ) : (
                    <span className="truncate text-[var(--color-warning)]" title={field.client ?? ""}>
                        {field.client || "(empty)"}
                    </span>
                )}
            </div>
        </div>
    );
}

function driftSummary(drift: Drift): string {
    const first = drift.fields[0];
    if (!first) return "";
    const more = drift.fields.length > 1 ? ` +${drift.fields.length - 1}` : "";
    if (first.kind === "missingInClient") return `${first.label}: missing in client${more}`;
    if (first.kind === "missingOnServer") return `${first.label}: server-only${more}`;
    return `${first.label}: ${first.server} → ${first.client}${more}`;
}

function driftTooltip(drift: Drift): string {
    const lines: string[] = [];
    if (drift.subject) lines.push(drift.subject);
    if (drift.clientSource) lines.push(`source: ${drift.clientSource}`);
    if (lines.length > 0) lines.push("");
    for (const f of drift.fields.slice(0, 8)) {
        if (f.kind === "missingInClient") {
            lines.push(`${f.label}: server "${f.server ?? ""}" — missing in client`);
        } else if (f.kind === "missingOnServer") {
            lines.push(`${f.label}: missing on server — client has "${f.client ?? ""}"`);
        } else {
            lines.push(`${f.label}: server "${f.server ?? ""}" → client "${f.client ?? ""}"`);
        }
    }
    if (drift.fields.length > 8) lines.push(`… and ${drift.fields.length - 8} more`);
    return lines.join("\n");
}
