import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ClientNpc, loadClientNpcs } from "../../lib/clientNpcs";
import { compareValue, type Drift, type DriftField } from "../../lib/drift";
import { ipc, type NpcInfo, type SpawnPoint } from "../../lib/ipc";
import { logger } from "../../lib/logger";
import { EMPTY_SPAWN_INDEX, loadWorldSpawns, type WorldSpawnIndex } from "../../lib/spawns";
import { useSettings } from "../../state/SettingsContext";
import { useSetToolbarSlot } from "../../state/ToolbarSlot";
import { DriftBadge, DriftBanner } from "../Drift";
import { EditActions } from "../EditActions";
import { NpcEditor } from "./NpcEditor";

interface NpcRow {
    info: NpcInfo;
    ids: number[];
    spawnCount: number;
    bossCount: number;
    clients: Map<number, ClientNpc>;
    drift: Drift;
}

export function NpcsWorkspace({
    active,
    onOpenSkill
}: {
    active: boolean;
    onOpenSkill?: (skillId: number) => void;
}) {
    const { config } = useSettings();
    const dataRoot = config?.dataRoot ?? "";

    const [index, setIndex] = useState<WorldSpawnIndex>(EMPTY_SPAWN_INDEX);
    const [loading, setLoading] = useState(false);
    const [clientNpcs, setClientNpcs] = useState<Map<number, ClientNpc>>(() => new Map());

    const load = async () => {
        if (!dataRoot) return;
        setLoading(true);
        try {
            const [idx, client] = await Promise.all([loadWorldSpawns(dataRoot), loadClientNpcs()]);
            setIndex(idx);
            setClientNpcs(client);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!active || !dataRoot || index.npcs.size > 0) return;
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, dataRoot]);

    const setToolbarSlot = useSetToolbarSlot();

    const rows = useMemo<NpcRow[]>(() => {
        const spawnCount = new Map<number, number>();
        for (const s of index.spawns) {
            spawnCount.set(s.npcId, (spawnCount.get(s.npcId) ?? 0) + 1);
        }
        const bossCount = new Map<number, number>();
        for (const b of index.bosses) {
            bossCount.set(b.npcId, (bossCount.get(b.npcId) ?? 0) + 1);
        }
        const groups = new Map<string, NpcRow>();
        const all = [...index.npcs.values()].sort((a, b) => a.id - b.id);
        for (const info of all) {
            const key = info.name ? `${info.name}|${info.level}|${info.type}` : `__id:${info.id}`;
            const sc = spawnCount.get(info.id) ?? 0;
            const bc = bossCount.get(info.id) ?? 0;
            const existing = groups.get(key);
            if (existing) {
                existing.ids.push(info.id);
                existing.spawnCount += sc;
                existing.bossCount += bc;
            } else {
                groups.set(key, {
                    info,
                    ids: [info.id],
                    spawnCount: sc,
                    bossCount: bc,
                    clients: new Map(),
                    drift: { clientSource: "NpcName.dat", fields: [] }
                });
            }
        }
        const hasClient = clientNpcs.size > 0;
        for (const row of groups.values()) {
            const fields: DriftField[] = [];
            for (const id of row.ids) {
                const c = clientNpcs.get(id);
                if (c) row.clients.set(id, c);
                if (!hasClient) continue;
                const serverName = row.info.name ?? "";
                const idLabel = row.ids.length > 1 ? `name (#${id})` : "name";
                if (!c) {
                    fields.push({
                        label: idLabel,
                        server: serverName || "(empty)",
                        client: null,
                        kind: "missingInClient",
                        note: `id ${id} not present in NpcName.dat`
                    });
                    continue;
                }
                const f = compareValue({ label: idLabel, server: serverName, client: c.name });
                if (f) fields.push(f);
            }
            row.drift = {
                subject: row.ids.length > 1 ? `${row.ids.length} variants` : `#${row.info.id}`,
                clientSource: "NpcName.dat",
                fields
            };
        }
        return [...groups.values()].sort((a, b) => a.info.id - b.info.id);
    }, [index, clientNpcs]);

    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<string>("");
    const [driftFilter, setDriftFilter] = useState<"any" | "missing" | "mismatch" | "none">("any");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const clientLoaded = clientNpcs.size > 0;
    const missingCount = useMemo(
        () => rows.filter((r) => r.drift.fields.some((f) => f.kind === "missingInClient")).length,
        [rows]
    );

    const types = useMemo(() => {
        const set = new Set<string>();
        for (const r of rows) if (r.info.type) set.add(r.info.type);
        return [...set].sort();
    }, [rows]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((r) => {
            if (typeFilter && r.info.type !== typeFilter) return false;
            if (driftFilter !== "any") {
                const hasMissing = r.drift.fields.some((f) => f.kind === "missingInClient");
                const hasMismatch = r.drift.fields.some((f) => f.kind === "mismatch");
                if (driftFilter === "missing" && !hasMissing) return false;
                if (driftFilter === "mismatch" && !hasMismatch) return false;
                if (driftFilter === "none" && r.drift.fields.length > 0) return false;
            }
            if (!q) return true;
            if (r.info.name.toLowerCase().includes(q)) return true;
            if (String(r.info.id).includes(q)) return true;
            if (r.info.type.toLowerCase().includes(q)) return true;
            return false;
        });
    }, [rows, query, typeFilter, driftFilter]);

    const selected = useMemo(() => rows.find((r) => r.info.id === selectedId) ?? null, [rows, selectedId]);
    const [editVariantId, setEditVariantId] = useState<number | null>(null);
    useEffect(() => {
        if (!selected) {
            setEditVariantId(null);
            return;
        }
        if (editVariantId === null || !selected.ids.includes(editVariantId)) {
            setEditVariantId(selected.ids[0]);
        }
    }, [selected, editVariantId]);
    const editingNpc = useMemo<NpcInfo | null>(() => {
        if (!selected || editVariantId === null) return null;
        return index.npcs.get(editVariantId) ?? null;
    }, [selected, editVariantId, index]);
    const editingSpawns = useMemo<SpawnPoint[]>(
        () => (editVariantId === null ? [] : index.spawns.filter((s) => s.npcId === editVariantId)),
        [index, editVariantId]
    );
    const editingBosses = useMemo(
        () => (editVariantId === null ? [] : index.bosses.filter((b) => b.npcId === editVariantId)),
        [index, editVariantId]
    );

    const [dirty, setDirty] = useState(false);
    const commitRef = useRef<(() => Promise<void>) | null>(null);
    const undoRef = useRef<() => void>(() => {});
    const redoRef = useRef<() => void>(() => {});
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [saving, setSaving] = useState(false);

    const registerCommit = useCallback((commit: (() => Promise<void>) | null) => {
        commitRef.current = commit;
    }, []);
    const registerUndoRedo = useCallback((u: () => void, r: () => void, cu: boolean, cr: boolean) => {
        undoRef.current = u;
        redoRef.current = r;
        setCanUndo(cu);
        setCanRedo(cr);
    }, []);

    const { pendingTier2Edits, refreshPendingTier2Edits, syncToClient } = useSettings();
    const onSavedNameTitle = useCallback(
        async (id: number, name: string, _title: string) => {
            const client = clientNpcs.get(id);
            if (!client) return;
            if (compareValue({ label: "name", server: name, client: client.name }) === null) return;
            try {
                await ipc.applyGenericDatEdits("npc_name", { id }, { name });
                await refreshPendingTier2Edits("npc_name");
                logger.info("npc", `queued NpcName.dat update for #${id}: "${client.name}" → "${name}"`);
                setClientNpcs((prev) => {
                    const next = new Map(prev);
                    next.set(id, { ...client, name });
                    return next;
                });
            } catch (e) {
                logger.warn("npc", `couldn't queue NpcName.dat update for #${id}`, { message: String(e) });
            }
        },
        [clientNpcs, refreshPendingTier2Edits]
    );

    const onSave = useCallback(async () => {
        if (!commitRef.current || saving) return;
        setSaving(true);
        try {
            await commitRef.current();
            const pending = pendingTier2Edits.get("npc_name");
            if (pending && pending.size > 0) {
                await syncToClient();
            }
        } finally {
            setSaving(false);
        }
    }, [saving, pendingTier2Edits, syncToClient]);

    const editorMounted = !!editingNpc;
    useEffect(() => {
        if (!active) return;
        const hasPendingClientSync = (pendingTier2Edits.get("npc_name")?.size ?? 0) > 0;
        const saveDisabled = saving || (!dirty && !hasPendingClientSync) || !editorMounted;
        const clientHint = hasPendingClientSync
            ? ` + flush ${pendingTier2Edits.get("npc_name")!.size} NpcName row(s)`
            : "";
        setToolbarSlot(
            <EditActions
                onUndo={() => undoRef.current()}
                onRedo={() => redoRef.current()}
                canUndo={editorMounted && canUndo}
                canRedo={editorMounted && canRedo}
                dirty={dirty || hasPendingClientSync}
                dirtyTitle="Unsaved NPC changes"
                saving={saving}
                saveDisabled={saveDisabled}
                saveLabel={hasPendingClientSync ? `Save${clientHint}` : "Save"}
                saveTitle={
                    saveDisabled
                        ? editorMounted
                            ? "Nothing to save"
                            : "Pick an NPC to edit"
                        : `Write npcs XML${clientHint}`
                }
                onSave={onSave}
                onReload={load}
                reloadDisabled={loading || saving}
            />
        );
        return () => setToolbarSlot(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, dirty, canUndo, canRedo, saving, editorMounted, onSave, loading, pendingTier2Edits]);

    if (!dataRoot) {
        return <Placeholder>Set the server data folder in Settings to load NPCs.</Placeholder>;
    }
    if (rows.length === 0 && loading) {
        return <Placeholder>Loading NPCs…</Placeholder>;
    }
    if (rows.length === 0) {
        return <Placeholder>No NPCs found under data/stats/npcs/.</Placeholder>;
    }

    return (
        <div className="flex h-full">
            <div className="flex w-[420px] shrink-0 flex-col border-r border-[var(--color-border)]">
                <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="search by name, id, or type…"
                        className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent-2)] focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text)] focus:border-[var(--color-accent-2)] focus:outline-none"
                        >
                            <option value="">all types ({types.length})</option>
                            {types.map((t) => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </select>
                        <span className="font-mono text-[10px] text-[var(--color-text-faint)]">
                            {filtered.length} / {rows.length}
                        </span>
                    </div>
                    {clientLoaded && (
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                                drift
                            </span>
                            {(["any", "missing", "mismatch", "none"] as const).map((opt) => (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setDriftFilter(opt)}
                                    className={`rounded border px-1.5 py-0.5 text-[10px] ${
                                        driftFilter === opt
                                            ? "border-[var(--color-accent-2)] bg-[var(--color-surface-2)] text-[var(--color-accent)]"
                                            : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)]"
                                    }`}
                                    title={
                                        opt === "missing"
                                            ? `Show NPCs not present in NpcName.dat (${missingCount})`
                                            : opt === "mismatch"
                                            ? "Show NPCs whose name disagrees with NpcName.dat"
                                            : opt === "none"
                                            ? "Show NPCs fully in sync with the client"
                                            : "Show all NPCs"
                                    }
                                >
                                    {opt === "missing" && missingCount > 0 ? `${opt} (${missingCount})` : opt}
                                </button>
                            ))}
                        </div>
                    )}
                    {!clientLoaded && (
                        <div
                            className="text-[10px] text-[var(--color-text-faint)]"
                            title="Set the client folder in Settings (and have NpcName-*.dat present) to enable drift checking."
                        >
                            client NPC data not loaded — drift check disabled
                        </div>
                    )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {filtered.map((r) => {
                        const isBoss = r.bossCount > 0;
                        const color = isBoss ? "#f87171" : "#7dd3fc";
                        const sel = r.info.id === selectedId;
                        return (
                            <button
                                type="button"
                                key={r.info.id}
                                onClick={() => setSelectedId(r.info.id)}
                                className={`flex w-full items-center gap-2 border-b border-white/5 px-3 py-1.5 text-left text-[12px] hover:bg-white/5 ${
                                    sel ? "bg-white/10" : ""
                                }`}
                            >
                                <span
                                    className={`inline-block h-2 w-2 shrink-0 ${isBoss ? "rotate-45" : "rounded-sm"}`}
                                    style={{ background: color }}
                                />
                                <span className="w-14 shrink-0 font-mono text-[10px] text-[var(--color-text-faint)]">
                                    #{r.info.id}
                                </span>
                                <span
                                    className="flex-1 truncate"
                                    title={
                                        r.ids.length > 1
                                            ? `${r.info.name} — ${r.ids.length} variant ids: ${r.ids.join(", ")}`
                                            : r.info.name
                                    }
                                >
                                    {r.info.name || "(unnamed)"}
                                </span>
                                <DriftBadge drift={r.drift} />
                                {r.ids.length > 1 && (
                                    <span
                                        className="shrink-0 rounded bg-white/5 px-1 font-mono text-[10px] text-[var(--color-text-faint)]"
                                        title={`shares this name+level with ${r.ids.length - 1} other id${r.ids.length - 1 === 1 ? "" : "s"}`}
                                    >
                                        ×{r.ids.length}
                                    </span>
                                )}
                                {r.info.level > 0 && (
                                    <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-faint)]">
                                        Lv {r.info.level}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                    {filtered.length === 0 && (
                        <div className="px-4 py-6 text-[11px] text-[var(--color-text-faint)]">
                            No NPCs match the current filter.
                        </div>
                    )}
                </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
                {selected && selected.ids.length > 1 && (
                    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px]">
                        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                            variant
                        </span>
                        <div className="flex flex-wrap gap-1">
                            {selected.ids.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setEditVariantId(id)}
                                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                                        id === editVariantId
                                            ? "border-[var(--color-accent-2)] bg-[var(--color-surface-2)] text-[var(--color-accent)]"
                                            : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)]"
                                    }`}
                                >
                                    #{id}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {selected && selected.drift.fields.length > 0 && (
                    <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                        <DriftBanner drift={selected.drift} title="NPC out of sync with client" />
                    </div>
                )}
                {editingNpc ? (
                    <NpcEditor
                        key={`${editingNpc.id}|${editingNpc.filePath}`}
                        npcId={editingNpc.id}
                        filePath={editingNpc.filePath}
                        spawns={editingSpawns}
                        bosses={editingBosses}
                        onSavedNameTitle={onSavedNameTitle}
                        onRegisterCommit={registerCommit}
                        onRegisterUndoRedo={registerUndoRedo}
                        onDirtyChange={setDirty}
                        onOpenSkill={onOpenSkill}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-faint)]">
                        Pick an NPC from the list to see its details.
                    </div>
                )}
            </div>
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
