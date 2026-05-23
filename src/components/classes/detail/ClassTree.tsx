import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { memo, useMemo } from "react";
import { type ClassDef, type ClassList, ROOT_PARENT } from "../../../classes/model";
import { toggleStringSetMember, useStringSet } from "../../../lib/uiPrefs";
import { CLASS_NODES_KEY } from "../classData";

export const ClassTree = memo(function ClassTree({
    list,
    selectedId,
    onSelect,
    onAddRoot,
    rev
}: {
    list: ClassList;
    selectedId: number | null;
    onSelect: (id: number) => void;
    onAddRoot: () => void;
    rev: number;
}) {
    const collapsedStrings = useStringSet(CLASS_NODES_KEY);
    const collapsed = useMemo<ReadonlySet<number>>(
        () => new Set([...collapsedStrings].map(Number).filter(Number.isFinite)),
        [collapsedStrings]
    );
    const toggle = (id: number) => toggleStringSetMember(CLASS_NODES_KEY, String(id));
    const roots = list.childrenOf.get(ROOT_PARENT) ?? [];
    const orphans = useMemo(
        () => list.classes.filter((c) => c.parent != null && !list.byId.has(c.parent)),
        [list, rev]
    );

    return (
        <aside className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)]/60 bg-black/30 px-3 py-1">
                <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                    hierarchy
                </span>
                <button
                    type="button"
                    onClick={onAddRoot}
                    title="Add a new root (race base) class"
                    className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                >
                    <Plus size={11} aria-hidden /> root
                </button>
            </div>
            <div className="flex-1 overflow-y-auto py-1 text-[12px]">
                {roots.length === 0 && orphans.length === 0 && (
                    <div className="px-3 py-2 text-[11px] text-[var(--color-text-faint)]">No classes.</div>
                )}
                {roots.map((c) => (
                    <TreeNode
                        key={c.id}
                        cls={c}
                        list={list}
                        depth={0}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        collapsed={collapsed}
                        toggle={toggle}
                    />
                ))}
                {orphans.length > 0 && (
                    <>
                        <div className="mt-2 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--color-warning)]">
                            orphaned (bad parentClassId)
                        </div>
                        {orphans.map((c) => (
                            <TreeNode
                                key={`orph-${c.id}`}
                                cls={c}
                                list={list}
                                depth={0}
                                selectedId={selectedId}
                                onSelect={onSelect}
                                collapsed={collapsed}
                                toggle={toggle}
                            />
                        ))}
                    </>
                )}
            </div>
        </aside>
    );
});

function TreeNode({
    cls,
    list,
    depth,
    selectedId,
    onSelect,
    collapsed,
    toggle
}: {
    cls: ClassDef;
    list: ClassList;
    depth: number;
    selectedId: number | null;
    onSelect: (id: number) => void;
    collapsed: ReadonlySet<number>;
    toggle: (id: number) => void;
}) {
    const kids = list.childrenOf.get(cls.id) ?? [];
    const isCollapsed = collapsed.has(cls.id);
    const active = selectedId === cls.id;
    return (
        <div>
            <div
                className={`flex items-center gap-1 pr-2 hover:bg-[var(--color-surface-2)] ${active ? "bg-[var(--color-surface-2)]" : ""}`}
                style={{ paddingLeft: `${8 + depth * 14}px` }}
            >
                {kids.length > 0 ? (
                    <button
                        type="button"
                        onClick={() => toggle(cls.id)}
                        className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                        aria-label={isCollapsed ? "Expand" : "Collapse"}
                    >
                        {isCollapsed ? <ChevronRight size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
                    </button>
                ) : (
                    <span className="inline-block w-3" />
                )}
                <button
                    type="button"
                    onClick={() => onSelect(cls.id)}
                    className={`flex min-w-0 flex-1 items-baseline gap-2 py-1 text-left ${active ? "text-[var(--color-accent)]" : ""}`}
                >
                    <span className="mono shrink-0 text-[10px] text-[var(--color-accent-2)]">{cls.id}</span>
                    <span className="truncate">{cls.name}</span>
                </button>
            </div>
            {!isCollapsed &&
                kids.map((k) => (
                    <TreeNode
                        key={k.id}
                        cls={k}
                        list={list}
                        depth={depth + 1}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        collapsed={collapsed}
                        toggle={toggle}
                    />
                ))}
        </div>
    );
}
