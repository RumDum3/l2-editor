import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type AppConfig, type ClientDatPaths, ipc, type SkillgrpSummary, type SkillNameSummary } from "../lib/ipc";
import { logger } from "../lib/logger";
import { invalidateAll as invalidateSkillRowCache } from "../lib/skillRowCache";
import { invalidateAllSkillnames } from "../lib/skillNameRowCache";
import { TIER2_DATS } from "../lib/tier2Dats";
import { invalidateTier2 } from "../lib/tier2RowCache";

export type ProbeState =
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "done"; protocol: number }
    | { kind: "error"; message: string };

export type ServerProtocolsState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "done"; protocols: number[] }
    | { kind: "error"; message: string };

export type SkillNamesState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "done"; summary: SkillNameSummary }
    | { kind: "error"; message: string };

export type SkillgrpState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "done"; summary: SkillgrpSummary }
    | { kind: "error"; message: string };

type SettingsState = {
    config: AppConfig | null;
    loaded: boolean;
    setDataRoot: (path: string) => Promise<void>;
    setClientRoot: (path: string) => Promise<void>;
    setSkillNamesDatPath: (path: string) => Promise<void>;
    setSkillgrpDatPath: (path: string) => Promise<void>;
    setTier2DatPath: (key: string, path: string) => Promise<void>;
    probe: ProbeState;
    probeProtocol: (force?: boolean) => Promise<void>;
    serverProtocols: ServerProtocolsState;
    refreshServerProtocols: () => Promise<void>;
    skillNames: SkillNamesState;
    importSkillNames: (path: string) => Promise<void>;
    skillgrp: SkillgrpState;
    importSkillgrp: (path: string) => Promise<void>;
    rebuildClientCaches: () => Promise<void>;
    pendingClientEdits: ReadonlySet<number>;
    pendingSkillNameEdits: ReadonlySet<number>;
    pendingTier2Edits: ReadonlyMap<string, ReadonlySet<number>>;
    refreshPendingClientEdits: () => Promise<void>;
    refreshPendingSkillNameEdits: () => Promise<void>;
    refreshPendingTier2Edits: (key: string) => Promise<void>;
    syncToClient: () => Promise<void>;
};

const SettingsCtx = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                setConfig(await ipc.readConfig());
            } catch (e) {
                console.error("read_config failed:", e);
                setConfig({
                    dataRoot: "",
                    clientRoot: "",
                    skillNamesDatPath: "",
                    skillgrpDatPath: ""
                });
            } finally {
                setLoaded(true);
            }
        })();
    }, []);

    const configRef = useRef(config);
    configRef.current = config;

    const writePartial = useCallback(async (patch: Partial<AppConfig>) => {
        const cur = configRef.current;
        const next: AppConfig = {
            dataRoot: cur?.dataRoot ?? "",
            clientRoot: cur?.clientRoot ?? "",
            skillNamesDatPath: cur?.skillNamesDatPath ?? "",
            skillgrpDatPath: cur?.skillgrpDatPath ?? "",
            tier2DatPaths: cur?.tier2DatPaths,
            clientProtocol: cur?.clientProtocol ?? null,
            ...patch
        };
        configRef.current = next;
        await ipc.writeConfig(next);
        setConfig(next);
    }, []);

    const setDataRoot = useCallback((path: string) => writePartial({ dataRoot: path }), [writePartial]);
    const setClientRoot = useCallback((path: string) => writePartial({ clientRoot: path }), [writePartial]);
    const setSkillNamesDatPath = useCallback(
        (path: string) => writePartial({ skillNamesDatPath: path }),
        [writePartial]
    );
    const setSkillgrpDatPath = useCallback((path: string) => writePartial({ skillgrpDatPath: path }), [writePartial]);
    const setTier2DatPath = useCallback(
        (key: string, path: string) => {
            const next = { ...(config?.tier2DatPaths ?? {}), [key]: path };
            return writePartial({ tier2DatPaths: next });
        },
        [config?.tier2DatPaths, writePartial]
    );

    const [probe, setProbe] = useState<ProbeState>({ kind: "idle" });
    const lastProbedRef = useRef<string>("");

    const probeProtocol = useCallback(
        async (force = false) => {
            const root = config?.clientRoot;
            if (!root) {
                setProbe({ kind: "idle" });
                lastProbedRef.current = "";
                return;
            }
            if (!force && root === lastProbedRef.current) return;
            lastProbedRef.current = root;
            setProbe({ kind: "running" });
            try {
                const protocol = await ipc.probeL2Protocol(root);
                logger.info("settings", `probed L2 protocol ${protocol}`);
                setProbe({ kind: "done", protocol });
                if (config?.clientProtocol !== protocol) await writePartial({ clientProtocol: protocol });
            } catch (e) {
                const message = String(e);
                logger.warn("settings", "L2 protocol probe failed", { message });
                setProbe({ kind: "error", message });
            }
        },
        [config?.clientRoot, config?.clientProtocol, writePartial]
    );

    useEffect(() => {
        if (!loaded) return;
        const root = config?.clientRoot;
        if (root && root !== lastProbedRef.current) {
            void probeProtocol(false);
        } else if (!root) {
            setProbe({ kind: "idle" });
            lastProbedRef.current = "";
        }
    }, [loaded, config?.clientRoot, probeProtocol]);

    const [serverProtocols, setServerProtocols] = useState<ServerProtocolsState>({ kind: "idle" });
    const lastServerRootRef = useRef<string>("");

    const refreshServerProtocols = useCallback(async () => {
        const root = config?.dataRoot;
        if (!root) {
            setServerProtocols({ kind: "idle" });
            lastServerRootRef.current = "";
            return;
        }
        lastServerRootRef.current = root;
        setServerProtocols({ kind: "loading" });
        try {
            const protocols = await ipc.readServerProtocols(root);
            logger.info("settings", `server protocols ${protocols.join(", ")}`);
            setServerProtocols({ kind: "done", protocols });
        } catch (e) {
            const message = String(e);
            logger.warn("settings", "server protocols read failed", { message });
            setServerProtocols({ kind: "error", message });
        }
    }, [config?.dataRoot]);

    useEffect(() => {
        if (!loaded) return;
        const root = config?.dataRoot;
        if (root && root !== lastServerRootRef.current) {
            void refreshServerProtocols();
        } else if (!root) {
            setServerProtocols({ kind: "idle" });
            lastServerRootRef.current = "";
        }
    }, [loaded, config?.dataRoot, refreshServerProtocols]);

    const [skillNames, setSkillNames] = useState<SkillNamesState>({ kind: "idle" });

    const importSkillNames = useCallback(
        async (path: string) => {
            if (!path) return;
            setSkillNames({ kind: "loading" });
            try {
                await writePartial({ skillNamesDatPath: path });
                const summary = await ipc.importSkillNames(path);
                logger.info("settings", `imported ${summary.rowCount} skill name rows from ${summary.source}`);
                invalidateAllSkillnames();
                setSkillNames({ kind: "done", summary });
            } catch (e) {
                const message = String(e);
                logger.warn("settings", "skill names import failed", { message });
                setSkillNames({ kind: "error", message });
            }
        },
        [writePartial]
    );

    const [skillgrp, setSkillgrp] = useState<SkillgrpState>({ kind: "idle" });

    const importSkillgrp = useCallback(
        async (path: string) => {
            if (!path) return;
            setSkillgrp({ kind: "loading" });
            try {
                await writePartial({ skillgrpDatPath: path });
                const summary = await ipc.importSkillgrp(path);
                logger.info("settings", `imported ${summary.rowCount} skillgrp rows from ${summary.source}`);

                invalidateSkillRowCache();
                setSkillgrp({ kind: "done", summary });
                setPendingClientEdits(new Set());
            } catch (e) {
                const message = String(e);
                logger.warn("settings", "skillgrp import failed", { message });
                setSkillgrp({ kind: "error", message });
            }
        },
        [writePartial]
    );

    useEffect(() => {
        if (!loaded) return;
        let cancelled = false;
        setSkillgrp({ kind: "loading" });
        setSkillNames({ kind: "loading" });
        (async () => {
            const root = config?.clientRoot;
            let dats: ClientDatPaths;
            if (root) {
                try {
                    dats = await ipc.discoverClientDats(root);
                } catch (e) {
                    const message = String(e);
                    logger.warn("settings", "client .dat discovery failed", { message });
                    if (!cancelled) {
                        setSkillgrp({ kind: "error", message });
                        setSkillNames({ kind: "error", message });
                    }
                    return;
                }
            } else {
                dats = { skillgrp: null, skillName: null, tier2: {} };
            }
            if (cancelled) return;

            const knownGrp = configRef.current?.skillgrpDatPath ?? "";
            if (dats.skillgrp && dats.skillgrp !== knownGrp) {
                await importSkillgrp(dats.skillgrp);
            } else {
                try {
                    const cached = await ipc.readSkillgrpSummary();
                    if (cancelled) return;
                    if (cached) {
                        logger.info("settings", `skillgrp ready (${cached.rowCount} rows indexed)`);
                        setSkillgrp({ kind: "done", summary: cached });
                    } else if (dats.skillgrp) {
                        await importSkillgrp(dats.skillgrp);
                    } else {
                        setSkillgrp({ kind: "idle" });
                    }
                } catch (e) {
                    if (!cancelled) setSkillgrp({ kind: "error", message: String(e) });
                }
            }
            if (cancelled) return;

            const knownName = configRef.current?.skillNamesDatPath ?? "";
            if (dats.skillName && dats.skillName !== knownName) {
                await importSkillNames(dats.skillName);
            } else {
                try {
                    const cached = await ipc.readSkillnameSummary();
                    if (cancelled) return;
                    if (cached) {
                        logger.info("settings", `skill names ready (${cached.rowCount} rows indexed)`);
                        setSkillNames({ kind: "done", summary: cached });
                    } else if (dats.skillName) {
                        await importSkillNames(dats.skillName);
                    } else {
                        setSkillNames({ kind: "idle" });
                    }
                } catch (e) {
                    if (!cancelled) setSkillNames({ kind: "error", message: String(e) });
                }
            }
            if (cancelled) return;

            for (const entry of TIER2_DATS) {
                const found = dats.tier2[entry.key];
                if (!found) continue;
                const known = configRef.current?.tier2DatPaths?.[entry.key] ?? "";
                if (found !== known) {
                    try {
                        await writePartial({
                            tier2DatPaths: { ...(configRef.current?.tier2DatPaths ?? {}), [entry.key]: found }
                        });
                        const summary = await ipc.importGenericDat(entry.key, found, entry.indexField);
                        invalidateTier2(entry.key);
                        logger.info(
                            "settings",
                            `imported tier-2 dat "${entry.key}" (${summary.rowCount} rows) from ${found}`
                        );
                    } catch (e) {
                        logger.warn("settings", `tier-2 dat "${entry.key}" import failed`, { message: String(e) });
                    }
                } else {
                    try {
                        const cached = await ipc.readGenericDatSummary(entry.key);
                        if (cached) {
                            logger.info("settings", `tier-2 dat "${entry.key}" ready (${cached.rowCount} rows)`);
                        } else {
                            const fresh = await ipc.importGenericDat(entry.key, found, entry.indexField);
                            invalidateTier2(entry.key);
                            logger.info(
                                "settings",
                                `re-imported tier-2 dat "${entry.key}" (cache stale): ${fresh.rowCount} rows`
                            );
                        }
                    } catch (e) {
                        logger.warn("settings", `tier-2 dat "${entry.key}" hydration failed`, { message: String(e) });
                    }
                }
                if (cancelled) return;
            }

            if (root) {
                try {
                    const n = await ipc.pruneLegacyDatCaches(Object.keys(dats.tier2));
                    if (n > 0) logger.info("settings", `pruned ${n} legacy dat_*.json cache${n === 1 ? "" : "s"}`);
                } catch (e) {
                    logger.warn("settings", "prune legacy dat caches failed", { message: String(e) });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded, config?.clientRoot, config?.clientProtocol, importSkillgrp, importSkillNames]);

    const rebuildClientCaches = useCallback(async () => {
        const root = configRef.current?.clientRoot;
        if (!root) {
            logger.warn("settings", "rebuild client caches: no client folder set");
            return;
        }
        let dats: ClientDatPaths;
        try {
            dats = await ipc.discoverClientDats(root);
        } catch (e) {
            logger.warn("settings", "rebuild client caches: discovery failed", { message: String(e) });
            return;
        }
        if (dats.skillgrp) await importSkillgrp(dats.skillgrp);
        if (dats.skillName) await importSkillNames(dats.skillName);
        for (const entry of TIER2_DATS) {
            const found = dats.tier2[entry.key];
            if (!found) continue;
            try {
                await writePartial({
                    tier2DatPaths: { ...(configRef.current?.tier2DatPaths ?? {}), [entry.key]: found }
                });
                const summary = await ipc.importGenericDat(entry.key, found, entry.indexField);
                invalidateTier2(entry.key);
                logger.info("settings", `rebuilt tier-2 dat "${entry.key}" (${summary.rowCount} rows)`);
            } catch (e) {
                logger.warn("settings", `rebuild tier-2 dat "${entry.key}" failed`, { message: String(e) });
            }
        }
    }, [importSkillgrp, importSkillNames, writePartial]);

    const [pendingClientEdits, setPendingClientEdits] = useState<Set<number>>(() => new Set());

    const [pendingSkillNameEdits, setPendingSkillNameEdits] = useState<Set<number>>(() => new Set());

    const [pendingTier2Edits, setPendingTier2Edits] = useState<Map<string, ReadonlySet<number>>>(() => new Map());

    const refreshPendingClientEdits = useCallback(async () => {
        try {
            setPendingClientEdits(new Set(await ipc.pendingSkillIds()));
        } catch (e) {
            logger.warn("settings", "refresh pending client edits failed", { message: String(e) });
        }
    }, []);
    const refreshPendingSkillNameEdits = useCallback(async () => {
        try {
            setPendingSkillNameEdits(new Set(await ipc.pendingSkillnameIds()));
        } catch (e) {
            logger.warn("settings", "refresh pending skillname edits failed", { message: String(e) });
        }
    }, []);
    const refreshPendingTier2Edits = useCallback(async (key: string) => {
        try {
            const ids = await ipc.pendingGenericDatIds(key);
            setPendingTier2Edits((prev) => {
                const next = new Map(prev);
                if (ids.length === 0) next.delete(key);
                else next.set(key, new Set(ids));
                return next;
            });
        } catch (e) {
            logger.warn("settings", `refresh pending tier-2 ${key} failed`, { message: String(e) });
        }
    }, []);

    const syncToClient = useCallback(async () => {
        const skillgrpTarget = config?.skillgrpDatPath;
        const skillnameTarget = config?.skillNamesDatPath;
        let didAny = false;
        if (pendingClientEdits.size > 0) {
            if (!skillgrpTarget) {
                logger.warn("settings", "skipped Skillgrp sync — path not configured in Settings");
            } else {
                try {
                    const res = await ipc.saveSkillgrp(skillgrpTarget);
                    const tail =
                        res.newNamesAdded > 0
                            ? `, +${res.newNamesAdded} new MAP_INT name${res.newNamesAdded === 1 ? "" : "s"}`
                            : "";
                    logger.info("settings", `wrote skillgrp (${res.bytesWritten} bytes${tail})`);
                    setPendingClientEdits(new Set());
                    didAny = true;
                } catch (e) {
                    logger.error("settings", "skillgrp sync failed", { message: String(e) });
                    throw e;
                }
            }
        }
        if (pendingSkillNameEdits.size > 0) {
            if (!skillnameTarget) {
                logger.warn("settings", "skipped SkillName sync — path not configured in Settings");
            } else {
                try {
                    const res = await ipc.saveSkillname(skillnameTarget);
                    logger.info("settings", `wrote skillname (${res.bytesWritten} bytes)`);
                    setPendingSkillNameEdits(new Set());
                    didAny = true;
                } catch (e) {
                    logger.error("settings", "skillname sync failed", { message: String(e) });
                    throw e;
                }
            }
        }
        for (const [key, ids] of pendingTier2Edits) {
            if (ids.size === 0) continue;
            const target = config?.tier2DatPaths?.[key];
            if (!target) {
                logger.warn("settings", `skipped tier-2 ${key} sync — path not configured`);
                continue;
            }
            try {
                const res = await ipc.saveGenericDat(key, target);
                logger.info("settings", `wrote tier-2 ${key} (${res.bytesWritten} bytes)`);
                setPendingTier2Edits((prev) => {
                    const next = new Map(prev);
                    next.delete(key);
                    return next;
                });
                invalidateTier2(key);
                didAny = true;
            } catch (e) {
                logger.error("settings", `tier-2 ${key} sync failed`, { message: String(e) });
            }
        }
        if (!didAny) {
            logger.warn("settings", "syncToClient called with nothing pending");
        }
    }, [
        config?.skillgrpDatPath,
        config?.skillNamesDatPath,
        config?.tier2DatPaths,
        pendingClientEdits.size,
        pendingSkillNameEdits.size,
        pendingTier2Edits
    ]);

    const value = useMemo<SettingsState>(
        () => ({
            config,
            loaded,
            setDataRoot,
            setClientRoot,
            setSkillNamesDatPath,
            setSkillgrpDatPath,
            setTier2DatPath,
            probe,
            probeProtocol,
            serverProtocols,
            refreshServerProtocols,
            skillNames,
            importSkillNames,
            skillgrp,
            importSkillgrp,
            rebuildClientCaches,
            pendingClientEdits,
            pendingSkillNameEdits,
            pendingTier2Edits,
            refreshPendingClientEdits,
            refreshPendingSkillNameEdits,
            refreshPendingTier2Edits,
            syncToClient
        }),
        [
            config,
            loaded,
            setDataRoot,
            setClientRoot,
            setSkillNamesDatPath,
            setSkillgrpDatPath,
            setTier2DatPath,
            probe,
            probeProtocol,
            serverProtocols,
            refreshServerProtocols,
            skillNames,
            importSkillNames,
            skillgrp,
            importSkillgrp,
            rebuildClientCaches,
            pendingClientEdits,
            pendingSkillNameEdits,
            pendingTier2Edits,
            refreshPendingClientEdits,
            refreshPendingSkillNameEdits,
            refreshPendingTier2Edits,
            syncToClient
        ]
    );

    return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): SettingsState {
    const v = useContext(SettingsCtx);
    if (!v) throw new Error("useSettings outside provider");
    return v;
}
