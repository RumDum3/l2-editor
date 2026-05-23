import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    buildClassList,
    classListMemo,
    indexSkillTrees,
    indexTemplates,
    parseSkillTreeFile,
    parseTemplateFile,
    skillTreesMemo,
    templatesMemo
} from "../../classes/loader";
import {
    type ClassDef,
    type ClassList,
    type PlayerTemplates,
    type SkillTreeFile,
    type SkillTrees
} from "../../classes/model";
import { useSkillCatalog } from "../../classes/skillCatalog";
import { joinPath, skillTreesDir } from "../../lib/dataPaths";
import { ipc } from "../../lib/ipc";
import { logger } from "../../lib/logger";
import { TIER2_DATS } from "../../lib/tier2Dats";
import { invalidateTier2, invalidateTier2Id } from "../../lib/tier2RowCache";
import { useFileUndo, useUndoHotkeys } from "../../lib/useFileUndo";
import { parseXml, serializeXml } from "../../lib/xml";
import { useSettings } from "../../state/SettingsContext";
import { useSetToolbarSlot } from "../../state/ToolbarSlot";
import { EditActions } from "../EditActions";
import { SkillInspectorProvider } from "./SkillInspector";
import { AllTreesView } from "./detail/AllTreesView";
import { ClassDetail } from "./detail/ClassDetail";
import { ClassTree } from "./detail/ClassTree";
import { IssuesPanel } from "./detail/IssuesPanel";
import { CLASS_DAT_KEYS, type Issue, templateBaseStats } from "./classData";
import { addClassEl, rebuildClasses, removeClassEl } from "./classListDom";
import { ModeBtn, Placeholder } from "./ui";

type Mode = "classes" | "trees";

export function ClassesWorkspace({
    active,
    onOpenSkill
}: {
    active: boolean;
    onOpenSkill?: (skillId: number) => void;
}) {
    const { config, pendingTier2Edits, refreshPendingTier2Edits } = useSettings();
    const classDatPending = CLASS_DAT_KEYS.reduce((n, k) => n + (pendingTier2Edits.get(k)?.size ?? 0), 0);
    const classDatDirty = classDatPending > 0;
    const dataRoot = config?.dataRoot ?? null;

    const [activated, setActivated] = useState(active);
    useEffect(() => {
        if (active && !activated) setActivated(true);
    }, [active, activated]);

    const [classes, setClasses] = useState<ClassList | null>(() => (dataRoot ? classListMemo.peek(dataRoot) : null));
    const [trees, setTrees] = useState<SkillTrees | null>(() => (dataRoot ? skillTreesMemo.peek(dataRoot) : null));
    const [templates, setTemplates] = useState<PlayerTemplates | null>(() =>
        dataRoot ? templatesMemo.peek(dataRoot) : null
    );
    const [loadErr, setLoadErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirtyFiles, setDirtyFiles] = useState<ReadonlySet<string>>(() => new Set());
    const [rev, setRev] = useState(0);
    const [structRev, setStructRev] = useState(0);

    const [mode, setMode] = useState<Mode>("classes");
    const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
    const [selectedTreeType, setSelectedTreeType] = useState<string | null>(null);

    const skillCatalog = useSkillCatalog(activated ? dataRoot : null);

    const load = useCallback(
        (force: boolean) => {
            if (!dataRoot) {
                setClasses(null);
                setTrees(null);
                return;
            }
            if (force) {
                classListMemo.invalidate();
                skillTreesMemo.invalidate();
                templatesMemo.invalidate();
            }
            setLoading(true);
            setLoadErr(null);
            Promise.allSettled([classListMemo.get(dataRoot), skillTreesMemo.get(dataRoot), templatesMemo.get(dataRoot)])
                .then(([cl, st, tp]) => {
                    if (cl.status === "fulfilled") setClasses(cl.value);
                    else {
                        setClasses(null);
                        setLoadErr(cl.reason instanceof Error ? cl.reason.message : String(cl.reason));
                    }
                    if (st.status === "fulfilled") setTrees(st.value);
                    else {
                        setTrees(null);
                        logger.warn(
                            "classes",
                            `skillTrees load failed: ${st.reason instanceof Error ? st.reason.message : String(st.reason)}`
                        );
                    }
                    if (tp.status === "fulfilled") setTemplates(tp.value);
                    else {
                        setTemplates(null);
                        logger.warn(
                            "classes",
                            `templates load failed: ${tp.reason instanceof Error ? tp.reason.message : String(tp.reason)}`
                        );
                    }
                    setDirtyFiles(new Set());
                })
                .finally(() => setLoading(false));
        },
        [dataRoot]
    );

    useEffect(() => {
        if (activated) load(false);
    }, [activated, load]);

    const undoHist = useFileUndo({
        serialize: (path) => {
            if (classes && path === classes.path) return serializeXml(classes.doc);
            const st = trees?.files.find((f) => f.path === path);
            if (st) return serializeXml(st.doc);
            const tp = templates?.files.find((f) => f.path === path);
            if (tp) return serializeXml(tp.doc);
            return null;
        },
        restore: (path, xml) => {
            let doc: XMLDocument;
            try {
                doc = parseXml(xml).doc;
            } catch {
                return;
            }
            if (classes && path === classes.path) {
                setClasses(buildClassList(path, doc));
                return;
            }
            const st = trees?.files.find((f) => f.path === path);
            if (st && trees) {
                const nf = parseSkillTreeFile(path, st.relPath, doc);
                setTrees(indexSkillTrees(trees.files.map((f) => (f.path === path ? nf : f))));
                return;
            }
            const tp = templates?.files.find((f) => f.path === path);
            if (tp && templates) {
                const nf = parseTemplateFile(path, tp.relPath, doc) ?? tp;
                setTemplates(indexTemplates(templates.files.map((f) => (f.path === path ? nf : f))));
            }
        }
    });

    useUndoHotkeys(active, undoHist.undo, undoHist.redo);

    const classListPathRef = useRef<string | null>(null);
    classListPathRef.current = classes?.path ?? null;

    const mutate = useCallback(
        (path: string, fn: () => void) => {
            undoHist.snapshot(path);
            fn();
            setDirtyFiles((prev) => {
                if (prev.has(path)) return prev;
                const next = new Set(prev);
                next.add(path);
                return next;
            });
            setRev((r) => r + 1);
            if (path === classListPathRef.current) setStructRev((s) => s + 1);
        },
        [undoHist.snapshot]
    );

    const reindexTrees = useCallback(() => setTrees((t) => (t ? indexSkillTrees(t.files) : t)), []);

    const addRootClass = useCallback(() => {
        if (!classes) return;
        mutate(classes.path, () => {
            const el = addClassEl(classes, null);
            rebuildClasses(classes);
            setSelectedClassId(Number(el.getAttribute("classId")));
        });
    }, [classes, mutate]);

    const addSkillTreesFile = (filename: string) => {
        if (!dataRoot || !trees) return;
        const base = filename.trim().replace(/[\\/]/g, "");
        if (!base) return;
        const name = base.toLowerCase().endsWith(".xml") ? base : `${base}.xml`;
        const path = joinPath(skillTreesDir(dataRoot), name);
        if (trees.files.some((f) => f.path === path)) return;
        const { doc } = parseXml('<?xml version="1.0" encoding="UTF-8"?>\n<list>\n</list>\n');
        const newFile: SkillTreeFile = { path, relPath: name, doc, blocks: [] };
        setTrees(indexSkillTrees([...trees.files, newFile]));
        setDirtyFiles((d) => new Set(d).add(path));
    };

    const docByPath = useMemo(() => {
        const m = new Map<string, XMLDocument>();
        if (classes) m.set(classes.path, classes.doc);
        if (trees) for (const f of trees.files) m.set(f.path, f.doc);
        if (templates) for (const f of templates.files) m.set(f.path, f.doc);
        return m;
    }, [classes, trees, templates]);

    const relForPath = useCallback(
        (path: string): string => {
            if (classes && path === classes.path) return "stats/players/classList.xml";
            const st = trees?.files.find((x) => x.path === path);
            if (st) return `skillTrees/${st.relPath}`;
            const tp = templates?.files.find((x) => x.path === path);
            if (tp) return `templates/${tp.relPath}`;
            return path;
        },
        [classes, trees, templates]
    );

    const issues = useMemo<Issue[]>(() => {
        if (!classes) return [];
        const out: Issue[] = [];
        const count = new Map<number, number>();
        for (const c of classes.classes) count.set(c.id, (count.get(c.id) ?? 0) + 1);
        for (const [id, n] of count)
            if (n > 1) out.push({ severity: "error", message: `classId ${id} is used by ${n} classes`, classId: id });
        for (const c of classes.classes) {
            if (c.parent != null && !classes.byId.has(c.parent)) {
                out.push({
                    severity: "error",
                    message: `${c.name} (${c.id}): parentClassId ${c.parent} doesn't exist`,
                    classId: c.id
                });
            } else if (c.parent != null) {
                const seen = new Set<number>([c.id]);
                let cur: ClassDef | null | undefined = classes.byId.get(c.parent);
                while (cur) {
                    if (seen.has(cur.id)) {
                        out.push({
                            severity: "error",
                            message: `${c.name} (${c.id}) is in a parentClassId cycle`,
                            classId: c.id
                        });
                        break;
                    }
                    seen.add(cur.id);
                    cur = cur.parent != null ? classes.byId.get(cur.parent) : null;
                }
            }
            if (templates && templates.files.length > 0 && !templates.byClassId.has(c.id)) {
                out.push({ severity: "warn", message: `${c.name} (${c.id}): no templates/ file`, classId: c.id });
            }
        }
        if (trees) {
            for (const b of trees.blocks) {
                if (b.classId != null && !classes.byId.has(b.classId)) {
                    out.push({
                        severity: "warn",
                        message: `skillTrees/${b.file.relPath}: <skillTree type="${b.type}" classId="${b.classId}"> — class ${b.classId} doesn't exist`
                    });
                }
                if (b.rows.length === 0) {
                    out.push({
                        severity: "note",
                        message: `skillTrees/${b.file.relPath}: empty <skillTree type="${b.type}"${b.classId != null ? ` classId="${b.classId}"` : ""}>`
                    });
                }
            }
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classes, trees, templates, structRev]);

    const save = useCallback(async () => {
        if ((dirtyFiles.size === 0 && !classDatDirty) || saving) return;
        setSaving(true);
        const failed: string[] = [];
        for (const path of dirtyFiles) {
            const doc = docByPath.get(path);
            if (!doc) continue;
            try {
                await ipc.writeXml(path, serializeXml(doc));
            } catch (e) {
                failed.push(`${relForPath(path)}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        classListMemo.invalidate();
        skillTreesMemo.invalidate();
        templatesMemo.invalidate();
        const savedXml = dirtyFiles.size;
        if (failed.length === 0) {
            setDirtyFiles(new Set());
        } else {
            setDirtyFiles(new Set([...dirtyFiles].filter((p) => failed.some((f) => f.startsWith(relForPath(p))))));
        }

        const toFlush = new Set(CLASS_DAT_KEYS.filter((k) => (pendingTier2Edits.get(k)?.size ?? 0) > 0));
        if (templates) {
            const mirrorTargets: { key: string; idField: string }[] = [
                { key: "class_info", idField: "class" },
                { key: "class_initial_stat", idField: "class" }
            ].filter((t) => !!config?.tier2DatPaths?.[t.key]);
            for (const path of dirtyFiles) {
                const tf = templates.files.find((f) => f.path === path);
                if (!tf || tf.classId == null) continue;
                const stats = templateBaseStats(tf.staticData);
                if (Object.keys(stats).length === 0) continue;
                for (const t of mirrorTargets) {
                    try {
                        await ipc.applyGenericDatEdits(t.key, { [t.idField]: tf.classId }, stats);
                        toFlush.add(t.key);
                    } catch (e) {
                        failed.push(`${t.key} (class ${tf.classId}): ${e instanceof Error ? e.message : String(e)}`);
                    }
                }
            }
        }

        const flushed: string[] = [];
        for (const key of toFlush) {
            const path = config?.tier2DatPaths?.[key];
            if (!path) {
                failed.push(`${key}: no path configured`);
                continue;
            }
            try {
                await ipc.saveGenericDat(key, path);
                await refreshPendingTier2Edits(key);
                invalidateTier2(key);
                flushed.push(key);
            } catch (e) {
                failed.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        if (failed.length === 0) {
            const bits = [savedXml > 0 ? `${savedXml} file(s)` : null, ...flushed].filter(Boolean);
            logger.info("classes", `saved ${bits.length ? bits.join(" + ") : "(nothing changed)"}`);
        } else {
            for (const f of failed) logger.error("classes", `save failed — ${f}`);
        }
        setSaving(false);
    }, [
        dirtyFiles,
        saving,
        docByPath,
        relForPath,
        templates,
        classDatDirty,
        pendingTier2Edits,
        config?.tier2DatPaths,
        refreshPendingTier2Edits
    ]);

    const setToolbarSlot = useSetToolbarSlot();
    useEffect(() => {
        if (!active) return;
        setToolbarSlot(
            <EditActions
                onUndo={undoHist.undo}
                onRedo={undoHist.redo}
                canUndo={undoHist.canUndo}
                canRedo={undoHist.canRedo}
                dirty={classDatDirty}
                dirtyCount={dirtyFiles.size}
                dirtyTitle={
                    [
                        dirtyFiles.size > 0 ? [...dirtyFiles].map(relForPath).join(", ") : null,
                        classDatPending > 0 ? `${classDatPending} unsaved .dat edit(s)` : null
                    ]
                        .filter(Boolean)
                        .join(" + ") || undefined
                }
                saving={saving}
                saveDisabled={(dirtyFiles.size === 0 && !classDatDirty) || saving}
                saveTitle="Save all unsaved changes"
                onSave={save}
                onReload={() => {
                    undoHist.reset();
                    load(true);
                }}
                reloadDisabled={loading}
            />
        );
        return () => setToolbarSlot(null);
    }, [
        active,
        setToolbarSlot,
        undoHist,
        dirtyFiles,
        relForPath,
        saving,
        loading,
        save,
        load,
        classDatDirty,
        classDatPending
    ]);

    const selectedClass = selectedClassId != null && classes ? (classes.byId.get(selectedClassId) ?? null) : null;

    const addChildClass = useCallback(() => {
        if (!classes || !selectedClass) return;
        mutate(classes.path, () => {
            const el = addClassEl(classes, selectedClass.id);
            rebuildClasses(classes);
            setSelectedClassId(Number(el.getAttribute("classId")));
        });
    }, [classes, selectedClass, mutate]);
    const removeSelectedClass = useCallback(() => {
        if (!classes || !selectedClass) return;
        const removedId = selectedClass.id;
        const newParent = selectedClass.parent;
        mutate(classes.path, () => {
            for (const c of classes.classes) {
                if (c.parent !== removedId) continue;
                if (newParent == null) c.el.removeAttribute("parentClassId");
                else c.el.setAttribute("parentClassId", String(newParent));
            }
            removeClassEl(selectedClass);
            rebuildClasses(classes);
        });
        if (trees) {
            const touched = new Set<SkillTreeFile>();
            for (const b of trees.byClassId.get(removedId) ?? []) touched.add(b.file);
            for (const f of touched) {
                mutate(f.path, () => {
                    for (const b of f.blocks.filter((x) => x.classId === removedId)) {
                        const next = b.el.nextSibling;
                        if (next && next.nodeType === Node.TEXT_NODE && /^\s*$/.test(next.textContent ?? ""))
                            next.remove();
                        b.el.remove();
                    }
                    f.blocks = f.blocks.filter((x) => x.classId !== removedId);
                });
            }
            if (touched.size) setTrees(indexSkillTrees(trees.files));
        }
        for (const key of CLASS_DAT_KEYS) {
            if (!config?.tier2DatPaths?.[key]) continue;
            const idField = TIER2_DATS.find((e) => e.key === key)?.indexField ?? "class";
            ipc.deleteGenericDatRow(key, { [idField]: removedId })
                .then(() => {
                    invalidateTier2Id(key, removedId);
                    return refreshPendingTier2Edits(key);
                })
                .catch((e) => logger.warn("classes", `${key} row delete failed`, { removedId, message: String(e) }));
        }
        setSelectedClassId(null);
    }, [classes, selectedClass, trees, mutate, config?.tier2DatPaths, refreshPendingTier2Edits]);

    return (
        <SkillInspectorProvider catalog={skillCatalog} onOpenSkill={onOpenSkill}>
            <div className="flex h-full flex-col">
                <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                        classes
                    </span>
                    {classes ? (
                        <div className="flex items-center gap-1">
                            <ModeBtn active={mode === "classes"} onClick={() => setMode("classes")}>
                                Hierarchy
                            </ModeBtn>
                            <ModeBtn active={mode === "trees"} onClick={() => setMode("trees")}>
                                All skill trees
                            </ModeBtn>
                        </div>
                    ) : (
                        loading && (
                            <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-faint)]">
                                <span
                                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-text-faint)] border-t-[var(--color-accent-2)]"
                                    aria-hidden
                                />
                                loading…
                            </span>
                        )
                    )}
                </div>

                {!dataRoot ? (
                    <Placeholder>Set the L2J data folder in Settings to edit classes.</Placeholder>
                ) : loadErr ? (
                    <Placeholder tone="danger">
                        <AlertTriangle size={13} className="inline align-[-2px]" aria-hidden /> Couldn't read
                        classList.xml — {loadErr}
                    </Placeholder>
                ) : !classes ? (
                    <Placeholder>{loading ? "Loading…" : "No class data."}</Placeholder>
                ) : mode === "trees" ? (
                    <AllTreesView
                        key={`trees:${undoHist.rev}`}
                        trees={trees}
                        selectedType={selectedTreeType}
                        onSelectType={setSelectedTreeType}
                        mutate={mutate}
                        catalog={skillCatalog}
                        onReindex={reindexTrees}
                        onAddFile={addSkillTreesFile}
                        rev={rev}
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                        {issues.length > 0 && <IssuesPanel issues={issues} onSelect={setSelectedClassId} />}
                        <div className="flex min-h-0 flex-1">
                            <ClassTree
                                list={classes}
                                selectedId={selectedClassId}
                                onSelect={setSelectedClassId}
                                onAddRoot={addRootClass}
                                rev={structRev}
                            />
                            <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--color-bg)] p-4">
                                {selectedClass ? (
                                    <ClassDetail
                                        key={`${selectedClass.id}:${undoHist.rev}`}
                                        cls={selectedClass}
                                        list={classes}
                                        trees={trees}
                                        templates={templates}
                                        catalog={skillCatalog}
                                        mutate={mutate}
                                        pushOp={undoHist.pushOp}
                                        onReindex={reindexTrees}
                                        onPickClass={setSelectedClassId}
                                        onAddChild={addChildClass}
                                        onRemoved={removeSelectedClass}
                                    />
                                ) : (
                                    <Placeholder>Pick a class on the left.</Placeholder>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </SkillInspectorProvider>
    );
}
