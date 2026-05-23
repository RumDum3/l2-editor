import { ChevronRight, Plus, X } from "lucide-react";
import { memo, useMemo, useState } from "react";
import {
    ancestorsOf,
    type ClassDef,
    type ClassList,
    depthOf,
    type PlayerTemplates,
    type SkillTreeBlock,
    type SkillTreeFile,
    type SkillTrees,
    wouldCycle
} from "../../../classes/model";
import { useTier2Rows } from "../../../lib/tier2RowCache";
import { ClassAwakeningPathsBlock, ClassClientInfoRows, ClassInitialStatsBlock } from "./ClassClientData";
import { appendSkillTreeBlock, TreeBlockEditor } from "./SkillTreeEditor";
import { ClassTemplateEditor } from "./TemplateEditor";
import { CLASSINFO_STAT_PAIRS, type SkillCatalog, templateBaseStats, tierLabel } from "../classData";
import { rebuildClasses } from "../classListDom";
import { Row, Section } from "../ui";

export const ClassDetail = memo(function ClassDetail({
    cls,
    list,
    trees,
    templates,
    catalog,
    mutate,
    pushOp,
    onReindex,
    onPickClass,
    onAddChild,
    onRemoved
}: {
    cls: ClassDef;
    list: ClassList;
    trees: SkillTrees | null;
    templates: PlayerTemplates | null;
    catalog: SkillCatalog;
    mutate: (path: string, fn: () => void) => void;
    pushOp: (op: { undo: () => void; redo: () => void }) => void;
    onReindex: () => void;
    onPickClass: (id: number) => void;
    onAddChild: () => void;
    onRemoved: () => void;
}) {
    const [confirmDel, setConfirmDel] = useState(false);
    const [addingTree, setAddingTree] = useState(false);
    const [newTreeType, setNewTreeType] = useState("classSkillTree");
    const [newTreeFile, setNewTreeFile] = useState("");
    const mutCl = (fn: () => void) => mutate(list.path, fn);
    const ancestors = ancestorsOf(cls, list);
    const kids = list.childrenOf.get(cls.id) ?? [];
    const depth = depthOf(cls, list);

    const parentOptions = useMemo(
        () => list.classes.filter((c) => c.id !== cls.id && !wouldCycle(c, cls.id, list)).sort((a, b) => a.id - b.id),
        [list, cls.id]
    );
    const idDup = useMemo(() => list.classes.some((c) => c !== cls && c.id === cls.id), [list, cls]);

    const clientInfoRow = useTier2Rows("class_info", cls.id);
    const clientBaseStats = useMemo<ReadonlyMap<string, number> | undefined>(() => {
        if (!clientInfoRow || clientInfoRow.length === 0) return undefined;
        const r = clientInfoRow[0] as Record<string, unknown>;
        const m = new Map<string, number>();
        for (const [clientKey, serverTag] of CLASSINFO_STAT_PAIRS) {
            if (!(clientKey in r)) continue;
            const n = Number(r[clientKey]);
            if (Number.isFinite(n)) m.set(serverTag, n);
        }
        return m.size ? m : undefined;
    }, [clientInfoRow]);
    const templateStats = useMemo<Record<string, number> | undefined>(() => {
        const m = templateBaseStats(templates?.byClassId.get(cls.id)?.staticData ?? null);
        return Object.keys(m).length ? m : undefined;
    }, [templates, cls.id]);

    const ownBlocks: SkillTreeBlock[] = trees?.byClassId.get(cls.id) ?? [];
    const inherited: { from: ClassDef; blocks: SkillTreeBlock[] }[] = [];
    for (const a of ancestors) {
        const bs = (trees?.byClassId.get(a.id) ?? []).filter((b) => b.type === "classSkillTree");
        if (bs.length) inherited.push({ from: a, blocks: bs });
    }
    const commonBlocks = (trees?.byType.get("classSkillTree") ?? []).filter((b) => b.classId == null);

    const treeTypeOptions = useMemo(() => {
        const s = new Set<string>(["classSkillTree"]);
        for (const t of trees?.byType.keys() ?? []) s.add(t);
        return [...s].sort();
    }, [trees]);
    const targetFileFor = (type: string): SkillTreeFile | null =>
        trees?.byType.get(type)?.[0]?.file ?? trees?.files[0] ?? null;
    const addSkillTree = (type: string) => {
        const target = (newTreeFile && trees?.files.find((f) => f.path === newTreeFile)) || targetFileFor(type);
        if (!trees || !target) return;
        mutate(target.path, () => {
            appendSkillTreeBlock(target, type, cls.id);
        });
        onReindex();
        setAddingTree(false);
    };

    return (
        <div className="mx-auto max-w-3xl space-y-5">
            <div className="flex flex-wrap items-baseline gap-1.5 text-[11px] text-[var(--color-text-faint)]">
                {[...ancestors].reverse().map((a) => (
                    <span key={a.id} className="contents">
                        <button
                            type="button"
                            onClick={() => onPickClass(a.id)}
                            className="hover:text-[var(--color-accent)]"
                        >
                            {a.name}
                        </button>
                        <ChevronRight size={10} aria-hidden />
                    </span>
                ))}
                <span className="text-[var(--color-text)]">{cls.name}</span>
                <span className="ml-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-[1px] text-[9px] uppercase tracking-[0.15em]">
                    {tierLabel(depth)} class
                </span>
            </div>

            <Section title="Identity">
                <Row label="classId">
                    <input
                        defaultValue={String(cls.id)}
                        onBlur={(e) => {
                            const n = Number.parseInt(e.target.value.trim(), 10);
                            if (Number.isFinite(n) && n !== cls.id) {
                                mutCl(() => {
                                    const old = cls.id;
                                    cls.el.setAttribute("classId", String(n));
                                    for (const c of list.classes) {
                                        if (c.parent === old) c.el.setAttribute("parentClassId", String(n));
                                    }
                                    rebuildClasses(list);
                                });
                                onPickClass(n);
                            } else {
                                e.target.value = String(cls.id);
                            }
                        }}
                        className="mono w-28 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                    />
                    {idDup && (
                        <span className="ml-2 text-[10px] text-[var(--color-danger)]">
                            duplicate id — another class already uses {cls.id}
                        </span>
                    )}
                    <span className="ml-2 text-[10px] text-[var(--color-text-faint)]">
                        also re-points {list.classes.filter((c) => c.parent === cls.id).length} child link(s); does NOT
                        touch skillTrees files
                    </span>
                </Row>
                <Row label="name">
                    <input
                        defaultValue={cls.name}
                        onBlur={(e) => {
                            if (e.target.value !== cls.name)
                                mutCl(() => {
                                    cls.el.setAttribute("name", e.target.value);
                                    cls.name = e.target.value;
                                });
                        }}
                        className="w-72 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                    />
                </Row>
                <Row label="parent">
                    <select
                        value={cls.parent ?? ""}
                        onChange={(e) => {
                            const raw = e.target.value;
                            const newParent = raw === "" ? null : Number(raw);
                            mutCl(() => {
                                if (newParent == null) cls.el.removeAttribute("parentClassId");
                                else cls.el.setAttribute("parentClassId", String(newParent));
                                rebuildClasses(list);
                            });
                        }}
                        className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                    >
                        <option value="">(none — root class)</option>
                        {parentOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.id} — {c.name}
                            </option>
                        ))}
                    </select>
                    {cls.parent != null && !list.byId.has(cls.parent) && (
                        <span className="ml-2 text-[10px] text-[var(--color-warning)]">
                            current parentClassId {cls.parent} doesn't exist
                        </span>
                    )}
                </Row>
                <ClassClientInfoRows classId={cls.id} pushOp={pushOp} />
            </Section>

            <Section
                title={`Sub-classes (${kids.length})`}
                action={
                    <button
                        type="button"
                        onClick={onAddChild}
                        className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                    >
                        <Plus size={11} aria-hidden /> sub-class
                    </button>
                }
            >
                {kids.length === 0 ? (
                    <div className="px-1 py-1 text-[11px] text-[var(--color-text-faint)]">
                        No classes have this one as parent.
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-1.5">
                        {kids.map((k) => (
                            <button
                                type="button"
                                key={k.id}
                                onClick={() => onPickClass(k.id)}
                                className="mono rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] hover:border-[var(--color-accent-2)]"
                            >
                                <span className="text-[var(--color-accent-2)]">{k.id}</span> {k.name}
                            </button>
                        ))}
                    </div>
                )}
            </Section>

            <ClassAwakeningPathsBlock
                classId={cls.id}
                classNameOf={(id) => list.byId.get(id)?.name ?? `#${id}`}
                pushOp={pushOp}
            />

            <Section
                title={`Skill trees for this class (${ownBlocks.length})`}
                action={
                    trees && trees.files.length > 0 ? (
                        <button
                            type="button"
                            onClick={() => setAddingTree((v) => !v)}
                            className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                        >
                            <Plus size={11} aria-hidden /> skill tree
                        </button>
                    ) : undefined
                }
            >
                {addingTree && trees && trees.files.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)]/40 p-2 text-[11px]">
                        <span className="text-[var(--color-text-faint)]">
                            new <span className="mono">&lt;skillTree&gt;</span> · type
                        </span>
                        <select
                            value={newTreeType}
                            onChange={(e) => setNewTreeType(e.target.value)}
                            className="mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent-2)]"
                        >
                            {treeTypeOptions.map((t) => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </select>
                        <span className="text-[var(--color-text-faint)]">
                            classId <span className="mono text-[var(--color-accent-2)]">{cls.id}</span>
                        </span>
                        <span className="text-[var(--color-text-faint)]">in</span>
                        <select
                            value={newTreeFile || targetFileFor(newTreeType)?.path || ""}
                            onChange={(e) => setNewTreeFile(e.target.value)}
                            className="mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent-2)]"
                        >
                            {trees.files.map((f) => (
                                <option key={f.path} value={f.path}>
                                    {f.relPath}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => addSkillTree(newTreeType)}
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 hover:border-[var(--color-accent-2)]"
                        >
                            Add
                        </button>
                        <button
                            type="button"
                            onClick={() => setAddingTree(false)}
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)]"
                        >
                            Cancel
                        </button>
                    </div>
                )}
                {!trees ? (
                    <div className="px-1 py-1 text-[11px] text-[var(--color-text-faint)]">skillTrees/ not loaded.</div>
                ) : ownBlocks.length === 0 ? (
                    <div className="px-1 py-1 text-[11px] text-[var(--color-text-faint)]">
                        No <span className="mono">&lt;skillTree&gt;</span> block has{" "}
                        <span className="mono">classId="{cls.id}"</span>
                        {trees.files.length > 0 ? " yet — use “+ skill tree” above." : "."}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {ownBlocks.map((b, i) => (
                            <TreeBlockEditor
                                key={`${b.file.path}#${b.type}#${i}`}
                                block={b}
                                mutate={mutate}
                                catalog={catalog}
                                onReindex={onReindex}
                            />
                        ))}
                    </div>
                )}
            </Section>

            {(inherited.length > 0 || commonBlocks.length > 0) && (
                <Section title="Inherited skills">
                    <p className="text-[10px] leading-relaxed text-[var(--color-text-faint)]">
                        These come from an ancestor class's <span className="mono">skillTrees/</span> block — editing
                        one changes that file, and the change applies to every class that inherits it.
                    </p>
                    <div className="space-y-2">
                        {inherited.map(({ from, blocks }) => (
                            <div key={from.id} className="space-y-1.5">
                                <button
                                    type="button"
                                    onClick={() => onPickClass(from.id)}
                                    className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                                >
                                    from{" "}
                                    <span className="mono normal-case tracking-normal text-[var(--color-accent-2)]">
                                        {from.id}
                                    </span>{" "}
                                    {from.name} →
                                </button>
                                {blocks.map((b, i) => (
                                    <TreeBlockEditor
                                        key={`${from.id}#${i}`}
                                        block={b}
                                        mutate={mutate}
                                        catalog={catalog}
                                        onReindex={onReindex}
                                    />
                                ))}
                            </div>
                        ))}
                        {commonBlocks.length > 0 && (
                            <div className="space-y-1.5">
                                <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
                                    common (all classes)
                                </div>
                                {commonBlocks.map((b, i) => (
                                    <TreeBlockEditor
                                        key={`common#${i}`}
                                        block={b}
                                        mutate={mutate}
                                        catalog={catalog}
                                        onReindex={onReindex}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </Section>
            )}

            <Section title="Player template (base stats / level-up table)">
                {!templates ? (
                    <div className="px-1 py-1 text-[11px] text-[var(--color-text-faint)]">templates/ not loaded.</div>
                ) : (
                    <ClassTemplateEditor
                        template={templates.byClassId.get(cls.id) ?? null}
                        mutate={mutate}
                        clientStats={clientBaseStats}
                    />
                )}
                <ClassInitialStatsBlock classId={cls.id} templateStats={templateStats} pushOp={pushOp} />
            </Section>

            <div className="pt-2">
                {confirmDel ? (
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--color-danger)]">
                            Remove class {cls.id} ({cls.name})? Also:
                            {kids.length > 0
                                ? ` re-parents ${kids.length} sub-class(es) to ${cls.parent != null ? `class ${cls.parent}` : "root"};`
                                : ""}
                            {ownBlocks.length > 0
                                ? ` deletes ${ownBlocks.length} skillTrees block(s) for this id;`
                                : ""}
                            {" removes its ClassInfo.dat row."}
                            {templates?.byClassId.has(cls.id)
                                ? " (Its templates/ file is left in place — delete it by hand.)"
                                : ""}
                        </span>
                        <button
                            type="button"
                            onClick={onRemoved}
                            className="rounded border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-2 py-1 text-xs text-[var(--color-danger)]"
                        >
                            Confirm remove
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmDel(false)}
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:border-[var(--color-accent-2)]"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => {
                            setConfirmDel(true);
                            window.setTimeout(() => setConfirmDel(false), 4000);
                        }}
                        className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text-faint)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                    >
                        <X size={13} aria-hidden /> Remove this class from classList.xml
                    </button>
                )}
            </div>
        </div>
    );
});
