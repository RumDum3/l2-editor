import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { ipc } from "../lib/ipc";
import { logger } from "../lib/logger";
import { parseXml, serializeXml } from "../lib/xml";
import { PLUGINS, pickPlugin } from "../editors/registry";
import { type EditorPlugin, type EntitySummary } from "../editors/types";
import { useSettings } from "./SettingsContext";

export type LoadedFile = {
    path: string;
    name: string;
    doc: XMLDocument;
    entities: unknown[];
    dirty: boolean;
    savedXml: string;
};

export type IndexEntry = {
    fileIndex: number;
    entityIndex: number;
    summary: EntitySummary;
    searchKey: string;
};

export function searchKeyFor(summary: EntitySummary, fileName: string): string {
    return `${summary.id} ${summary.label} ${fileName}`.toLowerCase();
}

export type LoadedFolder = {
    folder: string;
    plugin: EditorPlugin;
    files: LoadedFile[];
    index: IndexEntry[];
};

export type ViewMode = "grid" | "detail";

type UndoEntry = {
    folderPath: string;
    fileIndex: number;
    entityIndex: number;
    xml: string;
};

const UNDO_DEPTH = 200;

type EditorState = {
    loaded: LoadedFolder | null;
    selectedIndex: number | null;
    mode: ViewMode;
    dirty: boolean;
    error: string | null;
    revision: number;
    loading: { done: number; total: number } | null;
    folderError: string | null;
    selectCategory: (pluginId: string) => Promise<void>;
    openFolder: (path: string) => Promise<void>;
    enterDetail: (idx: number) => void;
    openEntityById: (pluginId: string, entityId: string | number) => Promise<boolean>;
    exitDetail: () => void;
    mutate: (fn: () => void) => void;
    refreshFolder: () => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    save: () => Promise<void>;
};

const EditorCtx = createContext<EditorState | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
    const { config, refreshPendingClientEdits, refreshPendingSkillNameEdits } = useSettings();
    const [loaded, setLoaded] = useState<LoadedFolder | null>(null);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [mode, setMode] = useState<ViewMode>("grid");
    const [error, setError] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState<{ done: number; total: number } | null>(null);
    const [folderError, setFolderError] = useState<string | null>(null);

    const cacheRef = useRef<Map<string, LoadedFolder>>(new Map());

    const undoStackRef = useRef<UndoEntry[]>([]);
    const redoStackRef = useRef<UndoEntry[]>([]);
    const [stackTick, setStackTick] = useState(0);

    const doOpenFolder = useCallback(async (path: string, recursive = false): Promise<LoadedFolder | null> => {
        const cached = cacheRef.current.get(path);
        if (cached) {
            logger.info("editor", `cache hit: ${path}`);
            setError(null);
            setFolderError(null);
            setSelectedIndex(null);
            setMode("grid");
            setLoaded(cached);
            setRevision((r) => r + 1);
            return cached;
        }

        logger.info("editor", `opening folder`, { path, recursive });
        setError(null);
        setFolderError(null);
        setSelectedIndex(null);
        setMode("grid");
        setLoaded(null);

        let files: { path: string; name: string }[];
        try {
            const fs = await ipc.listXmlFiles(path, recursive);
            files = fs.map((f) => ({ path: f.path, name: f.name }));
            logger.info("editor", `listed ${files.length} xml files`);
        } catch (e) {
            logger.error("editor", "listXmlFiles failed", String(e));
            setFolderError(String(e));
            return null;
        }

        setLoading({ done: 0, total: files.length });
        const total = files.length;
        let done = 0;
        const failures: string[] = [];
        let unclaimed = 0;
        const results = await Promise.all(
            files.map(async (f) => {
                try {
                    const text = await ipc.readXml(f.path);
                    const parsed = parseXml(text);
                    const plugin = pickPlugin(parsed.doc);
                    if (!plugin) {
                        unclaimed++;
                        return null;
                    }
                    const entities = plugin.parse(parsed.doc);
                    return { file: f, doc: parsed.doc, plugin, entities };
                } catch (e) {
                    failures.push(`${f.name}: ${String(e)}`);
                    return null;
                } finally {
                    done++;
                    if (done === total || done % 24 === 0) setLoading({ done, total });
                }
            })
        );
        setLoading(null);

        const accepted = results.filter((r): r is NonNullable<typeof r> => r !== null);
        logger.info("editor", `parsed=${accepted.length} unclaimed=${unclaimed} failed=${failures.length}`);
        if (failures.length > 0) logger.warn("editor", `${failures.length} file failures`, failures);

        if (accepted.length === 0) {
            const reason =
                failures.length > 0
                    ? `Every file failed to parse (${failures.length} errors). First: ${failures[0]}`
                    : `No editor plugin claimed any of the ${files.length} files in this folder.` +
                      " If this is a category we don't yet support, add a plugin under src/editors/.";
            setFolderError(reason);
            return null;
        }

        const counts = new Map<EditorPlugin, number>();
        for (const r of accepted) counts.set(r.plugin, (counts.get(r.plugin) ?? 0) + 1);
        const plugin = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const matching = accepted.filter((r) => r.plugin === plugin);

        const loadedFiles: LoadedFile[] = matching.map((r) => ({
            path: r.file.path,
            name: r.file.name,
            doc: r.doc,
            entities: r.entities,
            dirty: false,
            savedXml: serializeXml(r.doc)
        }));

        const index: IndexEntry[] = [];
        loadedFiles.forEach((lf, fIdx) => {
            lf.entities.forEach((ent, eIdx) => {
                const summary = plugin.summarize(ent);
                index.push({
                    fileIndex: fIdx,
                    entityIndex: eIdx,
                    summary,
                    searchKey: searchKeyFor(summary, lf.name)
                });
            });
        });
        logger.info("editor", `loaded "${plugin.label}"`, {
            files: loadedFiles.length,
            entities: index.length
        });

        const folder: LoadedFolder = { folder: path, plugin, files: loadedFiles, index };
        cacheRef.current.set(path, folder);
        setLoaded(folder);
        setRevision((r) => r + 1);
        return folder;
    }, []);

    const openFolder = useCallback(
        async (path: string): Promise<void> => {
            await doOpenFolder(path);
        },
        [doOpenFolder]
    );

    const categoryFolderPath = useCallback(
        (plugin: EditorPlugin): string | null => {
            const root = config?.dataRoot;
            if (!root || !plugin.dataPath) return null;
            const sep = root.includes("\\") ? "\\" : "/";
            const sub = plugin.dataPath.replace(/[\\/]/g, sep);
            return `${root.replace(/[\\/]+$/, "")}${sep}${sub}`;
        },
        [config?.dataRoot]
    );

    const openEntityById = useCallback(
        async (pluginId: string, entityId: string | number): Promise<boolean> => {
            const plugin = PLUGINS.find((p) => p.id === pluginId);
            if (!plugin) return false;
            const full = categoryFolderPath(plugin);
            if (!full) return false;
            const folder = await doOpenFolder(full, !!plugin.recursive);
            if (!folder) return false;
            const idx = folder.index.findIndex((e) => String(e.summary.id) === String(entityId));
            if (idx < 0) return false;
            setSelectedIndex(idx);
            setMode("detail");
            return true;
        },
        [categoryFolderPath, doOpenFolder]
    );

    const selectCategory = useCallback(
        async (pluginId: string) => {
            const plugin = PLUGINS.find((p) => p.id === pluginId);
            if (!plugin) {
                setFolderError(`Unknown category: ${pluginId}`);
                return;
            }
            if (!plugin.dataPath) {
                setFolderError(`Plugin ${pluginId} doesn't expose a category dataPath.`);
                return;
            }
            const root = config?.dataRoot;
            if (!root) {
                setFolderError("Set the L2J data folder in Settings before picking a category.");
                return;
            }
            const sep = root.includes("\\") ? "\\" : "/";
            const sub = plugin.dataPath.replace(/[\\/]/g, sep);
            const full = `${root.replace(/[\\/]+$/, "")}${sep}${sub}`;
            await doOpenFolder(full, !!plugin.recursive);
        },
        [config?.dataRoot, doOpenFolder]
    );

    const enterDetail = useCallback((idx: number) => {
        setSelectedIndex(idx);
        setMode("detail");
    }, []);

    const exitDetail = useCallback(() => {
        setMode("grid");
    }, []);

    const recomputeDirty = useCallback((file: LoadedFile) => {
        const current = serializeXml(file.doc);
        file.dirty = current !== file.savedXml;
    }, []);

    const mutate = useCallback(
        (fn: () => void) => {
            let pendingSnapshot: UndoEntry | null = null;
            if (loaded && selectedIndex !== null) {
                const entry = loaded.index[selectedIndex];
                const file = loaded.files[entry.fileIndex];
                const ent = file.entities[entry.entityIndex];
                const el = loaded.plugin.elementOf(ent);
                pendingSnapshot = {
                    folderPath: loaded.folder,
                    fileIndex: entry.fileIndex,
                    entityIndex: entry.entityIndex,
                    xml: new XMLSerializer().serializeToString(el)
                };
            }

            fn();

            if (loaded && selectedIndex !== null) {
                const entry = loaded.index[selectedIndex];
                const file = loaded.files[entry.fileIndex];
                recomputeDirty(file);
                const ent = file.entities[entry.entityIndex];
                entry.summary = loaded.plugin.summarize(ent);
                entry.searchKey = searchKeyFor(entry.summary, file.name);
            }

            if (pendingSnapshot) {
                undoStackRef.current.push(pendingSnapshot);
                if (undoStackRef.current.length > UNDO_DEPTH) {
                    undoStackRef.current.shift();
                }
                redoStackRef.current = [];
                setStackTick((t) => t + 1);
            }
            setRevision((r) => r + 1);
        },
        [loaded, selectedIndex]
    );

    const applySnapshot = useCallback(
        (snap: UndoEntry): UndoEntry | null => {
            if (!loaded || loaded.folder !== snap.folderPath) return null;
            const file = loaded.files[snap.fileIndex];
            if (!file) return null;
            const oldEnt = file.entities[snap.entityIndex];
            if (oldEnt === undefined) return null;
            const oldEl = loaded.plugin.elementOf(oldEnt);
            const inverseSnap: UndoEntry = {
                folderPath: snap.folderPath,
                fileIndex: snap.fileIndex,
                entityIndex: snap.entityIndex,
                xml: new XMLSerializer().serializeToString(oldEl)
            };

            const parsed = new DOMParser().parseFromString(snap.xml, "application/xml");
            const newEl = parsed.documentElement;
            if (!newEl) return null;
            const adopted = file.doc.importNode(newEl, true);
            const parent = oldEl.parentNode;
            if (!parent) return null;
            parent.replaceChild(adopted, oldEl);

            // biome-ignore lint/suspicious/noExplicitAny: type-erased shell
            const newEnt = loaded.plugin.parseEntity(adopted as Element) as any;
            file.entities[snap.entityIndex] = newEnt;
            recomputeDirty(file);

            const idxEntry = loaded.index.find(
                (e) => e.fileIndex === snap.fileIndex && e.entityIndex === snap.entityIndex
            );
            if (idxEntry) {
                idxEntry.summary = loaded.plugin.summarize(newEnt);
                idxEntry.searchKey = searchKeyFor(idxEntry.summary, file.name);
            }

            if (selectedIndex !== null) {
                const cur = loaded.index[selectedIndex];
                if (cur && cur.fileIndex === snap.fileIndex && cur.entityIndex === snap.entityIndex) {
                    setMode("detail");
                }
            } else {
                const idx = loaded.index.findIndex(
                    (e) => e.fileIndex === snap.fileIndex && e.entityIndex === snap.entityIndex
                );
                if (idx >= 0) {
                    setSelectedIndex(idx);
                    setMode("detail");
                }
            }

            void Promise.resolve(loaded.plugin.afterEntityRestored?.(newEnt)).then(() => {
                refreshPendingClientEdits();
                refreshPendingSkillNameEdits();
            });

            return inverseSnap;
        },
        [loaded, selectedIndex, recomputeDirty, refreshPendingClientEdits, refreshPendingSkillNameEdits]
    );

    const undo = useCallback(() => {
        const snap = undoStackRef.current.pop();
        if (!snap) return;
        const inverse = applySnapshot(snap);
        if (inverse) {
            redoStackRef.current.push(inverse);
            if (redoStackRef.current.length > UNDO_DEPTH) {
                redoStackRef.current.shift();
            }
            setStackTick((t) => t + 1);
            setRevision((r) => r + 1);
        }
    }, [applySnapshot]);

    const redo = useCallback(() => {
        const snap = redoStackRef.current.pop();
        if (!snap) return;
        const inverse = applySnapshot(snap);
        if (inverse) {
            undoStackRef.current.push(inverse);
            if (undoStackRef.current.length > UNDO_DEPTH) {
                undoStackRef.current.shift();
            }
            setStackTick((t) => t + 1);
            setRevision((r) => r + 1);
        }
    }, [applySnapshot]);

    const canUndo = stackTick >= 0 && undoStackRef.current.length > 0;
    const canRedo = stackTick >= 0 && redoStackRef.current.length > 0;

    const save = useCallback(async () => {
        if (!loaded) return;
        const dirtyFiles = loaded.files.filter((f) => f.dirty);
        if (dirtyFiles.length === 0) return;
        for (const f of dirtyFiles) {
            const text = serializeXml(f.doc);
            await ipc.writeXml(f.path, text);
            f.dirty = false;
            f.savedXml = text;
        }
        setRevision((r) => r + 1);
    }, [loaded]);

    const refreshFolder = useCallback(() => {
        if (!loaded) return;
        for (const f of loaded.files) {
            f.entities = loaded.plugin.parse(f.doc);
            recomputeDirty(f);
        }
        const index: IndexEntry[] = [];
        loaded.files.forEach((lf, fIdx) => {
            lf.entities.forEach((ent, eIdx) => {
                const summary = loaded.plugin.summarize(ent);
                index.push({ fileIndex: fIdx, entityIndex: eIdx, summary, searchKey: searchKeyFor(summary, lf.name) });
            });
        });
        loaded.index = index;
        undoStackRef.current = [];
        redoStackRef.current = [];
        setStackTick((t) => t + 1);
        setSelectedIndex(null);
        setMode("grid");
        setRevision((r) => r + 1);
    }, [loaded, recomputeDirty]);

    const dirty = !!loaded?.files.some((f) => f.dirty);

    const value = useMemo<EditorState>(
        () => ({
            loaded,
            selectedIndex,
            mode,
            dirty,
            error,
            revision,
            loading,
            folderError,
            selectCategory,
            openFolder,
            enterDetail,
            openEntityById,
            exitDetail,
            mutate,
            refreshFolder,
            undo,
            redo,
            canUndo,
            canRedo,
            save
        }),
        [
            loaded,
            selectedIndex,
            mode,
            dirty,
            error,
            revision,
            loading,
            folderError,
            selectCategory,
            openFolder,
            enterDetail,
            openEntityById,
            exitDetail,
            mutate,
            refreshFolder,
            undo,
            redo,
            canUndo,
            canRedo,
            save
        ]
    );

    return <EditorCtx.Provider value={value}>{children}</EditorCtx.Provider>;
}

export function useEditor(): EditorState {
    const v = useContext(EditorCtx);
    if (!v) throw new Error("useEditor outside provider");
    return v;
}
