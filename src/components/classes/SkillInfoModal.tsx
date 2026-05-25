import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { operateTypeLabel, type SkillBrief } from "../../classes/skillCatalog";
import { type ClientSkillRow, ipc, type SkillnameRow } from "../../lib/ipc";
import { pickCanonicalSkillname } from "../../lib/skillNameRowCache";
import { formatSkillText } from "../../lib/skillText";
import { useSettings } from "../../state/SettingsContext";
import { DriftBanner } from "../Drift";
import { TextureImage } from "../TextureImage";

function ms(v: number | null | undefined): string | null {
    if (v == null) return null;
    return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}s` : `${v}ms`;
}

export function SkillInfoModal({
    id,
    catalog,
    onClose,
    onOpenInEditor
}: {
    id: number | null;
    catalog: Map<number, SkillBrief> | null;
    onClose: () => void;
    onOpenInEditor?: (id: number) => void;
}) {
    const { config } = useSettings();
    const brief = id != null ? (catalog?.get(id) ?? null) : null;

    const [clientDesc, setClientDesc] = useState<string | null>(null);
    const [clientReuseSec, setClientReuseSec] = useState<number | null>(null);
    const [clientName, setClientName] = useState<string | null>(null);
    const [fetched, setFetched] = useState(false);

    useEffect(() => {
        if (id == null) return;
        setFetched(false);
        setClientDesc(null);
        setClientReuseSec(null);
        setClientName(null);
        let cancelled = false;
        (async () => {
            try {
                const [names, rows] = await Promise.all([
                    ipc.lookupSkillnameRows([id]).catch(() => ({}) as Record<number, SkillnameRow[]>),
                    ipc.lookupSkillRows([id]).catch(() => ({}) as Record<number, ClientSkillRow[]>)
                ]);
                if (cancelled) return;
                const nr = pickCanonicalSkillname(names[id]);
                if (nr) {
                    setClientName(nr.name ?? null);
                    if (nr.desc) setClientDesc(formatSkillText(nr.desc, nr.desc_param ?? "", "block"));
                }
                const grRows = rows[id] ?? [];
                const gr = grRows.find((r) => r.skill_level === 1 && (r.skill_sublevel ?? 0) === 0) ?? grRows[0];
                if (gr && typeof gr.reuse_delay === "number") setClientReuseSec(gr.reuse_delay);
            } finally {
                if (!cancelled) setFetched(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id]);

    useEffect(() => {
        if (id == null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [id, onClose]);

    if (id == null) return null;
    const name = brief?.name ?? clientName ?? `Skill ${id}`;
    const reuseTxt =
        clientReuseSec != null && clientReuseSec > 0
            ? `${clientReuseSec >= 1 && clientReuseSec % 1 === 0 ? clientReuseSec : clientReuseSec.toFixed(1)}s`
            : ms(brief?.reuseDelayMs ?? null);
    const nameMismatch = !!brief && !!clientName && brief.name !== clientName;

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-dismiss is a standard modal affordance
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
            <div
                className="w-[440px] max-w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-4 py-3">
                    {brief?.icon && config?.clientRoot ? (
                        <TextureImage
                            file={brief.icon}
                            size={36}
                            className="h-9 w-9 shrink-0 rounded border border-[var(--color-border)]"
                        />
                    ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[8px] text-[var(--color-text-faint)]">
                            no icon
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-[var(--color-accent)]">{name}</div>
                        <div className="mono text-[11px] text-[var(--color-text-faint)]">
                            id {id}
                            {brief && brief.toLevel > 1 && ` · ${brief.toLevel} levels`}
                            {!brief && " · not in stats/skills/"}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                    >
                        <X size={15} aria-hidden />
                    </button>
                </div>

                <div className="space-y-3 px-4 py-3">
                    {nameMismatch && (
                        <DriftBanner
                            drift={{
                                subject: `skill #${id}`,
                                clientSource: "SkillName.dat",
                                fields: [
                                    {
                                        label: "name",
                                        server: brief?.name ?? null,
                                        client: clientName,
                                        kind: "mismatch"
                                    }
                                ]
                            }}
                            title="server name disagrees with client"
                        />
                    )}

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                        <Stat label="type" value={brief ? operateTypeLabel(brief.operateType) : "—"} />
                        <Stat label="reuse" value={reuseTxt ?? "—"} />
                        <Stat label="cast time" value={ms(brief?.hitTimeMs ?? null) ?? "—"} />
                        <Stat
                            label="magic"
                            value={
                                brief?.isMagic === "1"
                                    ? "magic"
                                    : brief?.isMagic === "2"
                                      ? "static"
                                      : brief?.isMagic === "0"
                                        ? "physical"
                                        : "—"
                            }
                        />
                        <Stat label="mp" value={brief?.mpConsume ?? "—"} />
                        <Stat label="range" value={brief?.castRange ?? "—"} />
                    </div>

                    <div>
                        <div className="mb-0.5 text-[9px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                            description
                        </div>
                        {clientDesc ? (
                            <p className="whitespace-pre-wrap rounded border border-[var(--color-border)]/40 bg-[var(--color-surface-2)]/30 px-2 py-1.5 text-[11px] leading-relaxed">
                                {clientDesc}
                            </p>
                        ) : (
                            <p className="text-[11px] text-[var(--color-text-faint)]">
                                {fetched
                                    ? "No client description — SkillName.dat isn't loaded (set the L2 client folder in Settings) or this id has no row."
                                    : "Loading…"}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2">
                    <span className="text-[10px] text-[var(--color-text-faint)]">
                        from <span className="mono">stats/skills/</span>
                        {clientDesc != null && <> · description from SkillName.dat</>}
                    </span>
                    {onOpenInEditor && (
                        <button
                            type="button"
                            onClick={() => onOpenInEditor(id)}
                            className="inline-flex items-center gap-1 rounded border border-[var(--color-accent-2)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                            title="Open this skill in the Skills editor (full edit + all fields)"
                        >
                            Open in Skills editor <ArrowUpRight size={13} aria-hidden />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline gap-2">
            <span className="w-16 shrink-0 text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
                {label}
            </span>
            <span className="mono truncate text-[var(--color-text)]" title={value}>
                {value}
            </span>
        </div>
    );
}
