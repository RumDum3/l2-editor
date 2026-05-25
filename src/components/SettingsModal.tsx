import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { CircleCheck, X } from "lucide-react";
import { useState } from "react";
import { useSettings } from "../state/SettingsContext";
import { TIER2_DATS, isTier2AvailableIn } from "../lib/tier2Dats";

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { config, setDataRoot, setClientRoot, chronicles, chronicle, setChronicleId } = useSettings();
    if (!open) return null;

    const pickData = async () => {
        const picked = await openDialog({
            title: "Pick L2J's `data` folder (the one with stats/, xsd/, etc.)",
            directory: true,
            multiple: false,
            defaultPath: config?.dataRoot || undefined
        });
        if (typeof picked === "string") {
            await setDataRoot(picked);
        }
    };

    const pickClient = async () => {
        const picked = await openDialog({
            title: "Pick the L2 client install folder (the one with system/ inside)",
            directory: true,
            multiple: false,
            defaultPath: config?.clientRoot || undefined
        });
        if (typeof picked === "string") {
            await setClientRoot(picked);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="w-[520px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold tracking-wide">Settings</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                        aria-label="Close"
                    >
                        <X size={15} aria-hidden />
                    </button>
                </div>

                <Row label="L2J data folder">
                    <div className="flex items-center gap-2">
                        <input
                            readOnly
                            value={config?.dataRoot ?? ""}
                            placeholder="(not set)"
                            className="mono flex-1 truncate rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px]"
                        />
                        <button
                            type="button"
                            onClick={pickData}
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:border-[var(--color-accent-2)]"
                        >
                            Browse…
                        </button>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">
                        The categories sidebar resolves each plugin's folder relative to this. Point at{" "}
                        <span className="mono">dist/game/data</span>. (
                        <span className="mono">AllowedProtocolRevisions</span> is read from{" "}
                        <span className="mono">../config/Server.ini</span>.)
                    </p>
                </Row>

                <Row label="L2 client folder">
                    <div className="flex items-center gap-2">
                        <input
                            readOnly
                            value={config?.clientRoot ?? ""}
                            placeholder="(not set)"
                            className="mono flex-1 truncate rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px]"
                        />
                        <button
                            type="button"
                            onClick={pickClient}
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:border-[var(--color-accent-2)]"
                        >
                            Browse…
                        </button>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">
                        Pick the folder that contains <span className="mono">system/L2.exe</span>. Used for skill / item
                        icons, the protocol probe, and to locate the skill <span className="mono">.dat</span> files
                        below.
                    </p>
                </Row>

                <Row label="Chronicle">
                    <div className="flex items-center gap-2">
                        <select
                            value={config?.chronicleId ?? ""}
                            onChange={(e) => void setChronicleId(e.target.value || null)}
                            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text)]"
                        >
                            <option value="">
                                Auto-detect{chronicle ? ` (${chronicle.label})` : ""}
                            </option>
                            {chronicles.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.label}
                                    {c.protocol != null ? ` — proto ${c.protocol}` : ""}
                                </option>
                            ))}
                        </select>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">
                        Gates which client dats and editor fields are visible. Auto-detected from the L2.exe
                        protocol probe; override if your build doesn't match.
                    </p>
                </Row>

                <Row label="Skill data (auto-detected)">
                    <ClientSkillDataStatus />
                    <RebuildDatsButton />
                </Row>

                <Row label="Client dats by chronicle">
                    <Tier2DatChronicleList />
                </Row>
            </div>
        </div>
    );
}

function Tier2DatChronicleList() {
    const { chronicle, config, availableSchemas } = useSettings();
    const unknownChronicle = chronicle != null && availableSchemas == null;
    return (
        <div className="max-h-[180px] overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
            {unknownChronicle && (
                <div className="mb-1 px-1 text-[10px] text-[var(--color-text-faint)]">
                    No schema definition shipped for this chronicle — showing best-effort list.
                </div>
            )}
            {TIER2_DATS.map((d) => {
                const available = isTier2AvailableIn(d, chronicle, availableSchemas);
                const loaded = !!config?.tier2DatPaths?.[d.key];
                return (
                    <div
                        key={d.key}
                        className={`flex items-center gap-2 px-1 py-0.5 text-[11px] ${available ? "" : "opacity-40"}`}
                        title={available ? d.description : `Not available before chronicle ordinal ${d.minChronicle ?? 0}`}
                    >
                        <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{
                                background: !available
                                    ? "var(--color-text-faint)"
                                    : loaded
                                      ? "var(--color-success, #4ade80)"
                                      : "var(--color-warning, #f59e0b)"
                            }}
                        />
                        <span className="flex-1 truncate">{d.label}</span>
                        <span className="font-mono text-[10px] text-[var(--color-text-faint)]">
                            {!available ? "n/a" : loaded ? "loaded" : "missing"}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function ClientSkillDataStatus() {
    const { config, skillgrp, skillNames } = useSettings();

    if (skillgrp.kind === "error") {
        return <p className="text-[11px] text-[var(--color-danger)]">Skillgrp: {skillgrp.message}</p>;
    }
    if (skillNames.kind === "error") {
        return <p className="text-[11px] text-[var(--color-danger)]">SkillName: {skillNames.message}</p>;
    }
    if (skillgrp.kind === "loading" || skillNames.kind === "loading") {
        return (
            <p className="text-[11px] text-[var(--color-text-faint)]">
                Scanning <span className="mono">system/</span> for <span className="mono">Skillgrp.dat</span> /{" "}
                <span className="mono">SkillName-*.dat</span> — decrypt can take a few seconds…
            </p>
        );
    }
    if (skillgrp.kind === "done" || skillNames.kind === "done") {
        const grpName = baseName(config?.skillgrpDatPath);
        const nameName = baseName(config?.skillNamesDatPath);
        const grpRows = skillgrp.kind === "done" ? skillgrp.summary.rowCount : null;
        const nameRows = skillNames.kind === "done" ? skillNames.summary.rowCount : null;
        return (
            <p className="text-[11px] text-[var(--color-text-faint)]">
                <span className="inline-flex items-center gap-1.5">
                    <CircleCheck size={12} className="text-[var(--color-success)]" aria-hidden />
                    <span className="mono text-[var(--color-text)]">{grpName ?? "—"}</span>
                    {grpRows != null ? ` · ${grpRows.toLocaleString()} rows` : ""}
                </span>
                <br />
                <span className="inline-flex items-center gap-1.5">
                    <CircleCheck size={12} className="text-[var(--color-success)]" aria-hidden />
                    <span className="mono text-[var(--color-text)]">{nameName ?? "—"}</span>
                    {nameRows != null ? ` · ${nameRows.toLocaleString()} rows` : ""}
                </span>
            </p>
        );
    }
    return (
        <p className="text-[11px] text-[var(--color-text-faint)]">
            Set the L2 client folder above — <span className="mono">Skillgrp.dat</span> and{" "}
            <span className="mono">SkillName-*.dat</span> are then found under its <span className="mono">system/</span>{" "}
            folder and imported automatically.
        </p>
    );
}

function RebuildDatsButton() {
    const { config, rebuildClientCaches, skillgrp, skillNames } = useSettings();
    const [busy, setBusy] = useState(false);
    if (!config?.clientRoot) return null;
    const importing = skillgrp.kind === "loading" || skillNames.kind === "loading";
    return (
        <button
            type="button"
            disabled={busy || importing}
            onClick={async () => {
                setBusy(true);
                try {
                    await rebuildClientCaches();
                } finally {
                    setBusy(false);
                }
            }}
            title="Re-decrypt and re-parse Skillgrp / SkillName / tier-2 .dat files, overwriting the cached copies"
            className="mt-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] hover:border-[var(--color-accent-2)] disabled:opacity-40"
        >
            {busy || importing ? "Rebuilding caches…" : "Rebuild from .dat files"}
        </button>
    );
}

function baseName(p: string | undefined): string | null {
    if (!p) return null;
    const last = p.split(/[\\/]/).filter(Boolean).pop();
    return last ?? null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="mb-3">
            <label className="mb-1 block text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                {label}
            </label>
            {children}
        </div>
    );
}
