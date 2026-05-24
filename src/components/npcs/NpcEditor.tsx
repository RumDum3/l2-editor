import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type SkillBrief, useSkillCatalog, operateTypeLabel } from "../../classes/skillCatalog";
import { ipc, type SpawnPoint } from "../../lib/ipc";
import { logger } from "../../lib/logger";
import {
    AI_TYPES,
    ATTRIBUTE_ELEMENTS,
    MP_REWARD_AFFECTS,
    MP_REWARD_TYPES,
    NPC_TYPES,
    RACES,
    SEXES,
    WEAPON_TYPES
} from "../../lib/npcEnums";
import { regionOf } from "../../lib/worldCoords";
import { useSettings } from "../../state/SettingsContext";
import { SkillInspectorProvider, useInspectSkill } from "../classes/SkillInspector";
import { NpcModelViewport } from "./NpcModelViewport";

interface Props {
    npcId: number;
    filePath: string;
    spawns: SpawnPoint[];
    bosses: Array<{ npcId: number; x: number; y: number; respawn: string }>;
    onSavedNameTitle: (id: number, name: string, title: string) => void;
    onRegisterCommit: (commit: (() => Promise<void>) | null) => void;
    onRegisterUndoRedo: (undo: () => void, redo: () => void, canUndo: boolean, canRedo: boolean) => void;
    onDirtyChange: (dirty: boolean) => void;
    onOpenSkill?: (skillId: number) => void;
}

type Tab =
    | "identity"
    | "model"
    | "stats"
    | "status"
    | "ai"
    | "skills"
    | "drops"
    | "fakePlayer"
    | "parameters"
    | "equipment"
    | "rewards"
    | "collision"
    | "misc"
    | "spawns";

const TABS: { id: Tab; label: string }[] = [
    { id: "identity", label: "Identity" },
    { id: "model", label: "Model" },
    { id: "stats", label: "Stats" },
    { id: "status", label: "Status" },
    { id: "ai", label: "AI" },
    { id: "skills", label: "Skills" },
    { id: "drops", label: "Drops" },
    { id: "fakePlayer", label: "Fake Player" },
    { id: "parameters", label: "Parameters" },
    { id: "equipment", label: "Equipment" },
    { id: "rewards", label: "Rewards" },
    { id: "collision", label: "Collision" },
    { id: "misc", label: "Misc" },
    { id: "spawns", label: "Spawns" }
];

export function NpcEditor(props: Props) {
    const { config } = useSettings();
    const skillCatalog = useSkillCatalog(config?.dataRoot ?? null);
    return (
        <SkillInspectorProvider catalog={skillCatalog} onOpenSkill={props.onOpenSkill}>
            <NpcEditorInner {...props} skillCatalog={skillCatalog} />
        </SkillInspectorProvider>
    );
}

function NpcEditorInner({
    npcId,
    filePath,
    spawns,
    bosses,
    onSavedNameTitle,
    onRegisterCommit,
    onRegisterUndoRedo,
    onDirtyChange,
    skillCatalog
}: Props & { skillCatalog: Map<number, SkillBrief> | null }) {
    const [doc, setDoc] = useState<Document | null>(null);
    const [npcEl, setNpcEl] = useState<Element | null>(null);
    const [tab, setTab] = useState<Tab>("identity");
    const [revision, bump] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const [history, setHistory] = useState<{ snapshots: string[]; idx: number }>(() => ({
        snapshots: [],
        idx: -1
    }));
    const canUndo = history.idx > 0;
    const canRedo = history.idx >= 0 && history.idx < history.snapshots.length - 1;

    useEffect(() => {
        onDirtyChange(dirty);
    }, [dirty, onDirtyChange]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setDirty(false);
        (async () => {
            try {
                const xml = await ipc.loadNpcXml(filePath, npcId);
                if (cancelled) return;
                const parser = new DOMParser();
                const parsed = parser.parseFromString(`<root>${xml}</root>`, "text/xml");
                const err = parsed.querySelector("parsererror");
                if (err) throw new Error(err.textContent ?? "xml parse failed");
                const el = parsed.querySelector("npc");
                if (!el) throw new Error("no <npc> element");
                setDoc(parsed);
                setNpcEl(el);
                setHistory({ snapshots: [serializeNpc(el)], idx: 0 });
                bump((r) => r + 1);
            } catch (e) {
                if (!cancelled) setError(String(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [filePath, npcId]);

    const mutate = useCallback(
        (fn: (npc: Element) => void) => {
            if (!npcEl) return;
            fn(npcEl);
            setDirty(true);
            setHistory((h) => {
                const next = h.snapshots.slice(0, h.idx + 1);
                next.push(serializeNpc(npcEl));
                return { snapshots: next, idx: next.length - 1 };
            });
            bump((r) => r + 1);
        },
        [npcEl]
    );

    const undo = useCallback(() => {
        setHistory((h) => {
            if (h.idx <= 0 || !doc) return h;
            const prev = h.idx - 1;
            const restored = parseNpcSnapshot(h.snapshots[prev], doc);
            if (restored) {
                setNpcEl(restored);
                setDirty(prev !== 0);
                bump((r) => r + 1);
            }
            return { ...h, idx: prev };
        });
    }, [doc]);

    const redo = useCallback(() => {
        setHistory((h) => {
            if (h.idx >= h.snapshots.length - 1 || !doc) return h;
            const nx = h.idx + 1;
            const restored = parseNpcSnapshot(h.snapshots[nx], doc);
            if (restored) {
                setNpcEl(restored);
                setDirty(true);
                bump((r) => r + 1);
            }
            return { ...h, idx: nx };
        });
    }, [doc]);

    const commit = useCallback(async () => {
        if (!npcEl) return;
        const xml = formatNpc(npcEl);
        await ipc.saveNpcXml(filePath, npcId, xml);
        logger.info("npc", `wrote npc ${npcId} to ${filePath}`);
        const name = npcEl.getAttribute("name") ?? "";
        const title = npcEl.getAttribute("title") ?? "";
        onSavedNameTitle(npcId, name, title);
        setDirty(false);
        setHistory({ snapshots: [serializeNpc(npcEl)], idx: 0 });
    }, [npcEl, filePath, npcId, onSavedNameTitle]);

    const commitRef = useRef(commit);
    commitRef.current = commit;
    useEffect(() => {
        onRegisterCommit(() => commitRef.current());
        return () => onRegisterCommit(null);
    }, [onRegisterCommit]);

    const undoRef = useRef(undo);
    const redoRef = useRef(redo);
    undoRef.current = undo;
    redoRef.current = redo;
    useEffect(() => {
        onRegisterUndoRedo(
            () => undoRef.current(),
            () => redoRef.current(),
            canUndo,
            canRedo
        );
    }, [canUndo, canRedo, onRegisterUndoRedo]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            const tg = t?.tagName;
            const inEditable = tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT" || t?.isContentEditable === true;
            if (inEditable) return;
            const mod = e.ctrlKey || e.metaKey;
            if (!mod) return;
            const k = e.key.toLowerCase();
            if (k === "z" && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if ((k === "z" && e.shiftKey) || k === "y") {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [undo, redo]);

    if (loading)
        return (
            <Placeholder>
                Loading {basename(filePath)} #{npcId}…
            </Placeholder>
        );
    if (error)
        return (
            <div className="p-6 text-[12px] text-[var(--color-danger)]">
                Couldn't load #{npcId}: {error}
            </div>
        );
    if (!npcEl) return <Placeholder>NPC not found.</Placeholder>;

    return (
        <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
                <span className="font-mono text-[10px] text-[var(--color-text-faint)]">#{npcId}</span>
                <span className="font-mono text-[12px]">{npcEl.getAttribute("name") || "(unnamed)"}</span>
                <span className="ml-auto font-mono text-[10px] text-[var(--color-text-faint)]" title={filePath}>
                    {basename(filePath)}
                </span>
                {dirty && (
                    <span className="rounded border border-[var(--color-accent-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-accent)]">
                        unsaved
                    </span>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`shrink-0 border-b-2 px-3 py-1.5 text-[11px] ${
                            tab === t.id
                                ? "border-[var(--color-accent-2)] text-[var(--color-accent)]"
                                : "border-transparent text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-[12px]">
                <TabBody
                    tab={tab}
                    npc={npcEl}
                    npcId={npcId}
                    mutate={mutate}
                    revision={revision}
                    spawns={spawns}
                    bosses={bosses}
                    skillCatalog={skillCatalog}
                />
            </div>
        </div>
    );
}

function TabBody({
    tab,
    npc,
    npcId,
    mutate,
    revision,
    spawns,
    bosses,
    skillCatalog
}: {
    tab: Tab;
    npc: Element;
    npcId: number;
    mutate: (fn: (npc: Element) => void) => void;
    revision: number;
    spawns: SpawnPoint[];
    bosses: Array<{ npcId: number; x: number; y: number; respawn: string }>;
    skillCatalog: Map<number, SkillBrief> | null;
}) {
    const ctx = useMemo(() => ({ npc, mutate }), [npc, mutate, revision]);
    switch (tab) {
        case "identity":
            return <IdentityTab {...ctx} />;
        case "model":
            return <ModelTab npcId={npcId} />;
        case "stats":
            return <StatsTab {...ctx} />;
        case "status":
            return <StatusTab {...ctx} />;
        case "ai":
            return <AiTab {...ctx} />;
        case "skills":
            return <SkillsTab {...ctx} catalog={skillCatalog} />;
        case "drops":
            return <DropsTab {...ctx} />;
        case "fakePlayer":
            return <FakePlayerTab {...ctx} />;
        case "parameters":
            return <ParametersTab {...ctx} />;
        case "equipment":
            return <EquipmentTab {...ctx} />;
        case "rewards":
            return <RewardsTab {...ctx} />;
        case "collision":
            return <CollisionTab {...ctx} />;
        case "misc":
            return <MiscTab {...ctx} />;
        case "spawns":
            return <SpawnsTab spawns={spawns} bosses={bosses} />;
    }
}

function ModelTab({ npcId }: { npcId: number }) {
    const { config } = useSettings();
    const clientRoot = config?.clientRoot ?? "";
    const [resolving, setResolving] = useState(false);
    const [resolved, setResolved] = useState<Awaited<ReturnType<typeof ipc.resolveNpcModel>> | null>(null);
    const [resolveError, setResolveError] = useState<string | null>(null);
    const [meshName, setMeshName] = useState<string | null>(null);
    const [meshNameMissing, setMeshNameMissing] = useState(false);
    const [autoMesh, setAutoMesh] = useState<Awaited<ReturnType<typeof ipc.loadSkeletalMesh>> | null>(null);
    const [autoMeshError, setAutoMeshError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setResolved(null);
        setResolveError(null);
        setMeshName(null);
        setMeshNameMissing(false);
        setAutoMesh(null);
        setAutoMeshError(null);
        if (!clientRoot || !npcId) return;
        (async () => {
            setResolving(true);
            try {
                const rows = await ipc.lookupGenericRows("npc_grp", [npcId]);
                if (cancelled) return;
                const row = rows[npcId]?.[0];
                if (!row) {
                    setMeshNameMissing(true);
                    return;
                }
                const mn = typeof row["mesh_name"] === "string" ? (row["mesh_name"] as string) : "";
                if (!mn) {
                    setMeshNameMissing(true);
                    return;
                }
                setMeshName(mn);
                const r = await ipc.resolveNpcModel(clientRoot, mn);
                if (cancelled) return;
                setResolved(r);
                // Eagerly decode the mesh so the viewport has something to draw.
                if (r.status === "ok") {
                    try {
                        const m = await ipc.loadSkeletalMesh(clientRoot, mn);
                        if (!cancelled) setAutoMesh(m);
                    } catch (e) {
                        if (!cancelled) setAutoMeshError(String(e));
                    }
                }
            } catch (e) {
                if (!cancelled) setResolveError(String(e));
            } finally {
                if (!cancelled) setResolving(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [clientRoot, npcId]);

    const [pkgPath, setPkgPath] = useState(() =>
        clientRoot ? `${clientRoot.replace(/[\\/]+$/, "")}\\Animations\\LineageNpcs.ukx` : ""
    );
    const [busy, setBusy] = useState(false);
    const [summary, setSummary] = useState<Awaited<ReturnType<typeof ipc.dumpPackage>> | null>(null);
    const [filteredExports, setFilteredExports] = useState<
        Awaited<ReturnType<typeof ipc.listPackageExports>> | null
    >(null);
    const [classFilter, setClassFilter] = useState("SkeletalMesh");
    const [error, setError] = useState<string | null>(null);

    const run = async () => {
        if (!pkgPath || busy) return;
        setBusy(true);
        setError(null);
        try {
            const s = await ipc.dumpPackage(pkgPath, 12);
            setSummary(s);
            setFilteredExports(null);
        } catch (e) {
            setError(String(e));
            setSummary(null);
        } finally {
            setBusy(false);
        }
    };

    const runFilter = async () => {
        if (!pkgPath || busy) return;
        setBusy(true);
        try {
            const list = await ipc.listPackageExports(pkgPath, classFilter || undefined, 200);
            setFilteredExports(list);
        } catch (e) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex h-full min-h-[420px] flex-col gap-3">
            <div
                className="relative flex flex-1 items-center justify-center overflow-hidden rounded border border-[var(--color-border)] bg-black/40"
                data-npc-model-viewport
            >
                {autoMesh ? (
                    <NpcModelViewport mesh={autoMesh} />
                ) : autoMeshError ? (
                    <div className="p-4 text-[11px] text-[var(--color-danger)]">
                        Decode failed: {autoMeshError}
                    </div>
                ) : resolving ? (
                    <div className="text-[11px] text-[var(--color-text-faint)]">resolving model…</div>
                ) : meshNameMissing ? (
                    <div className="text-[11px] text-[var(--color-text-faint)]">
                        No client model for this NPC.
                    </div>
                ) : (
                    <div className="text-[11px] text-[var(--color-text-faint)]">
                        no mesh loaded yet
                    </div>
                )}
                {autoMesh && (
                    <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-[var(--color-text-faint)]">
                        {(autoMesh.positions.length / 3).toLocaleString()} verts — drag to orbit, scroll to zoom
                    </div>
                )}
            </div>
            <ResolvedModelPanel
                npcId={npcId}
                clientRoot={clientRoot}
                resolving={resolving}
                resolved={resolved}
                resolveError={resolveError}
                meshName={meshName}
                meshNameMissing={meshNameMissing}
            />
            <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <div className="mb-2 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                        package reader · dev probe
                    </span>
                    <span className="text-[10px] text-[var(--color-text-faint)]">
                        (phase 1 — verify the UE2 parser works on your client)
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        className={`${INP} flex-1`}
                        placeholder="path to a .ukx / .utx / .usx / .unr"
                        value={pkgPath}
                        onChange={(e) => setPkgPath(e.target.value)}
                    />
                    <button
                        type="button"
                        onClick={run}
                        disabled={busy || !pkgPath}
                        className={`${ADD_BTN} ${busy ? "opacity-50" : ""}`}
                    >
                        {busy ? "parsing…" : "parse"}
                    </button>
                </div>
                {error && (
                    <div className="mt-2 rounded border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-2 text-[11px] text-[var(--color-danger)]">
                        {error}
                    </div>
                )}
                {summary && (
                    <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
                        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                            list exports of class
                        </span>
                        <input
                            className={`${INP} w-40`}
                            value={classFilter}
                            onChange={(e) => setClassFilter(e.target.value)}
                            placeholder="SkeletalMesh"
                        />
                        <button type="button" onClick={runFilter} className={ADD_BTN} disabled={busy}>
                            list
                        </button>
                    </div>
                )}
                {filteredExports && (
                    <div className="mt-2 max-h-[260px] overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 font-mono text-[11px]">
                        <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                            {filteredExports.length} exports — click to copy full name
                        </div>
                        {filteredExports.map((e) => (
                            <button
                                key={`${e.fullName}@${e.serialOffset}`}
                                type="button"
                                onClick={() => {
                                    void navigator.clipboard.writeText(e.fullName);
                                }}
                                className="flex w-full items-center gap-2 px-1 py-0.5 text-left hover:bg-white/5"
                                title="Click to copy full name"
                            >
                                <span className="truncate">{e.fullName}</span>
                                <span className="ml-auto shrink-0 text-[var(--color-text-faint)]">
                                    {(e.serialSize / 1024).toFixed(1)} KB @ {e.serialOffset}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                {summary && (
                    <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                        <div>
                            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                                header
                            </div>
                            <div className="font-mono">cipher: {summary.cipherCode || "(plaintext)"}</div>
                            <div className="font-mono">
                                version: {summary.version} / licensee {summary.licenseeVersion}
                            </div>
                            <div className="font-mono">names: {summary.nameCount}</div>
                            <div className="font-mono">imports: {summary.importCount}</div>
                            <div className="font-mono">exports: {summary.exportCount}</div>
                        </div>
                        <div>
                            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                                export class histogram
                            </div>
                            <div className="max-h-[140px] overflow-y-auto font-mono">
                                {summary.exportClassHistogram.map(([cls, n]) => (
                                    <div key={cls} className="flex justify-between gap-3">
                                        <span className="truncate">{cls}</span>
                                        <span className="text-[var(--color-text-faint)]">{n}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="col-span-2">
                            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                                first {summary.exportsSample.length} exports
                            </div>
                            <div className="font-mono">
                                {summary.exportsSample.map((e, i) => (
                                    <div key={i} className="flex gap-2">
                                        <span className="w-20 shrink-0 text-[var(--color-accent-2)]">
                                            {e.className}
                                        </span>
                                        <span className="truncate">{e.fullName}</span>
                                        <span className="ml-auto shrink-0 text-[var(--color-text-faint)]">
                                            {e.serialSize} B @ {e.serialOffset}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function ResolvedModelPanel({
    npcId,
    clientRoot,
    resolving,
    resolved,
    resolveError,
    meshName,
    meshNameMissing
}: {
    npcId: number;
    clientRoot: string;
    resolving: boolean;
    resolved: Awaited<ReturnType<typeof ipc.resolveNpcModel>> | null;
    resolveError: string | null;
    meshName: string | null;
    meshNameMissing: boolean;
}) {
    const [meshLoading, setMeshLoading] = useState(false);
    const [mesh, setMesh] = useState<Awaited<ReturnType<typeof ipc.loadSkeletalMesh>> | null>(null);
    const [meshError, setMeshError] = useState<string | null>(null);
    const [hexDump, setHexDump] = useState<Awaited<ReturnType<typeof ipc.dumpMeshPayload>> | null>(null);
    const [dumpView, setDumpView] = useState<"hex" | "u32" | "f32">("hex");

    useEffect(() => {
        setMesh(null);
        setMeshError(null);
        setHexDump(null);
    }, [resolved?.export?.fullName]);

    const loadMesh = async () => {
        if (!meshName || meshLoading) return;
        setMeshLoading(true);
        setMeshError(null);
        try {
            const m = await ipc.loadSkeletalMesh(clientRoot, meshName);
            setMesh(m);
        } catch (e) {
            setMeshError(String(e));
        } finally {
            setMeshLoading(false);
        }
    };

    const dumpPayload = async (offsetAfterProps = 0) => {
        if (!meshName) return;
        try {
            const d = await ipc.dumpMeshPayload(clientRoot, meshName, 256, offsetAfterProps);
            setHexDump(d);
        } catch (e) {
            setMeshError(String(e));
        }
    };
    const dumpAfterPositions = async () => {
        if (!mesh) return;
        // 8 byte header (version + count) + vertex_count × 6 bytes
        const offset = 8 + (mesh.positions.length / 3) * 6;
        await dumpPayloadAt(offset, 1024);
    };
    const dumpPayloadAt = async (offsetAfterProps: number, nbytes = 1024) => {
        if (!meshName) return;
        try {
            const d = await ipc.dumpMeshPayload(clientRoot, meshName, nbytes, offsetAfterProps);
            setHexDump(d);
        } catch (e) {
            setMeshError(String(e));
        }
    };
    const [manualOffset, setManualOffset] = useState("");
    const [manualSize, setManualSize] = useState("512");
    if (!clientRoot) {
        return (
            <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[11px] text-[var(--color-text-faint)]">
                Set the client folder in Settings to look up this NPC's model.
            </div>
        );
    }
    return (
        <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-2 flex items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                    npc #{npcId} → model
                </span>
                {resolving && <span className="text-[10px] text-[var(--color-text-faint)]">resolving…</span>}
            </div>
            {meshNameMissing && (
                <div className="text-[11px] text-[var(--color-text-faint)]">
                    No NpcGrp.dat row for this id, or no mesh_name field — can't auto-resolve. Either
                    NpcGrp isn't loaded, or this NPC has no client-side mesh assigned.
                </div>
            )}
            {meshName && resolved && (
                <div className="space-y-1.5 text-[11px]">
                    <KV k="mesh_name" v={meshName} mono />
                    <KV k="package" v={resolved.packagePath ?? "(not found)"} mono />
                    <KV
                        k="export"
                        v={
                            resolved.export
                                ? `${resolved.export.className} ${resolved.export.fullName}`
                                : `not found in package`
                        }
                        mono
                    />
                    {resolved.export && (
                        <KV
                            k="bytes"
                            v={`${resolved.export.serialSize.toLocaleString()} @ offset ${resolved.export.serialOffset.toLocaleString()}`}
                            mono
                        />
                    )}
                    {resolved.packageVersion != null && (
                        <KV
                            k="pkg version"
                            v={`${resolved.packageVersion} / licensee ${resolved.packageLicenseeVersion ?? "?"}`}
                            mono
                        />
                    )}
                    <div className="flex items-center gap-2 pt-1">
                        <StatusPill status={resolved.status} detail={resolved.detail} />
                        {resolved.status === "ok" && (
                            <>
                                <button
                                    type="button"
                                    onClick={loadMesh}
                                    disabled={meshLoading}
                                    className={`${ADD_BTN} ${meshLoading ? "opacity-50" : ""}`}
                                >
                                    {meshLoading ? "decoding…" : mesh ? "re-decode" : "decode mesh"}
                                </button>
                                <button type="button" onClick={() => dumpPayload(0)} className={ADD_BTN}>
                                    dump after props
                                </button>
                                {mesh && (
                                    <button type="button" onClick={dumpAfterPositions} className={ADD_BTN}>
                                        dump after positions (1024 B)
                                    </button>
                                )}
                                <div className="flex items-center gap-1">
                                    <input
                                        className={`${INP} w-24`}
                                        placeholder="offset"
                                        value={manualOffset}
                                        onChange={(e) => setManualOffset(e.target.value)}
                                    />
                                    <input
                                        className={`${INP} w-16`}
                                        placeholder="size"
                                        value={manualSize}
                                        onChange={(e) => setManualSize(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => dumpPayloadAt(Number(manualOffset) || 0, Number(manualSize) || 256)}
                                        className={ADD_BTN}
                                    >
                                        dump @ offset
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    {meshError && (
                        <div className="mt-2 rounded border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-2 text-[11px] text-[var(--color-danger)]">
                            {meshError}
                        </div>
                    )}
                    {hexDump && (
                        <div className="mt-3 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                            <div className="mb-2 flex items-center gap-2">
                                <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                                    payload after property block — {hexDump.bytesDumped} bytes from
                                    file offset {hexDump.payloadStart.toLocaleString()}
                                </span>
                                <div className="ml-auto flex gap-1">
                                    {(["hex", "u32", "f32"] as const).map((v) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => setDumpView(v)}
                                            className={`rounded border px-1.5 py-0.5 text-[10px] ${
                                                dumpView === v
                                                    ? "border-[var(--color-accent-2)] text-[var(--color-accent)]"
                                                    : "border-[var(--color-border)] text-[var(--color-text-faint)]"
                                            }`}
                                        >
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <pre className="overflow-x-auto whitespace-pre font-mono text-[10px] leading-tight text-[var(--color-text)]">
                                {dumpView === "hex"
                                    ? `${hexDump.hex}\n${hexDump.ascii}`
                                    : dumpView === "u32"
                                      ? hexDump.u32Grid
                                      : hexDump.f32Grid}
                            </pre>
                        </div>
                    )}
                    {mesh && (
                        <div className="mt-3 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                            <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                                decoded mesh
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                                <KV k="vertices" v={(mesh.positions.length / 3).toLocaleString()} mono />
                                <KV k="wedges" v={(mesh.wedgeVertexIndices.length).toLocaleString()} mono />
                                <KV k="triangles" v={(mesh.triangleWedges.length / 3).toLocaleString()} mono />
                                <KV k="materials" v={String(mesh.materials.length)} mono />
                                <KV k="bones" v={String(mesh.bones.length)} mono />
                                <KV
                                    k="influences"
                                    v={`${mesh.influences.length.toLocaleString()} (avg ${
                                        mesh.positions.length === 0
                                            ? 0
                                            : (mesh.influences.length / (mesh.positions.length / 3)).toFixed(2)
                                    }/vert)`}
                                    mono
                                />
                                <KV
                                    k="bytes used"
                                    v={`${mesh.cursorEnd - (resolved.export?.serialOffset ?? 0)} / ${(resolved.export?.serialSize ?? 0).toLocaleString()}`}
                                    mono
                                />
                                <KV
                                    k="bbox min"
                                    v={mesh.bounds.min.map((n) => n.toFixed(1)).join(", ")}
                                    mono
                                />
                                <KV
                                    k="bbox max"
                                    v={mesh.bounds.max.map((n) => n.toFixed(1)).join(", ")}
                                    mono
                                />
                            </div>
                            {mesh.bones.length > 0 && (
                                <div className="mt-2">
                                    <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                                        first 6 bones
                                    </div>
                                    <div className="space-y-0.5 font-mono text-[10px]">
                                        {mesh.bones.slice(0, 6).map((b, i) => (
                                            <div key={i} className="flex gap-2">
                                                <span className="w-6 shrink-0 text-[var(--color-text-faint)]">
                                                    {i}
                                                </span>
                                                <span className="flex-1 truncate">{b.name}</span>
                                                <span className="text-[var(--color-text-faint)]">
                                                    parent {b.parentIndex}, children {b.numChildren}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {resolveError && (
                <div className="rounded border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-2 text-[11px] text-[var(--color-danger)]">
                    {resolveError}
                </div>
            )}
        </div>
    );
}

function StatusPill({ status, detail }: { status: string; detail: string }) {
    const tone =
        status === "ok"
            ? "border-[var(--color-accent-2)] text-[var(--color-accent)]"
            : status === "packageNotFound" || status === "exportNotFound" || status === "badMeshName"
              ? "border-[var(--color-warning)] text-[var(--color-warning)]"
              : "border-[var(--color-danger)] text-[var(--color-danger)]";
    return (
        <div className={`inline-flex items-center gap-2 rounded border px-2 py-0.5 text-[10px] ${tone}`} title={detail}>
            <span className="uppercase tracking-wider">{status}</span>
            <span className="font-normal opacity-80">{detail}</span>
        </div>
    );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
    return (
        <div className="flex gap-3">
            <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                {k}
            </span>
            <span className={`min-w-0 flex-1 truncate ${mono ? "font-mono" : ""}`} title={v}>
                {v}
            </span>
        </div>
    );
}

function SpawnsTab({
    spawns,
    bosses
}: {
    spawns: SpawnPoint[];
    bosses: Array<{ npcId: number; x: number; y: number; respawn: string }>;
}) {
    const regions = (() => {
        const m = new Map<string, number>();
        for (const s of spawns) {
            const { rx, ry } = regionOf(s.x, s.y);
            const k = `${rx}_${ry}`;
            m.set(k, (m.get(k) ?? 0) + 1);
        }
        for (const b of bosses) {
            const { rx, ry } = regionOf(b.x, b.y);
            const k = `${rx}_${ry}`;
            m.set(k, (m.get(k) ?? 0) + 1);
        }
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    })();
    return (
        <Section title="Spawns">
            <Grid>
                <FieldShell label="total spawns">
                    <input className={`${INP} opacity-60`} readOnly value={String(spawns.length + bosses.length)} />
                </FieldShell>
                <FieldShell label="regions">
                    <input className={`${INP} opacity-60`} readOnly value={String(regions.length)} />
                </FieldShell>
            </Grid>
            {bosses.length > 0 && (
                <Subsection title={`boss spawns (${bosses.length})`}>
                    {bosses.map((b, i) => (
                        <div key={i} className="flex items-center gap-3 border-b border-white/5 py-1 text-[11px]">
                            <span className="font-mono">
                                {b.x}, {b.y}
                            </span>
                            <span className="text-[10px] text-[var(--color-text-faint)]">
                                respawn {b.respawn || "—"}
                            </span>
                        </div>
                    ))}
                </Subsection>
            )}
            {spawns.length > 0 && (
                <Subsection title={`spawn points (${spawns.length})`}>
                    <div className="max-h-[300px] overflow-y-auto">
                        {spawns.slice(0, 200).map((s, i) => {
                            const { rx, ry } = regionOf(s.x, s.y);
                            return (
                                <div
                                    key={i}
                                    className="flex items-center gap-2 border-b border-white/5 py-1 text-[11px]"
                                >
                                    <span className="font-mono">
                                        {s.x}, {s.y}
                                    </span>
                                    <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--color-text-faint)]">
                                        region {rx}_{ry}
                                    </span>
                                    {s.count > 1 && (
                                        <span className="shrink-0 rounded bg-white/5 px-1.5 font-mono text-[10px] text-[var(--color-text-faint)]">
                                            ×{s.count}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                        {spawns.length > 200 && (
                            <div className="px-2 py-1.5 text-[10px] text-[var(--color-text-faint)]">
                                … and {spawns.length - 200} more
                            </div>
                        )}
                    </div>
                </Subsection>
            )}
            {regions.length > 0 && (
                <Subsection title="region heatmap">
                    <div className="flex flex-wrap gap-1">
                        {regions.slice(0, 40).map(([region, n]) => (
                            <span
                                key={region}
                                className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-faint)]"
                            >
                                {region} ×{n}
                            </span>
                        ))}
                    </div>
                </Subsection>
            )}
        </Section>
    );
}

interface TabProps {
    npc: Element;
    mutate: (fn: (npc: Element) => void) => void;
}

function IdentityTab({ npc, mutate }: TabProps) {
    return (
        <Section title="Identity">
            <Grid>
                <ReadOnlyField label="id" value={npc.getAttribute("id") ?? ""} />
                <AttrField label="displayId" attr="displayId" npc={npc} mutate={mutate} type="number" />
                <AttrField label="level" attr="level" npc={npc} mutate={mutate} type="number" />
                <AttrSelect label="type" attr="type" npc={npc} mutate={mutate} options={NPC_TYPES} />
                <AttrField label="name" attr="name" npc={npc} mutate={mutate} type="text" />
                <AttrField label="title" attr="title" npc={npc} mutate={mutate} type="text" />
                <AttrBool label="usingServerSideName" attr="usingServerSideName" npc={npc} mutate={mutate} />
                <AttrBool label="usingServerSideTitle" attr="usingServerSideTitle" npc={npc} mutate={mutate} />
            </Grid>
            <Subsection title="Race / Sex">
                <Grid>
                    <ChildTextSelect label="race" child="race" npc={npc} mutate={mutate} options={RACES} />
                    <ChildTextSelect label="sex" child="sex" npc={npc} mutate={mutate} options={SEXES} />
                </Grid>
            </Subsection>
        </Section>
    );
}

function StatsTab({ npc, mutate }: TabProps) {
    const stats = childEl(npc, "stats");
    return (
        <Section title="Stats">
            <SectionToggle present={!!stats} onAdd={() => mutate((n) => ensureChild(n, "stats"))}>
                {stats && (
                    <>
                        <Subsection title="Base attributes">
                            <Grid>
                                {(["str", "int", "dex", "wit", "con", "men"] as const).map((a) => (
                                    <AttrField
                                        key={a}
                                        label={a.toUpperCase()}
                                        attr={a}
                                        npc={stats}
                                        mutate={(fn) => mutate(() => fn(stats))}
                                        type="number"
                                    />
                                ))}
                            </Grid>
                        </Subsection>
                        <ChildAttrsBlock
                            parent={stats}
                            mutate={(fn) => mutate(() => fn(stats))}
                            child="vitals"
                            title="Vitals"
                            attrs={[
                                ["hp", "number"],
                                ["hpRegen", "number"],
                                ["mp", "number"],
                                ["mpRegen", "number"]
                            ]}
                        />
                        <ChildAttrsBlock
                            parent={stats}
                            mutate={(fn) => mutate(() => fn(stats))}
                            child="attack"
                            title="Attack"
                            attrs={[
                                ["physical", "number"],
                                ["magical", "number"],
                                ["random", "number"],
                                ["critical", "number"],
                                ["accuracy", "number"],
                                ["attackSpeed", "number"],
                                ["reuseDelay", "number"],
                                ["type", { enum: WEAPON_TYPES }],
                                ["range", "number"],
                                ["distance", "number"],
                                ["width", "number"]
                            ]}
                        />
                        <ChildAttrsBlock
                            parent={stats}
                            mutate={(fn) => mutate(() => fn(stats))}
                            child="defence"
                            title="Defence"
                            attrs={[
                                ["physical", "number"],
                                ["magical", "number"],
                                ["evasion", "number"],
                                ["shield", "number"],
                                ["shieldRate", "number"]
                            ]}
                        />
                        <ChildAttrsBlock
                            parent={stats}
                            mutate={(fn) => mutate(() => fn(stats))}
                            child="abnormalResist"
                            title="Abnormal Resist"
                            attrs={[
                                ["physical", "number"],
                                ["magical", "number"]
                            ]}
                        />
                        <AttributeBlock stats={stats} mutate={(fn) => mutate(() => fn(stats))} />
                        <SpeedBlock stats={stats} mutate={(fn) => mutate(() => fn(stats))} />
                        <Subsection title="hitTime">
                            <ChildTextField
                                label="value"
                                child="hitTime"
                                npc={stats}
                                mutate={(fn) => mutate(() => fn(stats))}
                                type="number"
                            />
                        </Subsection>
                    </>
                )}
            </SectionToggle>
        </Section>
    );
}

function AttributeBlock({ stats, mutate }: { stats: Element; mutate: (fn: (s: Element) => void) => void }) {
    const attr = childEl(stats, "attribute");
    return (
        <Subsection title="Attribute (element resistance)">
            <SectionToggle present={!!attr} onAdd={() => mutate((s) => ensureChild(s, "attribute"))}>
                {attr && (
                    <>
                        <ChildAttrsBlock
                            parent={attr}
                            mutate={(fn) => mutate(() => fn(attr))}
                            child="attack"
                            title="Attribute attack"
                            attrs={[
                                ["type", { enum: ATTRIBUTE_ELEMENTS }],
                                ["value", "number"]
                            ]}
                        />
                        <ChildAttrsBlock
                            parent={attr}
                            mutate={(fn) => mutate(() => fn(attr))}
                            child="defence"
                            title="Attribute defence"
                            attrs={[
                                ["fire", "number"],
                                ["water", "number"],
                                ["wind", "number"],
                                ["earth", "number"],
                                ["holy", "number"],
                                ["dark", "number"],
                                ["default", "number"]
                            ]}
                        />
                    </>
                )}
            </SectionToggle>
        </Subsection>
    );
}

function SpeedBlock({ stats, mutate }: { stats: Element; mutate: (fn: (s: Element) => void) => void }) {
    const sp = childEl(stats, "speed");
    return (
        <Subsection title="Speed">
            <SectionToggle present={!!sp} onAdd={() => mutate((s) => ensureChild(s, "speed"))}>
                {sp && (
                    <>
                        <ChildAttrsBlock
                            parent={sp}
                            mutate={(fn) => mutate(() => fn(sp))}
                            child="walk"
                            title="Walk"
                            attrs={[
                                ["ground", "number"],
                                ["swim", "number"],
                                ["fly", "number"]
                            ]}
                        />
                        <ChildAttrsBlock
                            parent={sp}
                            mutate={(fn) => mutate(() => fn(sp))}
                            child="run"
                            title="Run"
                            attrs={[
                                ["ground", "number"],
                                ["swim", "number"],
                                ["fly", "number"]
                            ]}
                        />
                    </>
                )}
            </SectionToggle>
        </Subsection>
    );
}

function StatusTab({ npc, mutate }: TabProps) {
    const status = childEl(npc, "status");
    const fields: [string, string][] = [
        ["unique", "Unique boss-style instance"],
        ["attackable", "Players can attack"],
        ["talkable", "Players can talk"],
        ["targetable", "Players can target"],
        ["undying", "Cannot die"],
        ["showName", "Name floats above"],
        ["randomWalk", "Wanders idly"],
        ["randomAnimation", "Plays idle anims"],
        ["flying", "Flying NPC"],
        ["canMove", "Allowed to move"],
        ["noSleepMode", "Doesn't despawn"],
        ["passableDoor", "Walks through doors"],
        ["hasSummoner", "Has a summoner ref"],
        ["canBeSown", "Sowable by manor"],
        ["isDeathPenalty", "Triggers death penalty"]
    ];
    return (
        <Section title="Status flags">
            <SectionToggle present={!!status} onAdd={() => mutate((n) => ensureChild(n, "status"))}>
                {status && (
                    <Grid>
                        {fields.map(([k, hint]) => (
                            <AttrBool
                                key={k}
                                label={k}
                                hint={hint}
                                attr={k}
                                npc={status}
                                mutate={(fn) => mutate(() => fn(status))}
                            />
                        ))}
                    </Grid>
                )}
            </SectionToggle>
        </Section>
    );
}

function AiTab({ npc, mutate }: TabProps) {
    const ai = childEl(npc, "ai");
    return (
        <Section title="AI">
            <SectionToggle present={!!ai} onAdd={() => mutate((n) => ensureChild(n, "ai"))}>
                {ai && (
                    <>
                        <Grid>
                            <AttrSelect
                                label="type"
                                attr="type"
                                npc={ai}
                                mutate={(fn) => mutate(() => fn(ai))}
                                options={AI_TYPES}
                            />
                            <AttrField
                                label="aggroRange"
                                attr="aggroRange"
                                npc={ai}
                                mutate={(fn) => mutate(() => fn(ai))}
                                type="number"
                            />
                            <AttrField
                                label="clanHelpRange"
                                attr="clanHelpRange"
                                npc={ai}
                                mutate={(fn) => mutate(() => fn(ai))}
                                type="number"
                            />
                            <AttrBool label="isChaos" attr="isChaos" npc={ai} mutate={(fn) => mutate(() => fn(ai))} />
                            <AttrBool
                                label="isAggressive"
                                attr="isAggressive"
                                npc={ai}
                                mutate={(fn) => mutate(() => fn(ai))}
                            />
                        </Grid>
                        <ChildAttrsBlock
                            parent={ai}
                            mutate={(fn) => mutate(() => fn(ai))}
                            child="skill"
                            title="AI skill targeting"
                            attrs={[
                                ["minChance", "number"],
                                ["maxChance", "number"],
                                ["primaryId", "number"],
                                ["shortRangeId", "number"],
                                ["shortRangeChance", "number"],
                                ["longRangeId", "number"],
                                ["longRangeChance", "number"]
                            ]}
                        />
                        <ClanListBlock parent={ai} mutate={(fn) => mutate(() => fn(ai))} />
                    </>
                )}
            </SectionToggle>
        </Section>
    );
}

function ClanListBlock({ parent, mutate }: { parent: Element; mutate: (fn: (p: Element) => void) => void }) {
    const cl = childEl(parent, "clanList");
    const clans = cl ? [...cl.querySelectorAll(":scope > clan")] : [];
    const ignores = cl ? [...cl.querySelectorAll(":scope > ignoreNpcId")] : [];
    return (
        <Subsection title="Clan list">
            <SectionToggle present={!!cl} onAdd={() => mutate((p) => ensureChild(p, "clanList"))}>
                {cl && (
                    <>
                        <ListEditor
                            label="clans"
                            items={clans.map((c) => c.textContent ?? "")}
                            onAdd={(value) =>
                                mutate(() => {
                                    const el = parent.ownerDocument!.createElement("clan");
                                    el.textContent = value;
                                    cl.appendChild(el);
                                })
                            }
                            onChange={(i, value) =>
                                mutate(() => {
                                    clans[i].textContent = value;
                                })
                            }
                            onRemove={(i) =>
                                mutate(() => {
                                    clans[i].remove();
                                })
                            }
                            placeholder="clan name (e.g. ORC_GROUP)"
                        />
                        <ListEditor
                            label="ignoreNpcId"
                            items={ignores.map((c) => c.textContent ?? "")}
                            type="number"
                            onAdd={(value) =>
                                mutate(() => {
                                    const el = parent.ownerDocument!.createElement("ignoreNpcId");
                                    el.textContent = value;
                                    cl.appendChild(el);
                                })
                            }
                            onChange={(i, value) =>
                                mutate(() => {
                                    ignores[i].textContent = value;
                                })
                            }
                            onRemove={(i) =>
                                mutate(() => {
                                    ignores[i].remove();
                                })
                            }
                            placeholder="npc id to ignore"
                        />
                    </>
                )}
            </SectionToggle>
        </Subsection>
    );
}

function SkillsTab({
    npc,
    mutate,
    catalog
}: TabProps & { catalog: Map<number, SkillBrief> | null }) {
    const list = childEl(npc, "skillList");
    const skills = list ? [...list.querySelectorAll(":scope > skill")] : [];
    const [addOpen, setAddOpen] = useState(false);
    return (
        <Section title="Skill list">
            <SectionToggle present={!!list} onAdd={() => mutate((n) => ensureChild(n, "skillList"))}>
                {list && (
                    <>
                        <div className="mb-1 px-1 text-[10px] text-[var(--color-text-faint)]">
                            Click a skill row to view full client/server info. The arrow opens it in the Skills
                            workspace.
                        </div>
                        <div className="flex flex-col gap-1">
                            {skills.map((s, i) => (
                                <SkillBriefRow
                                    key={i}
                                    el={s}
                                    catalog={catalog}
                                    onLevelChange={(v) =>
                                        mutate(() => {
                                            s.setAttribute("level", v);
                                        })
                                    }
                                    onRemove={() => mutate(() => s.remove())}
                                />
                            ))}
                            {skills.length === 0 && (
                                <div className="rounded border border-dashed border-[var(--color-border)] px-3 py-2 text-[11px] text-[var(--color-text-faint)]">
                                    No skills yet.
                                </div>
                            )}
                        </div>
                        {addOpen ? (
                            <AddSkillRow
                                catalog={catalog}
                                existingIds={new Set(
                                    skills.map((s) => Number(s.getAttribute("id"))).filter((n) => Number.isFinite(n))
                                )}
                                onAdd={(id, level) =>
                                    mutate(() => {
                                        const el = npc.ownerDocument!.createElement("skill");
                                        el.setAttribute("id", String(id));
                                        el.setAttribute("level", String(level));
                                        list.appendChild(el);
                                    })
                                }
                                onClose={() => setAddOpen(false)}
                            />
                        ) : (
                            <button type="button" onClick={() => setAddOpen(true)} className={ADD_BTN}>
                                + add skill
                            </button>
                        )}
                    </>
                )}
            </SectionToggle>
        </Section>
    );
}

function SkillBriefRow({
    el,
    catalog,
    onLevelChange,
    onRemove
}: {
    el: Element;
    catalog: Map<number, SkillBrief> | null;
    onLevelChange: (v: string) => void;
    onRemove: () => void;
}) {
    const inspect = useInspectSkill();
    const id = Number(el.getAttribute("id") ?? "");
    const level = el.getAttribute("level") ?? "1";
    const brief = Number.isFinite(id) ? catalog?.get(id) : undefined;
    const known = !!brief || !catalog;
    const note = nextSiblingComment(el);
    return (
        <div className="group flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 hover:border-[var(--color-accent-2)]">
            <button
                type="button"
                onClick={() => inspect(id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title="Show skill info"
            >
                <span className="mono w-12 shrink-0 text-[10px] text-[var(--color-accent-2)]">{id}</span>
                <span className="min-w-0 flex-1 truncate text-[11px]">
                    {brief?.name ?? (catalog && !known ? (
                        <span className="italic text-[var(--color-warning)]">unknown id</span>
                    ) : (
                        <span className="italic text-[var(--color-text-faint)]">…</span>
                    ))}
                </span>
                {brief?.operateType && (
                    <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--color-text-faint)]">
                        {operateTypeLabel(brief.operateType)}
                    </span>
                )}
                {note && !brief?.name && (
                    <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-faint)]" title={note}>
                        {note}
                    </span>
                )}
            </button>
            <label className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--color-text-faint)]">
                lv
                <input
                    type="number"
                    min={1}
                    defaultValue={level}
                    onChange={(e) => onLevelChange(e.target.value)}
                    className={`${INP} w-14 px-1.5 py-0.5`}
                />
            </label>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    inspect(id);
                }}
                title="Open in Skills workspace"
                className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-accent)]"
            >
                <ArrowUpRight size={12} aria-hidden />
            </button>
            <button type="button" onClick={onRemove} className={DEL_BTN} title="remove from list">
                ×
            </button>
        </div>
    );
}

function AddSkillRow({
    catalog,
    existingIds,
    onAdd,
    onClose
}: {
    catalog: Map<number, SkillBrief> | null;
    existingIds: Set<number>;
    onAdd: (id: number, level: number) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const [level, setLevel] = useState("1");
    const q = query.trim().toLowerCase();
    const idGuess = Number(q);
    const matches = useMemo<SkillBrief[]>(() => {
        if (!catalog || !q) return [];
        const out: SkillBrief[] = [];
        for (const b of catalog.values()) {
            if (existingIds.has(b.id)) continue;
            if (Number.isFinite(idGuess) && b.id === idGuess) {
                out.unshift(b);
                continue;
            }
            if (b.name.toLowerCase().includes(q)) out.push(b);
            if (out.length >= 25) break;
        }
        return out.slice(0, 25);
    }, [catalog, q, idGuess, existingIds]);
    return (
        <div className="mt-2 rounded border border-[var(--color-accent-2)] bg-[var(--color-surface-2)] p-2">
            <div className="mb-2 flex items-center gap-2">
                <input
                    autoFocus
                    type="text"
                    placeholder="search by name or id…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={`${INP} flex-1`}
                />
                <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-faint)]">
                    lv
                    <input
                        type="number"
                        min={1}
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                        className={`${INP} w-16`}
                    />
                </label>
                <button type="button" onClick={onClose} className={DEL_BTN}>
                    cancel
                </button>
            </div>
            {q && matches.length === 0 && (
                <div className="px-1 text-[11px] text-[var(--color-text-faint)]">
                    No matches.
                    {Number.isFinite(idGuess) && idGuess > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                onAdd(idGuess, Number(level) || 1);
                                onClose();
                            }}
                            className="ml-2 underline hover:text-[var(--color-accent)]"
                        >
                            Add raw id {idGuess} anyway
                        </button>
                    )}
                </div>
            )}
            {matches.length > 0 && (
                <div className="flex max-h-[260px] flex-col gap-0.5 overflow-y-auto">
                    {matches.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                                onAdd(m.id, Number(level) || 1);
                                onClose();
                            }}
                            className="flex items-center gap-2 rounded px-2 py-1 text-left text-[11px] hover:bg-white/5"
                        >
                            <span className="mono w-14 shrink-0 text-[10px] text-[var(--color-accent-2)]">
                                {m.id}
                            </span>
                            <span className="flex-1 truncate">{m.name}</span>
                            {m.operateType && (
                                <span className="shrink-0 text-[10px] text-[var(--color-text-faint)]">
                                    {operateTypeLabel(m.operateType)}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function DropsTab({ npc, mutate }: TabProps) {
    const dl = childEl(npc, "dropLists");
    return (
        <Section title="Drop lists">
            <SectionToggle present={!!dl} onAdd={() => mutate((n) => ensureChild(n, "dropLists"))}>
                {dl && (
                    <>
                        {(["drop", "spoil", "lucky", "limited"] as const).map((kind) => (
                            <DropKind key={kind} kind={kind} dl={dl} mutate={(fn) => mutate(() => fn(dl))} />
                        ))}
                    </>
                )}
            </SectionToggle>
        </Section>
    );
}

function DropKind({
    kind,
    dl,
    mutate
}: {
    kind: "drop" | "spoil" | "lucky" | "limited";
    dl: Element;
    mutate: (fn: (dl: Element) => void) => void;
}) {
    const block = childEl(dl, kind);
    return (
        <Subsection title={kind}>
            <SectionToggle present={!!block} onAdd={() => mutate((d) => ensureChild(d, kind))}>
                {block && (
                    <>
                        <DropItemList parent={block} mutate={(fn) => mutate(() => fn(block))} kind={kind} />
                        {kind === "drop" && <DropGroupList parent={block} mutate={(fn) => mutate(() => fn(block))} />}
                    </>
                )}
            </SectionToggle>
        </Subsection>
    );
}

function DropItemList({
    parent,
    mutate,
    kind
}: {
    parent: Element;
    mutate: (fn: (p: Element) => void) => void;
    kind: "drop" | "spoil" | "lucky" | "limited";
}) {
    const items = [...parent.querySelectorAll(":scope > item")];
    const cols: [string, string][] =
        kind === "limited"
            ? [
                  ["id", "id"],
                  ["min", "min"],
                  ["max", "max"],
                  ["minLevel", "minLv"],
                  ["maxLevel", "maxLv"],
                  ["dailyLimit", "/day"],
                  ["chance", "%"]
              ]
            : [
                  ["id", "id"],
                  ["min", "min"],
                  ["max", "max"],
                  ["chance", "%"]
              ];

    return (
        <>
            <div
                className="mb-1 grid gap-2 px-1 text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]"
                style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr)) auto` }}
            >
                {cols.map(([, lbl]) => (
                    <span key={lbl}>{lbl}</span>
                ))}
                <span />
            </div>
            {items.map((it, i) => (
                <div
                    key={i}
                    className="mb-1 grid items-center gap-2"
                    style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr)) auto` }}
                >
                    {cols.map(([a]) => (
                        <input
                            key={a}
                            className={INP}
                            type="number"
                            step={a === "chance" ? "0.0001" : "1"}
                            defaultValue={it.getAttribute(a) ?? ""}
                            onChange={(e) => mutate(() => it.setAttribute(a, e.target.value))}
                        />
                    ))}
                    <button type="button" onClick={() => mutate(() => it.remove())} className={DEL_BTN}>
                        ×
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={() =>
                    mutate((p) => {
                        const el = p.ownerDocument!.createElement("item");
                        for (const [a] of cols) el.setAttribute(a, a === "chance" ? "100" : "1");
                        p.appendChild(el);
                    })
                }
                className={ADD_BTN}
            >
                + add item
            </button>
        </>
    );
}

function DropGroupList({ parent, mutate }: { parent: Element; mutate: (fn: (p: Element) => void) => void }) {
    const groups = [...parent.querySelectorAll(":scope > group")];
    return (
        <Subsection title="groups">
            {groups.map((g, i) => (
                <div
                    key={i}
                    className="mb-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2"
                >
                    <div className="mb-1 flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                            group chance %
                        </span>
                        <input
                            className={`${INP} w-24`}
                            type="number"
                            step="0.0001"
                            defaultValue={g.getAttribute("chance") ?? ""}
                            onChange={(e) => mutate(() => g.setAttribute("chance", e.target.value))}
                        />
                        <button type="button" onClick={() => mutate(() => g.remove())} className={`${DEL_BTN} ml-auto`}>
                            remove group
                        </button>
                    </div>
                    <DropItemList parent={g} mutate={(fn) => mutate(() => fn(g))} kind="drop" />
                </div>
            ))}
            <button
                type="button"
                onClick={() =>
                    mutate((p) => {
                        const g = p.ownerDocument!.createElement("group");
                        g.setAttribute("chance", "100");
                        p.appendChild(g);
                    })
                }
                className={ADD_BTN}
            >
                + add group
            </button>
        </Subsection>
    );
}

function FakePlayerTab({ npc, mutate }: TabProps) {
    const fp = childEl(npc, "fakePlayer");
    const intAttrs: string[] = [
        "classId",
        "hair",
        "hairColor",
        "face",
        "nameColor",
        "titleColor",
        "equipHead",
        "equipRHand",
        "equipLHand",
        "equipGloves",
        "equipChest",
        "equipLegs",
        "equipFeet",
        "equipCloak",
        "equipHair",
        "equipHair2",
        "agathionId",
        "weaponEnchantLevel",
        "armorEnchantLevel",
        "baitLocationX",
        "baitLocationY",
        "baitLocationZ",
        "recommends",
        "nobleLevel",
        "clanId",
        "pledgeStatus",
        "privateStoreType"
    ];
    const boolAttrs = ["fishing", "hero", "sitting", "fakePlayerTalkable"];
    return (
        <Section title="Fake player">
            <SectionToggle present={!!fp} onAdd={() => mutate((n) => ensureChild(n, "fakePlayer"))}>
                {fp && (
                    <>
                        <Grid>
                            {intAttrs.map((a) => (
                                <AttrField
                                    key={a}
                                    label={a}
                                    attr={a}
                                    npc={fp}
                                    mutate={(fn) => mutate(() => fn(fp))}
                                    type="number"
                                />
                            ))}
                            {boolAttrs.map((a) => (
                                <AttrBool key={a} label={a} attr={a} npc={fp} mutate={(fn) => mutate(() => fn(fp))} />
                            ))}
                            <AttrField
                                label="privateStoreMessage"
                                attr="privateStoreMessage"
                                npc={fp}
                                mutate={(fn) => mutate(() => fn(fp))}
                                type="text"
                            />
                        </Grid>
                    </>
                )}
            </SectionToggle>
        </Section>
    );
}

function ParametersTab({ npc, mutate }: TabProps) {
    const params = childEl(npc, "parameters");
    const paramEls = params ? [...params.querySelectorAll(":scope > param")] : [];
    const skillEls = params ? [...params.querySelectorAll(":scope > skill")] : [];
    const minionWraps = params ? [...params.querySelectorAll(":scope > minions")] : [];

    return (
        <Section title="Parameters">
            <SectionToggle present={!!params} onAdd={() => mutate((n) => ensureChild(n, "parameters"))}>
                {params && (
                    <>
                        <Subsection title="param (name → value)">
                            {paramEls.map((p, i) => (
                                <div key={i} className="mb-1 grid grid-cols-[1fr_2fr_auto] gap-2">
                                    <input
                                        className={INP}
                                        defaultValue={p.getAttribute("name") ?? ""}
                                        onChange={(e) => mutate(() => p.setAttribute("name", e.target.value))}
                                    />
                                    <input
                                        className={INP}
                                        defaultValue={p.getAttribute("value") ?? ""}
                                        onChange={(e) => mutate(() => p.setAttribute("value", e.target.value))}
                                    />
                                    <button type="button" className={DEL_BTN} onClick={() => mutate(() => p.remove())}>
                                        ×
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() =>
                                    mutate(() => {
                                        const el = params.ownerDocument!.createElement("param");
                                        el.setAttribute("name", "newParam");
                                        el.setAttribute("value", "");
                                        params.appendChild(el);
                                    })
                                }
                                className={ADD_BTN}
                            >
                                + add param
                            </button>
                        </Subsection>
                        <Subsection title="skill (name + id + level)">
                            {skillEls.map((s, i) => (
                                <div key={i} className="mb-1 grid grid-cols-[1fr_80px_80px_auto] gap-2">
                                    <input
                                        className={INP}
                                        defaultValue={s.getAttribute("name") ?? ""}
                                        onChange={(e) => mutate(() => s.setAttribute("name", e.target.value))}
                                    />
                                    <input
                                        className={INP}
                                        type="number"
                                        defaultValue={s.getAttribute("id") ?? ""}
                                        onChange={(e) => mutate(() => s.setAttribute("id", e.target.value))}
                                    />
                                    <input
                                        className={INP}
                                        type="number"
                                        defaultValue={s.getAttribute("level") ?? ""}
                                        onChange={(e) => mutate(() => s.setAttribute("level", e.target.value))}
                                    />
                                    <button type="button" className={DEL_BTN} onClick={() => mutate(() => s.remove())}>
                                        ×
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() =>
                                    mutate(() => {
                                        const el = params.ownerDocument!.createElement("skill");
                                        el.setAttribute("name", "newSkill");
                                        el.setAttribute("id", "0");
                                        el.setAttribute("level", "1");
                                        params.appendChild(el);
                                    })
                                }
                                className={ADD_BTN}
                            >
                                + add parameter skill
                            </button>
                        </Subsection>
                        <Subsection title="minions">
                            {minionWraps.map((wrap, wi) => {
                                const minions = [...wrap.querySelectorAll(":scope > npc")];
                                return (
                                    <div
                                        key={wi}
                                        className="mb-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2"
                                    >
                                        <div className="mb-1 flex items-center gap-2">
                                            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                                                group name
                                            </span>
                                            <input
                                                className={INP}
                                                defaultValue={wrap.getAttribute("name") ?? ""}
                                                onChange={(e) =>
                                                    mutate(() => wrap.setAttribute("name", e.target.value))
                                                }
                                            />
                                            <button
                                                type="button"
                                                className={`${DEL_BTN} ml-auto`}
                                                onClick={() => mutate(() => wrap.remove())}
                                            >
                                                remove group
                                            </button>
                                        </div>
                                        {minions.map((m, mi) => (
                                            <div
                                                key={mi}
                                                className="mb-1 grid grid-cols-[80px_60px_60px_80px_60px_auto] gap-2"
                                            >
                                                {(
                                                    [
                                                        ["id", "id"],
                                                        ["count", "count"],
                                                        ["max", "max"],
                                                        ["respawnTime", "respawn"],
                                                        ["weightPoint", "wp"]
                                                    ] as const
                                                ).map(([a, lbl]) => (
                                                    <input
                                                        key={a}
                                                        className={INP}
                                                        type="number"
                                                        placeholder={lbl}
                                                        defaultValue={m.getAttribute(a) ?? ""}
                                                        onChange={(e) =>
                                                            mutate(() => m.setAttribute(a, e.target.value))
                                                        }
                                                    />
                                                ))}
                                                <button
                                                    type="button"
                                                    className={DEL_BTN}
                                                    onClick={() => mutate(() => m.remove())}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                mutate(() => {
                                                    const m = wrap.ownerDocument!.createElement("npc");
                                                    m.setAttribute("id", "0");
                                                    m.setAttribute("count", "1");
                                                    m.setAttribute("respawnTime", "60");
                                                    wrap.appendChild(m);
                                                })
                                            }
                                            className={ADD_BTN}
                                        >
                                            + add minion
                                        </button>
                                    </div>
                                );
                            })}
                            <button
                                type="button"
                                onClick={() =>
                                    mutate(() => {
                                        const w = params.ownerDocument!.createElement("minions");
                                        w.setAttribute("name", "minions");
                                        params.appendChild(w);
                                    })
                                }
                                className={ADD_BTN}
                            >
                                + add minion group
                            </button>
                        </Subsection>
                    </>
                )}
            </SectionToggle>
        </Section>
    );
}

function EquipmentTab({ npc, mutate }: TabProps) {
    const eq = childEl(npc, "equipment");
    return (
        <Section title="Equipment">
            <SectionToggle present={!!eq} onAdd={() => mutate((n) => ensureChild(n, "equipment"))}>
                {eq && (
                    <Grid>
                        {(["chest", "rhand", "lhand", "weaponEnchant"] as const).map((a) => (
                            <AttrField
                                key={a}
                                label={a}
                                attr={a}
                                npc={eq}
                                mutate={(fn) => mutate(() => fn(eq))}
                                type="number"
                            />
                        ))}
                    </Grid>
                )}
            </SectionToggle>
        </Section>
    );
}

function RewardsTab({ npc, mutate }: TabProps) {
    const acq = childEl(npc, "acquire");
    const mp = childEl(npc, "mpReward");
    const shots = childEl(npc, "shots");
    return (
        <Section title="Rewards">
            <Subsection title="acquire">
                <SectionToggle present={!!acq} onAdd={() => mutate((n) => ensureChild(n, "acquire"))}>
                    {acq && (
                        <Grid>
                            {(["exp", "sp", "raidPoints"] as const).map((a) => (
                                <AttrField
                                    key={a}
                                    label={a}
                                    attr={a}
                                    npc={acq}
                                    mutate={(fn) => mutate(() => fn(acq))}
                                    type="number"
                                />
                            ))}
                        </Grid>
                    )}
                </SectionToggle>
            </Subsection>
            <Subsection title="mpReward (HP/MP regen aura)">
                <SectionToggle present={!!mp} onAdd={() => mutate((n) => ensureChild(n, "mpReward"))}>
                    {mp && (
                        <Grid>
                            <AttrField
                                label="value"
                                attr="value"
                                npc={mp}
                                mutate={(fn) => mutate(() => fn(mp))}
                                type="number"
                            />
                            <AttrSelect
                                label="type"
                                attr="type"
                                npc={mp}
                                mutate={(fn) => mutate(() => fn(mp))}
                                options={MP_REWARD_TYPES}
                            />
                            <AttrField
                                label="ticks"
                                attr="ticks"
                                npc={mp}
                                mutate={(fn) => mutate(() => fn(mp))}
                                type="number"
                            />
                            <AttrSelect
                                label="affects"
                                attr="affects"
                                npc={mp}
                                mutate={(fn) => mutate(() => fn(mp))}
                                options={MP_REWARD_AFFECTS}
                            />
                        </Grid>
                    )}
                </SectionToggle>
            </Subsection>
            <Subsection title="shots (soulshot/spiritshot)">
                <SectionToggle present={!!shots} onAdd={() => mutate((n) => ensureChild(n, "shots"))}>
                    {shots && (
                        <Grid>
                            {(["soul", "spirit", "shotChance", "spiritChance"] as const).map((a) => (
                                <AttrField
                                    key={a}
                                    label={a}
                                    attr={a}
                                    npc={shots}
                                    mutate={(fn) => mutate(() => fn(shots))}
                                    type="number"
                                />
                            ))}
                        </Grid>
                    )}
                </SectionToggle>
            </Subsection>
        </Section>
    );
}

function CollisionTab({ npc, mutate }: TabProps) {
    const col = childEl(npc, "collision");
    return (
        <Section title="Collision">
            <SectionToggle present={!!col} onAdd={() => mutate((n) => ensureChild(n, "collision"))}>
                {col && (
                    <>
                        <ChildAttrsBlock
                            parent={col}
                            mutate={(fn) => mutate(() => fn(col))}
                            child="radius"
                            title="radius"
                            attrs={[
                                ["normal", "number"],
                                ["grown", "number"]
                            ]}
                        />
                        <ChildAttrsBlock
                            parent={col}
                            mutate={(fn) => mutate(() => fn(col))}
                            child="height"
                            title="height"
                            attrs={[
                                ["normal", "number"],
                                ["grown", "number"]
                            ]}
                        />
                    </>
                )}
            </SectionToggle>
        </Section>
    );
}

function MiscTab({ npc, mutate }: TabProps) {
    return (
        <Section title="Misc">
            <Grid>
                <ChildTextField label="corpseTime" child="corpseTime" npc={npc} mutate={mutate} type="number" />
                <ChildTextField label="exCrtEffect" child="exCrtEffect" npc={npc} mutate={mutate} type="text" />
                <ChildTextField label="sNpcPropHpRate" child="sNpcPropHpRate" npc={npc} mutate={mutate} type="number" />
            </Grid>
        </Section>
    );
}

// ─── primitive widgets ────────────────────────────────────────────────────────

const INP =
    "rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text)] focus:border-[var(--color-accent-2)] focus:outline-none";
const ADD_BTN =
    "mt-1 rounded border border-dashed border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-text)]";
const DEL_BTN =
    "rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-faint)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mb-6">
            <h2 className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">{title}</h2>
            {children}
        </div>
    );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mt-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <h3 className="mb-2 text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">{title}</h3>
            {children}
        </div>
    );
}

function Grid({ children }: { children: React.ReactNode }) {
    return <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">{children}</div>;
}

function SectionToggle({
    present,
    onAdd,
    children
}: {
    present: boolean;
    onAdd: () => void;
    children: React.ReactNode;
}) {
    if (!present) {
        return (
            <button type="button" onClick={onAdd} className={ADD_BTN}>
                + this section is empty — click to add it
            </button>
        );
    }
    return <>{children}</>;
}

function FieldShell({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-0.5" title={hint}>
            <span className="font-mono text-[10px] text-[var(--color-text-faint)]">{label}</span>
            {children}
        </label>
    );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
    return (
        <FieldShell label={label}>
            <input className={`${INP} opacity-60`} value={value} readOnly />
        </FieldShell>
    );
}

function AttrField({
    label,
    attr,
    npc,
    mutate,
    type
}: {
    label: string;
    attr: string;
    npc: Element;
    mutate: (fn: (npc: Element) => void) => void;
    type: "text" | "number";
}) {
    const v = npc.getAttribute(attr) ?? "";
    return (
        <FieldShell label={label}>
            <input
                className={INP}
                type={type}
                step={type === "number" ? "any" : undefined}
                value={v}
                onChange={(e) =>
                    mutate(() => {
                        if (e.target.value === "") npc.removeAttribute(attr);
                        else npc.setAttribute(attr, e.target.value);
                    })
                }
            />
        </FieldShell>
    );
}

function AttrSelect({
    label,
    attr,
    npc,
    mutate,
    options
}: {
    label: string;
    attr: string;
    npc: Element;
    mutate: (fn: (npc: Element) => void) => void;
    options: readonly string[];
}) {
    const v = npc.getAttribute(attr) ?? "";
    return (
        <FieldShell label={label}>
            <select
                className={INP}
                value={options.includes(v) ? v : ""}
                onChange={(e) =>
                    mutate(() => {
                        if (e.target.value === "") npc.removeAttribute(attr);
                        else npc.setAttribute(attr, e.target.value);
                    })
                }
            >
                <option value="">{v && !options.includes(v) ? `(custom: ${v})` : "(unset)"}</option>
                {options.map((o) => (
                    <option key={o} value={o}>
                        {o}
                    </option>
                ))}
            </select>
        </FieldShell>
    );
}

function AttrBool({
    label,
    hint,
    attr,
    npc,
    mutate
}: {
    label: string;
    hint?: string;
    attr: string;
    npc: Element;
    mutate: (fn: (npc: Element) => void) => void;
}) {
    const raw = npc.getAttribute(attr);
    const v = raw === null ? "" : raw === "true" ? "true" : raw === "false" ? "false" : raw;
    return (
        <FieldShell label={label} hint={hint}>
            <select
                className={INP}
                value={v}
                onChange={(e) =>
                    mutate(() => {
                        if (e.target.value === "") npc.removeAttribute(attr);
                        else npc.setAttribute(attr, e.target.value);
                    })
                }
            >
                <option value="">(unset)</option>
                <option value="true">true</option>
                <option value="false">false</option>
            </select>
        </FieldShell>
    );
}

function ChildTextField({
    label,
    child,
    npc,
    mutate,
    type
}: {
    label: string;
    child: string;
    npc: Element;
    mutate: (fn: (npc: Element) => void) => void;
    type: "text" | "number";
}) {
    const el = childEl(npc, child);
    return (
        <FieldShell label={label}>
            <input
                className={INP}
                type={type}
                step={type === "number" ? "any" : undefined}
                value={el?.textContent ?? ""}
                onChange={(e) =>
                    mutate(() => {
                        if (e.target.value === "") {
                            if (el) el.remove();
                        } else {
                            const target = el ?? npc.appendChild(npc.ownerDocument!.createElement(child));
                            target.textContent = e.target.value;
                        }
                    })
                }
            />
        </FieldShell>
    );
}

function ChildTextSelect({
    label,
    child,
    npc,
    mutate,
    options
}: {
    label: string;
    child: string;
    npc: Element;
    mutate: (fn: (npc: Element) => void) => void;
    options: readonly string[];
}) {
    const el = childEl(npc, child);
    const v = el?.textContent ?? "";
    return (
        <FieldShell label={label}>
            <select
                className={INP}
                value={options.includes(v) ? v : ""}
                onChange={(e) =>
                    mutate(() => {
                        if (e.target.value === "") {
                            if (el) el.remove();
                        } else {
                            const target = el ?? npc.appendChild(npc.ownerDocument!.createElement(child));
                            target.textContent = e.target.value;
                        }
                    })
                }
            >
                <option value="">{v && !options.includes(v) ? `(custom: ${v})` : "(unset)"}</option>
                {options.map((o) => (
                    <option key={o} value={o}>
                        {o}
                    </option>
                ))}
            </select>
        </FieldShell>
    );
}

type AttrSpec = "number" | "text" | { enum: readonly string[] };

function ChildAttrsBlock({
    parent,
    mutate,
    child,
    title,
    attrs
}: {
    parent: Element;
    mutate: (fn: (p: Element) => void) => void;
    child: string;
    title: string;
    attrs: [string, AttrSpec][];
}) {
    const el = childEl(parent, child);
    return (
        <Subsection title={title}>
            <SectionToggle present={!!el} onAdd={() => mutate((p) => ensureChild(p, child))}>
                {el && (
                    <Grid>
                        {attrs.map(([k, spec]) => {
                            if (typeof spec === "string") {
                                return (
                                    <AttrField
                                        key={k}
                                        label={k}
                                        attr={k}
                                        npc={el}
                                        mutate={(fn) => mutate(() => fn(el))}
                                        type={spec}
                                    />
                                );
                            }
                            return (
                                <AttrSelect
                                    key={k}
                                    label={k}
                                    attr={k}
                                    npc={el}
                                    mutate={(fn) => mutate(() => fn(el))}
                                    options={spec.enum}
                                />
                            );
                        })}
                    </Grid>
                )}
            </SectionToggle>
        </Subsection>
    );
}

function ListEditor({
    label,
    items,
    type,
    placeholder,
    onAdd,
    onChange,
    onRemove
}: {
    label: string;
    items: string[];
    type?: "text" | "number";
    placeholder?: string;
    onAdd: (v: string) => void;
    onChange: (i: number, v: string) => void;
    onRemove: (i: number) => void;
}) {
    return (
        <div className="mb-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">{label}</div>
            {items.map((v, i) => (
                <div key={i} className="mb-1 grid grid-cols-[1fr_auto] gap-2">
                    <input
                        className={INP}
                        type={type ?? "text"}
                        defaultValue={v}
                        onChange={(e) => onChange(i, e.target.value)}
                    />
                    <button type="button" className={DEL_BTN} onClick={() => onRemove(i)}>
                        ×
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={() => onAdd(type === "number" ? "0" : "")}
                className={ADD_BTN}
                title={placeholder}
            >
                + add
            </button>
        </div>
    );
}

function Placeholder({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-full items-center justify-center p-8 text-[12px] text-[var(--color-text-faint)]">
            {children}
        </div>
    );
}

// ─── dom helpers ──────────────────────────────────────────────────────────────

function childEl(parent: Element, tag: string): Element | null {
    for (const c of parent.children) {
        if (c.tagName === tag) return c;
    }
    return null;
}

function ensureChild(parent: Element, tag: string): Element {
    const existing = childEl(parent, tag);
    if (existing) return existing;
    const el = parent.ownerDocument!.createElement(tag);
    parent.appendChild(el);
    return el;
}

function nextSiblingComment(el: Element): string {
    let n = el.nextSibling;
    while (n && n.nodeType === Node.TEXT_NODE && !(n.textContent ?? "").trim()) n = n.nextSibling;
    if (n && n.nodeType === Node.COMMENT_NODE) return (n.textContent ?? "").trim();
    return "";
}

function serializeNpc(el: Element): string {
    return new XMLSerializer().serializeToString(el);
}

function parseNpcSnapshot(xml: string, doc: Document): Element | null {
    const parsed = new DOMParser().parseFromString(`<root>${xml}</root>`, "text/xml");
    if (parsed.querySelector("parsererror")) return null;
    const el = parsed.querySelector("npc");
    if (!el) return null;
    const imported = doc.importNode(el, true);
    const root = doc.querySelector("root")!;
    const cur = root.querySelector("npc");
    if (cur) root.replaceChild(imported, cur);
    else root.appendChild(imported);
    return imported;
}

function formatNpc(el: Element): string {
    // Re-serialize then pretty-print with tab indentation matching the L2J XML files.
    const raw = new XMLSerializer().serializeToString(el);
    return prettyPrint(raw);
}

function prettyPrint(xml: string): string {
    // Lightweight pretty printer: tab-indent, one element per line.
    const tokens = xml.replace(/>\s+</g, "><").replace(/></g, ">\n<").split("\n");
    let depth = 0;
    const out: string[] = [];
    for (const raw of tokens) {
        const line = raw.trim();
        if (!line) continue;
        const isClose = line.startsWith("</");
        const isSelfClose = line.endsWith("/>") || line.startsWith("<?") || line.startsWith("<!--");
        const isOpen = line.startsWith("<") && !isClose && !isSelfClose;
        if (isClose) depth = Math.max(0, depth - 1);
        out.push("\t".repeat(depth) + line);
        if (isOpen) depth += 1;
    }
    return out.join("\n");
}

function basename(p: string): string {
    const m = p.match(/[^\\/]+$/);
    return m ? m[0] : p;
}
