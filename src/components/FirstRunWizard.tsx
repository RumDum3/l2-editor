import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import {
    type ProbeState,
    type ServerProtocolsState,
    type SkillgrpState,
    type SkillNamesState,
    useSettings
} from "../state/SettingsContext";

type Step = "welcome" | "data" | "client" | "done";

export function FirstRunWizard({ onClose }: { onClose: () => void }) {
    const { config, setDataRoot, setClientRoot, serverProtocols, probe, skillgrp, skillNames } = useSettings();
    const [step, setStep] = useState<Step>("welcome");

    const [skillFiles, setSkillFiles] = useState<number | null>(null);
    useEffect(() => {
        const root = config?.dataRoot;
        if (!root) {
            setSkillFiles(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const files = await ipc.listXmlFiles(`${root.replace(/[\\/]+$/, "")}/stats/skills`);
                if (!cancelled) setSkillFiles(files.length);
            } catch {
                if (!cancelled) setSkillFiles(0);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [config?.dataRoot]);

    const pickData = async () => {
        const picked = await openDialog({
            title: "Pick L2J's `data` folder (the one with stats/, xsd/, …)",
            directory: true,
            multiple: false,
            defaultPath: config?.dataRoot || undefined
        });
        if (typeof picked === "string") await setDataRoot(picked);
    };
    const pickClient = async () => {
        const picked = await openDialog({
            title: "Pick the L2 client install folder (the one with system/L2.exe)",
            directory: true,
            multiple: false,
            defaultPath: config?.clientRoot || undefined
        });
        if (typeof picked === "string") await setClientRoot(picked);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-bg)] p-6">
            <div className="w-[600px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7 shadow-2xl">
                {step === "welcome" && <WelcomeStep onNext={() => setStep("data")} />}
                {step === "data" && (
                    <DataStep
                        path={config?.dataRoot ?? ""}
                        skillFiles={skillFiles}
                        serverProtocols={serverProtocols}
                        onPick={pickData}
                        onBack={() => setStep("welcome")}
                        onNext={() => setStep("client")}
                    />
                )}
                {step === "client" && (
                    <ClientStep
                        path={config?.clientRoot ?? ""}
                        probe={probe}
                        serverProtocols={serverProtocols}
                        skillgrp={skillgrp}
                        skillNames={skillNames}
                        onPick={pickClient}
                        onBack={() => setStep("data")}
                        onDone={() => setStep("done")}
                    />
                )}
                {step === "done" && (
                    <DoneStep
                        dataRoot={config?.dataRoot ?? ""}
                        clientRoot={config?.clientRoot ?? ""}
                        skillFiles={skillFiles}
                        probe={probe}
                        serverProtocols={serverProtocols}
                        skillgrp={skillgrp}
                        skillNames={skillNames}
                        onBack={() => setStep("client")}
                        onFinish={onClose}
                    />
                )}
            </div>
        </div>
    );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
    return (
        <div className="text-center">
            <div className="mono select-none text-[22px] font-bold tracking-[0.55em] text-[var(--color-accent)]">
                XMLEDITOR
            </div>
            <p className="mx-auto mt-5 max-w-sm text-[13px] leading-relaxed text-[var(--color-text-faint)]">
                Edit a skill once — your change syncs to the L2J server's XML <em>and</em> to the L2 client's{" "}
                <span className="mono">.dat</span> files. Two folders to point at and you're set.
            </p>
            <button
                type="button"
                onClick={onNext}
                className="mt-7 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-accent-2)] bg-[var(--color-surface-2)] px-5 py-2 text-[13px] font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            >
                Get started <ArrowRight size={14} aria-hidden />
            </button>
        </div>
    );
}

function DataStep({
    path,
    skillFiles,
    serverProtocols,
    onPick,
    onBack,
    onNext
}: {
    path: string;
    skillFiles: number | null;
    serverProtocols: ServerProtocolsState;
    onPick: () => void;
    onBack: () => void;
    onNext: () => void;
}) {
    return (
        <div>
            <StepHeader
                kicker="Step 1 of 2 · L2J server data"
                title="Where's your server's data folder?"
                dotIndex={0}
            />
            <p className="mb-4 text-[13px] leading-relaxed text-[var(--color-text-faint)]">
                The one with <span className="mono">stats/</span>, <span className="mono">xsd/</span>,{" "}
                <span className="mono">geodata/</span> inside — e.g. <span className="mono">dist/game/data</span>.
                Categories (skills, items, NPCs) resolve under it.
            </p>
            <PathPicker path={path} onPick={onPick} placeholder="(pick the data folder)" />

            {path && (
                <div className="mt-3 space-y-1.5">
                    {skillFiles == null ? (
                        <StatusLine kind="pending">
                            Checking <span className="mono">stats/skills/</span>…
                        </StatusLine>
                    ) : skillFiles > 0 ? (
                        <StatusLine kind="ok">
                            {skillFiles} skill file{skillFiles === 1 ? "" : "s"} in{" "}
                            <span className="mono">stats/skills/</span>
                        </StatusLine>
                    ) : (
                        <StatusLine kind="warn">
                            No <span className="mono">.xml</span> under <span className="mono">stats/skills/</span> —
                            double-check this is the data folder.
                        </StatusLine>
                    )}
                    {serverProtocols.kind === "loading" && (
                        <StatusLine kind="pending">
                            Reading <span className="mono">Server.ini</span>…
                        </StatusLine>
                    )}
                    {serverProtocols.kind === "done" && (
                        <StatusLine kind="ok">
                            <span className="mono">Server.ini</span> — accepts protocol
                            {serverProtocols.protocols.length === 1 ? "" : "s"}{" "}
                            <span className="text-[var(--color-text)]">{serverProtocols.protocols.join(", ")}</span>
                        </StatusLine>
                    )}
                    {serverProtocols.kind === "error" && (
                        <StatusLine kind="warn">
                            Couldn't read <span className="mono">../config/Server.ini</span> — fine if you only edit
                            data files (no client-protocol check).
                        </StatusLine>
                    )}
                </div>
            )}

            <NavRow>
                <BackBtn onClick={onBack} />
                <PrimaryBtn onClick={onNext} disabled={!path}>
                    Next <ArrowRight size={14} aria-hidden />
                </PrimaryBtn>
            </NavRow>
        </div>
    );
}

function ClientStep({
    path,
    probe,
    serverProtocols,
    skillgrp,
    skillNames,
    onPick,
    onBack,
    onDone
}: {
    path: string;
    probe: ProbeState;
    serverProtocols: ServerProtocolsState;
    skillgrp: SkillgrpState;
    skillNames: SkillNamesState;
    onPick: () => void;
    onBack: () => void;
    onDone: () => void;
}) {
    const variant =
        skillgrp.kind === "done"
            ? skillgrp.summary.meta.schemaVariant
            : skillNames.kind === "done"
              ? skillNames.summary.meta.schemaVariant
              : null;
    const mismatch =
        probe.kind === "done" && serverProtocols.kind === "done" && !serverProtocols.protocols.includes(probe.protocol)
            ? { client: probe.protocol, allowed: serverProtocols.protocols }
            : null;
    const importing = skillgrp.kind === "loading" || skillNames.kind === "loading";
    const haveSkillData = skillgrp.kind === "done" || skillNames.kind === "done";

    return (
        <div>
            <StepHeader kicker="Step 2 of 2 · L2 client (optional)" title="Point at your L2 client" dotIndex={1} />
            <p className="mb-4 text-[13px] leading-relaxed text-[var(--color-text-faint)]">
                The folder with <span className="mono">system/L2.exe</span>. The editor reads skill names, descriptions,
                icons and gameplay metadata from it — and writes your edits back to its{" "}
                <span className="mono">Skillgrp.dat</span> / <span className="mono">SkillName-*.dat</span>. Skip to edit
                server XML only; you can add this later in Settings.
            </p>
            <PathPicker path={path} onPick={onPick} placeholder="(optional — pick the L2 client folder)" />

            {path && (
                <div className="mt-3 space-y-1.5">
                    {probe.kind === "running" && <StatusLine kind="pending">Probing client protocol…</StatusLine>}
                    {probe.kind === "done" && (
                        <StatusLine kind="ok">
                            Client protocol <span className="text-[var(--color-text)]">{probe.protocol}</span>
                            {variant && (
                                <>
                                    {" · "}
                                    <span className="text-[var(--color-text)]">{variant}</span>
                                </>
                            )}
                        </StatusLine>
                    )}
                    {probe.kind === "error" && (
                        <StatusLine kind="warn">Protocol probe failed — {probe.message}</StatusLine>
                    )}

                    {importing && (
                        <StatusLine kind="pending">
                            Scanning <span className="mono">system/</span> for skill data — decrypt can take a few
                            seconds…
                        </StatusLine>
                    )}
                    {!importing && haveSkillData && (
                        <StatusLine kind="ok">
                            Skill data imported —{" "}
                            {skillgrp.kind === "done" && (
                                <span className="text-[var(--color-text)]">
                                    Skillgrp ({skillgrp.summary.rowCount.toLocaleString()})
                                </span>
                            )}
                            {skillgrp.kind === "done" && skillNames.kind === "done" && " · "}
                            {skillNames.kind === "done" && (
                                <span className="text-[var(--color-text)]">
                                    SkillName ({skillNames.summary.rowCount.toLocaleString()})
                                </span>
                            )}
                        </StatusLine>
                    )}
                    {skillgrp.kind === "error" && (
                        <StatusLine kind="warn">Skillgrp import failed — {skillgrp.message}</StatusLine>
                    )}
                    {skillNames.kind === "error" && (
                        <StatusLine kind="warn">SkillName import failed — {skillNames.message}</StatusLine>
                    )}

                    {mismatch && (
                        <StatusLine kind="danger">
                            Client protocol {mismatch.client} isn't in the server's allowed list [
                            {mismatch.allowed.join(", ")}] — players on this client won't connect. Worth aligning before
                            you go live.
                        </StatusLine>
                    )}
                </div>
            )}

            <NavRow>
                <BackBtn onClick={onBack} />
                <PrimaryBtn onClick={onDone}>
                    {path ? "Finish" : "Skip for now"} <ArrowRight size={14} aria-hidden />
                </PrimaryBtn>
            </NavRow>
        </div>
    );
}

function DoneStep({
    dataRoot,
    clientRoot,
    skillFiles,
    probe,
    serverProtocols,
    skillgrp,
    skillNames,
    onBack,
    onFinish
}: {
    dataRoot: string;
    clientRoot: string;
    skillFiles: number | null;
    probe: ProbeState;
    serverProtocols: ServerProtocolsState;
    skillgrp: SkillgrpState;
    skillNames: SkillNamesState;
    onBack: () => void;
    onFinish: () => void;
}) {
    const variant =
        skillgrp.kind === "done"
            ? skillgrp.summary.meta.schemaVariant
            : skillNames.kind === "done"
              ? skillNames.summary.meta.schemaVariant
              : null;
    const mismatch =
        probe.kind === "done" && serverProtocols.kind === "done" && !serverProtocols.protocols.includes(probe.protocol);
    const importing = skillgrp.kind === "loading" || skillNames.kind === "loading";
    const haveSkillData = skillgrp.kind === "done" || skillNames.kind === "done";
    const hasClient = !!clientRoot;

    return (
        <div>
            <StepHeader kicker="Setup complete" title="You're all set." />
            <div className="space-y-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
                <SummaryRow label="Server data" ok>
                    <span className="mono truncate text-[var(--color-text)]" title={dataRoot}>
                        {dataRoot}
                    </span>
                    {skillFiles != null && skillFiles > 0 && (
                        <span className="text-[var(--color-text-faint)]"> · {skillFiles} skill files</span>
                    )}
                </SummaryRow>
                <SummaryRow label="Server proto" ok={serverProtocols.kind === "done"}>
                    {serverProtocols.kind === "done" ? (
                        <span className="mono text-[var(--color-text)]">{serverProtocols.protocols.join(", ")}</span>
                    ) : (
                        <span className="text-[var(--color-text-faint)]">not detected (no Server.ini)</span>
                    )}
                </SummaryRow>
                <SummaryRow label="L2 client" ok={hasClient}>
                    {hasClient ? (
                        <span className="mono truncate text-[var(--color-text)]" title={clientRoot}>
                            {clientRoot}
                        </span>
                    ) : (
                        <span className="text-[var(--color-text-faint)]">
                            not configured — server XML editing only (add it later in Settings)
                        </span>
                    )}
                </SummaryRow>
                {hasClient && (
                    <SummaryRow label="Client proto" ok={probe.kind === "done" && !mismatch} warn={mismatch}>
                        {probe.kind === "done" ? (
                            <>
                                <span className="mono text-[var(--color-text)]">{probe.protocol}</span>
                                {variant && <span className="text-[var(--color-text-faint)]"> · {variant}</span>}
                                {mismatch && (
                                    <span className="text-[var(--color-danger)]">
                                        {" "}
                                        — not in the server's allowed list
                                    </span>
                                )}
                            </>
                        ) : probe.kind === "running" ? (
                            <span className="text-[var(--color-text-faint)]">probing…</span>
                        ) : (
                            <span className="text-[var(--color-text-faint)]">probe unavailable</span>
                        )}
                    </SummaryRow>
                )}
                {hasClient && (
                    <SummaryRow label="Skill data" ok={!importing && haveSkillData}>
                        {importing ? (
                            <span className="text-[var(--color-text-faint)]">
                                importing… (continues in the background)
                            </span>
                        ) : haveSkillData ? (
                            <span className="text-[var(--color-text-faint)]">
                                {skillgrp.kind === "done" && (
                                    <span className="text-[var(--color-text)]">
                                        Skillgrp {skillgrp.summary.rowCount.toLocaleString()}
                                    </span>
                                )}
                                {skillgrp.kind === "done" && skillNames.kind === "done" && " · "}
                                {skillNames.kind === "done" && (
                                    <span className="text-[var(--color-text)]">
                                        SkillName {skillNames.summary.rowCount.toLocaleString()}
                                    </span>
                                )}
                            </span>
                        ) : (
                            <span className="text-[var(--color-text-faint)]">not loaded</span>
                        )}
                    </SummaryRow>
                )}
            </div>

            <NavRow>
                <BackBtn onClick={onBack} />
                <PrimaryBtn onClick={onFinish}>
                    Open the editor <ArrowRight size={14} aria-hidden />
                </PrimaryBtn>
            </NavRow>
        </div>
    );
}

function StepHeader({ kicker, title, dotIndex }: { kicker: string; title: string; dotIndex?: number }) {
    return (
        <div className="mb-5">
            <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-text-faint)]">{kicker}</span>
                {dotIndex != null && (
                    <span className="flex gap-1.5">
                        {[0, 1].map((i) => (
                            <span
                                key={i}
                                className={`h-1.5 w-1.5 rounded-full ${i === dotIndex ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"}`}
                            />
                        ))}
                    </span>
                )}
            </div>
            <h2 className="mt-2 text-[17px] font-semibold text-[var(--color-text)]">{title}</h2>
        </div>
    );
}

function PathPicker({ path, onPick, placeholder }: { path: string; onPick: () => void; placeholder: string }) {
    return (
        <div className="flex items-center gap-2">
            <input
                readOnly
                value={path}
                placeholder={placeholder}
                className="mono flex-1 truncate rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-[12px]"
            />
            <button
                type="button"
                onClick={onPick}
                className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs hover:border-[var(--color-accent-2)]"
            >
                Browse…
            </button>
        </div>
    );
}

function NavRow({ children }: { children: React.ReactNode }) {
    return <div className="mt-7 flex items-center justify-between gap-2">{children}</div>;
}

function BackBtn({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-text)]"
        >
            <ArrowLeft size={13} aria-hidden /> Back
        </button>
    );
}

function PrimaryBtn({
    onClick,
    disabled,
    children
}: {
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-accent-2)] bg-[var(--color-surface-2)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-40"
        >
            {children}
        </button>
    );
}

type StatusKind = "ok" | "warn" | "danger" | "pending";

function StatusLine({ kind, children }: { kind: StatusKind; children: React.ReactNode }) {
    const icon =
        kind === "ok" ? (
            <Check size={13} className="text-[var(--color-success)]" aria-hidden />
        ) : kind === "warn" ? (
            <AlertTriangle size={13} className="text-[var(--color-warning)]" aria-hidden />
        ) : kind === "danger" ? (
            <AlertTriangle size={13} className="text-[var(--color-danger)]" aria-hidden />
        ) : (
            <span
                className="mt-px inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-text-faint)] border-t-[var(--color-accent-2)]"
                aria-hidden
            />
        );
    const tone =
        kind === "warn"
            ? "text-[var(--color-warning)]"
            : kind === "danger"
              ? "text-[var(--color-danger)]"
              : "text-[var(--color-text-faint)]";
    return (
        <div className={`flex items-start gap-2 text-[12px] ${tone}`}>
            <span className="shrink-0">{icon}</span>
            <span className="min-w-0">{children}</span>
        </div>
    );
}

function SummaryRow({
    label,
    ok,
    warn,
    children
}: {
    label: string;
    ok?: boolean;
    warn?: boolean;
    children: React.ReactNode;
}) {
    const icon = warn ? (
        <AlertTriangle size={12} className="text-[var(--color-warning)]" aria-hidden />
    ) : ok ? (
        <Check size={12} className="text-[var(--color-success)]" aria-hidden />
    ) : (
        <span className="text-[var(--color-text-faint)]">·</span>
    );
    return (
        <div className="flex items-baseline gap-3 text-[12px]">
            <span className="flex w-4 shrink-0 justify-center">{icon}</span>
            <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                {label}
            </span>
            <span className="min-w-0 flex-1 truncate">{children}</span>
        </div>
    );
}
