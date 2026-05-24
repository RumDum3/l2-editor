import { useEffect, useMemo, useState } from "react";
import { type ClientNpc, loadClientNpcs } from "../../lib/clientNpcs";
import type { NpcInfo, SpawnPoint } from "../../lib/ipc";
import { EMPTY_SPAWN_INDEX, loadWorldSpawns, type WorldSpawnIndex } from "../../lib/spawns";
import { regionOf } from "../../lib/worldCoords";
import { useSettings } from "../../state/SettingsContext";
import { useSetToolbarSlot } from "../../state/ToolbarSlot";
import { EditActions } from "../EditActions";

function normalizeName(s: string): string {
    const INVISIBLE = /[   　​]/g;
    return s.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim().normalize("NFC");
}

function codepoints(s: string): string {
    return [...s].map((ch) => ch.codePointAt(0)?.toString(16).padStart(4, "0") ?? "").join(" ");
}

interface DriftDetail {
    id: number;
    serverName: string;
    clientName: string | null;
    clientNick: string;
    nameMismatch: boolean;
    missingInClient: boolean;
}

interface NpcRow {
    info: NpcInfo;
    ids: number[];
    spawnCount: number;
    bossCount: number;
    clients: Map<number, ClientNpc>;
    drift: DriftDetail[];
    hasDrift: boolean;
}

export function NpcsWorkspace({ active }: { active: boolean }) {
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
    useEffect(() => {
        if (!active) return;
        setToolbarSlot(
            <EditActions
                onUndo={() => {}}
                onRedo={() => {}}
                canUndo={false}
                canRedo={false}
                onSave={() => {}}
                saveDisabled
                saveTitle="NPC editing is not implemented yet"
                onReload={load}
                reloadDisabled={loading}
            />
        );
        return () => setToolbarSlot(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, setToolbarSlot, loading, dataRoot]);

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
                    drift: [],
                    hasDrift: false
                });
            }
        }
        const hasClient = clientNpcs.size > 0;
        for (const row of groups.values()) {
            for (const id of row.ids) {
                const c = clientNpcs.get(id);
                if (c) row.clients.set(id, c);
                if (!hasClient) continue;
                const serverName = row.info.name ?? "";
                if (!c) {
                    row.drift.push({
                        id,
                        serverName,
                        clientName: null,
                        clientNick: "",
                        nameMismatch: false,
                        missingInClient: true
                    });
                } else if (serverName && c.name && normalizeName(serverName) !== normalizeName(c.name)) {
                    row.drift.push({
                        id,
                        serverName,
                        clientName: c.name,
                        clientNick: c.nick,
                        nameMismatch: true,
                        missingInClient: false
                    });
                }
            }
            row.hasDrift = row.drift.length > 0;
        }
        return [...groups.values()].sort((a, b) => a.info.id - b.info.id);
    }, [index, clientNpcs]);

    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<string>("");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const clientLoaded = clientNpcs.size > 0;

    const types = useMemo(() => {
        const set = new Set<string>();
        for (const r of rows) if (r.info.type) set.add(r.info.type);
        return [...set].sort();
    }, [rows]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((r) => {
            if (typeFilter && r.info.type !== typeFilter) return false;
            if (!q) return true;
            if (r.info.name.toLowerCase().includes(q)) return true;
            if (String(r.info.id).includes(q)) return true;
            if (r.info.type.toLowerCase().includes(q)) return true;
            return false;
        });
    }, [rows, query, typeFilter]);

    const selected = useMemo(() => rows.find((r) => r.info.id === selectedId) ?? null, [rows, selectedId]);
    const selectedIdSet = useMemo(() => new Set(selected?.ids ?? []), [selected]);
    const selectedSpawns = useMemo<SpawnPoint[]>(() => {
        if (selectedIdSet.size === 0) return [];
        return index.spawns.filter((s) => selectedIdSet.has(s.npcId));
    }, [index, selectedIdSet]);
    const selectedBosses = useMemo(() => {
        if (selectedIdSet.size === 0) return [];
        return index.bosses.filter((b) => selectedIdSet.has(b.npcId));
    }, [index, selectedIdSet]);

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
                                {r.hasDrift && (
                                    <span
                                        className="flex shrink-0 items-center gap-1 rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-warning)]"
                                        title={driftTitle(r)}
                                    >
                                        <span className="font-bold leading-none">!</span>
                                        <span className="font-mono">{driftSummary(r)}</span>
                                    </span>
                                )}
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
            <div className="min-w-0 flex-1 overflow-y-auto">
                {selected ? (
                    <NpcDetailView row={selected} spawns={selectedSpawns} bosses={selectedBosses} />
                ) : (
                    <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-faint)]">
                        Pick an NPC from the list to see its details.
                    </div>
                )}
            </div>
        </div>
    );
}

function driftSummary(row: NpcRow): string {
    const d = row.drift[0];
    if (!d) return "";
    if (d.missingInClient) return `missing in client${row.drift.length > 1 ? ` +${row.drift.length - 1}` : ""}`;
    const client = d.clientName || "(empty)";
    const more = row.drift.length > 1 ? ` +${row.drift.length - 1}` : "";
    return `client: ${client}${more}`;
}

function driftTitle(row: NpcRow): string {
    const lines = [`${row.drift.length} of ${row.ids.length} id(s) disagree with client:`];
    for (const d of row.drift.slice(0, 4)) {
        if (d.missingInClient) lines.push(`  #${d.id}: missing in client NpcName`);
        else lines.push(`  #${d.id}: server "${d.serverName}" / client "${d.clientName ?? ""}"`);
    }
    if (row.drift.length > 4) lines.push(`  … and ${row.drift.length - 4} more`);
    return lines.join("\n");
}

function NpcDetailView({
    row,
    spawns,
    bosses
}: {
    row: NpcRow;
    spawns: SpawnPoint[];
    bosses: Array<{ npcId: number; name: string; type: string; level: number; x: number; y: number; respawn: string }>;
}) {
    const totalSpawns = spawns.length + bosses.length;
    const regions = useMemo(() => {
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
    }, [spawns, bosses]);

    return (
        <div className="flex flex-col gap-4 p-5 text-[12px] text-[var(--color-text)]">
            <header className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] text-[var(--color-text-faint)]">#{row.info.id}</span>
                <h2 className="font-mono text-base">{row.info.name || "(unnamed)"}</h2>
                {row.info.type && (
                    <span className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                        {row.info.type}
                    </span>
                )}
                {row.info.level > 0 && (
                    <span className="font-mono text-[11px] text-[var(--color-text-faint)]">Lv {row.info.level}</span>
                )}
            </header>

            {row.hasDrift && (
                <section className="rounded border border-[var(--color-warning)] bg-[var(--color-warning)]/5 px-3 py-2">
                    <div className="mb-1 flex items-center gap-2">
                        <span className="font-mono text-[12px] font-bold text-[var(--color-warning)]">!</span>
                        <h3 className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-warning)]">
                            client out of sync with server
                        </h3>
                    </div>
                    <p className="mb-2 text-[11px] text-[var(--color-text-faint)]">
                        Client NpcName.dat disagrees with the server for the id{row.drift.length === 1 ? "" : "s"}{" "}
                        below.
                    </p>
                    <div className="flex flex-col gap-2 font-mono text-[11px]">
                        {row.drift.map((d) => (
                            <div key={d.id} className="flex flex-col gap-0.5 border-t border-white/5 pt-1.5">
                                <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-faint)]">
                                    <span>#{d.id}</span>
                                    <span>·</span>
                                    <span>field: name</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="w-12 shrink-0 text-[9px] uppercase tracking-wider text-[var(--color-accent-2)]">
                                        server
                                    </span>
                                    <span
                                        className="truncate"
                                        title={`${d.serverName}\nlen ${d.serverName.length}\nU+ ${codepoints(d.serverName)}`}
                                    >
                                        {d.serverName || "(empty)"}
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="w-12 shrink-0 text-[9px] uppercase tracking-wider text-[var(--color-warning)]">
                                        client
                                    </span>
                                    {d.missingInClient ? (
                                        <span className="text-[var(--color-warning)]">
                                            (row missing — client has no entry for this id)
                                        </span>
                                    ) : (
                                        <>
                                            <span
                                                className="truncate text-[var(--color-warning)]"
                                                title={`${d.clientName ?? ""}\nlen ${(d.clientName ?? "").length}\nU+ ${codepoints(d.clientName ?? "")}`}
                                            >
                                                {d.clientName || "(empty)"}
                                            </span>
                                            {d.clientNick && (
                                                <span
                                                    className="shrink-0 text-[10px] text-[var(--color-text-faint)]"
                                                    title="client nickname / title"
                                                >
                                                    «{d.clientNick}»
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {row.clients.size > 0 && !row.hasDrift && (
                <section>
                    <h3 className="mb-1.5 text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
                        client (NpcName.dat)
                    </h3>
                    <div className="flex flex-col gap-1 font-mono text-[11px]">
                        {[...row.clients.values()].map((c) => (
                            <KvRow
                                key={c.id}
                                k={`#${c.id}`}
                                v={c.nick ? `${c.name} «${c.nick}»` : c.name || "(empty)"}
                            />
                        ))}
                    </div>
                </section>
            )}

            <section>
                <h3 className="mb-1.5 text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
                    summary
                </h3>
                <div className="flex flex-col gap-1 font-mono text-[11px]">
                    <KvRow
                        k="npc id"
                        v={
                            row.ids.length > 1
                                ? `${row.info.id}  (+${row.ids.length - 1} variants)`
                                : String(row.info.id)
                        }
                    />
                    {row.ids.length > 1 && <KvRow k="all ids" v={row.ids.join(", ")} />}
                    <KvRow k="type" v={row.info.type || "—"} />
                    <KvRow k="level" v={row.info.level > 0 ? String(row.info.level) : "—"} />
                    <KvRow k="total spawn points" v={String(totalSpawns)} />
                    <KvRow k="regions covered" v={String(regions.length)} />
                </div>
            </section>

            {bosses.length > 0 && (
                <section>
                    <h3 className="mb-1.5 text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
                        boss spawns
                    </h3>
                    <div className="flex flex-col">
                        {bosses.map((b, i) => (
                            <Row key={i}>
                                <span className="font-mono text-[11px]">
                                    {b.x}, {b.y}
                                </span>
                                <span className="text-[10px] text-[var(--color-text-faint)]">
                                    respawn {b.respawn || "—"}
                                </span>
                            </Row>
                        ))}
                    </div>
                </section>
            )}

            {spawns.length > 0 && (
                <section>
                    <h3 className="mb-1.5 text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
                        spawn points ({spawns.length})
                    </h3>
                    <div className="flex max-h-[300px] flex-col overflow-y-auto rounded border border-[var(--color-border)]">
                        {spawns.slice(0, 200).map((s, i) => {
                            const { rx, ry } = regionOf(s.x, s.y);
                            return (
                                <Row key={i}>
                                    <span className="font-mono text-[11px]">
                                        {s.x}, {s.y}
                                    </span>
                                    <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-faint)]">
                                        region {rx}_{ry}
                                    </span>
                                    {s.count > 1 && (
                                        <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-faint)]">
                                            ×{s.count}
                                        </span>
                                    )}
                                    {s.respawn && (
                                        <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-faint)]">
                                            {s.respawn}
                                        </span>
                                    )}
                                    {!s.inlineCoords && (
                                        <span className="shrink-0 rounded bg-white/5 px-1 text-[9px] uppercase tracking-wider text-[var(--color-text-faint)]">
                                            grp
                                        </span>
                                    )}
                                </Row>
                            );
                        })}
                        {spawns.length > 200 && (
                            <div className="px-2 py-1.5 text-[10px] text-[var(--color-text-faint)]">
                                … and {spawns.length - 200} more
                            </div>
                        )}
                    </div>
                </section>
            )}

            {regions.length > 0 && (
                <section>
                    <h3 className="mb-1.5 text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
                        regions
                    </h3>
                    <div className="flex flex-wrap gap-1">
                        {regions.slice(0, 40).map(([region, n]) => (
                            <span
                                key={region}
                                className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-faint)]"
                            >
                                {region} ×{n}
                            </span>
                        ))}
                        {regions.length > 40 && (
                            <span className="text-[10px] text-[var(--color-text-faint)]">
                                + {regions.length - 40} more
                            </span>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}

function KvRow({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="shrink-0 text-[var(--color-text-faint)]">{k}</span>
            <span className="break-all text-right">{v}</span>
        </div>
    );
}

function Row({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 border-b border-white/5 px-2 py-1.5 last:border-b-0">{children}</div>
    );
}

function Placeholder({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-full items-center justify-center p-8 text-[12px] text-[var(--color-text-faint)]">
            {children}
        </div>
    );
}
