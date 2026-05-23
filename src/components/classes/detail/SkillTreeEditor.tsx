import { ChevronDown, ChevronRight, Info, Plus, X } from "lucide-react";
import { memo, useState } from "react";
import type { SkillBrief } from "../../../classes/skillCatalog";
import type { SkillTreeBlock, SkillTreeFile, TreeSkillRow } from "../../../classes/model";
import { useInspectSkill } from "../SkillInspector";
import { toggleTreeBlock, useTreeBlockOpen } from "../treeCollapse";

function blockKey(block: SkillTreeBlock): string {
    return `${block.file.relPath}#${block.type}#${block.classId ?? "x"}#${block.parentClassId ?? "x"}`;
}

function removeBlockEl(block: SkillTreeBlock): void {
    const el = block.el;
    const next = el.nextSibling;
    if (next && next.nodeType === Node.TEXT_NODE && /^\s*$/.test(next.textContent ?? "")) next.remove();
    el.remove();
    const i = block.file.blocks.indexOf(block);
    if (i >= 0) block.file.blocks.splice(i, 1);
}

export const KNOWN_TREE_TYPES = [
    "classSkillTree",
    "transferSkillTree",
    "transformSkillTree",
    "subClassSkillTree",
    "dualClassSkillTree",
    "subPledgeSkillTree",
    "pledgeSkillTree",
    "fishingSkillTree",
    "collectSkillTree",
    "gameMasterSkillTree",
    "gameMasterAuraSkillTree",
    "abilitySkillTree",
    "alchemySkillTree",
    "awakeningSaveSkillTree",
    "nobleSkillTree",
    "heroSkillTree",
    "raceSkillTree"
];

export function appendSkillTreeBlock(file: SkillTreeFile, type: string, classId: number | null): SkillTreeBlock {
    const doc = file.doc;
    const el = doc.createElement("skillTree");
    el.setAttribute("type", type);
    if (classId != null) el.setAttribute("classId", String(classId));
    const root = doc.documentElement;
    if (root) {
        root.appendChild(doc.createTextNode("\t"));
        root.appendChild(el);
        root.appendChild(doc.createTextNode("\n"));
    }
    const block: SkillTreeBlock = { type, classId, parentClassId: null, attrs: new Map(), rows: [], el, file };
    file.blocks.push(block);
    return block;
}

const COMMON_ROW_ATTRS = [
    "getLevel",
    "getDualLevel",
    "levelUpSp",
    "levelUpHide",
    "autoGet",
    "learnedByNpc",
    "learnedByFS",
    "residenceId",
    "socialClass",
    "subClassConditions",
    "treeId",
    "row",
    "column",
    "pointsRequired"
];

const ROW_LABEL_CLS = "shrink-0 text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]";
const INPUT_CLS =
    "mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent-2)]";

export type SkillCatalog = Map<number, SkillBrief> | null;

export function SkillChip({
    id,
    catalog,
    onRemove,
    tone = "default",
    title
}: {
    id: number;
    catalog: SkillCatalog;
    onRemove?: () => void;
    tone?: "default" | "warn";
    title?: string;
}) {
    const inspect = useInspectSkill();
    const name = catalog?.get(id)?.name;
    const known = catalog ? catalog.has(id) : true;
    const base =
        tone === "warn"
            ? "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10"
            : "border-[var(--color-border)] bg-[var(--color-surface)]";
    return (
        <span className={`inline-flex items-center gap-1 rounded border ${base} px-1.5 py-[1px] text-[11px]`}>
            <button
                type="button"
                onClick={() => inspect(id)}
                title={title ?? "Show skill info"}
                className="inline-flex items-baseline gap-1 hover:text-[var(--color-accent)]"
            >
                <span className="mono text-[10px] text-[var(--color-accent-2)]">{id}</span>
                {name ? (
                    <span className="truncate">{name}</span>
                ) : !known && catalog ? (
                    <span className="italic text-[var(--color-warning)]">unknown id</span>
                ) : (
                    <span className="italic text-[var(--color-text-faint)]">…</span>
                )}
            </button>
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={`Remove ${id}`}
                    className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                >
                    <X size={10} aria-hidden />
                </button>
            )}
        </span>
    );
}

export const TreeBlockEditor = memo(function TreeBlockEditor({
    block,
    mutate,
    catalog,
    onReindex
}: {
    block: SkillTreeBlock;
    mutate: (path: string, fn: () => void) => void;
    catalog: SkillCatalog;
    onReindex: () => void;
}) {
    const key = blockKey(block);
    const open = useTreeBlockOpen(key);
    const [rev, setRev] = useState(0);
    const [confirmDel, setConfirmDel] = useState(false);
    const [addingAttr, setAddingAttr] = useState(false);
    const [newAttrName, setNewAttrName] = useState("");
    const [newAttrVal, setNewAttrVal] = useState("");
    const path = block.file.path;
    const m = (fn: () => void) => {
        mutate(path, fn);
        setRev((r) => r + 1);
    };
    const mStruct = (fn: () => void) => {
        m(fn);
        onReindex();
    };

    const addRow = () =>
        m(() => {
            const doc = block.el.ownerDocument;
            const el = doc.createElement("skill");
            el.setAttribute("skillName", "New skill");
            el.setAttribute("skillId", "0");
            el.setAttribute("skillLevel", "1");
            block.el.appendChild(doc.createTextNode("\n\t\t"));
            block.el.appendChild(el);
            block.el.appendChild(doc.createTextNode("\n\t"));
            block.rows.push({
                skillId: 0,
                skillName: "New skill",
                skillLevel: 1,
                attrs: new Map(),
                removeSkills: [],
                el
            });
        });
    const removeRow = (i: number) =>
        m(() => {
            const row = block.rows[i];
            const next = row.el.nextSibling;
            if (next && next.nodeType === Node.TEXT_NODE && /^\s*$/.test(next.textContent ?? "")) next.remove();
            row.el.remove();
            block.rows.splice(i, 1);
        });
    const deleteBlock = () => {
        mutate(path, () => removeBlockEl(block));
        onReindex();
    };

    const setType = (raw: string) => {
        const v = raw.trim();
        if (!v || v === block.type) return;
        mStruct(() => {
            block.type = v;
            block.el.setAttribute("type", v);
        });
    };
    const setClassId = (raw: string) => {
        const v = raw.trim();
        if (v === "") {
            if (block.classId == null) return;
            mStruct(() => {
                block.classId = null;
                block.el.removeAttribute("classId");
            });
            return;
        }
        const n = Number(v);
        if (!Number.isFinite(n) || n === block.classId) return;
        mStruct(() => {
            block.classId = n;
            block.el.setAttribute("classId", String(n));
        });
    };
    const setParentClassId = (raw: string) => {
        const v = raw.trim();
        if (v === "") {
            if (block.parentClassId == null) return;
            m(() => {
                block.parentClassId = null;
                block.el.removeAttribute("parentClassId");
            });
            return;
        }
        const n = Number(v);
        if (!Number.isFinite(n) || n === block.parentClassId) return;
        m(() => {
            block.parentClassId = n;
            block.el.setAttribute("parentClassId", String(n));
        });
    };
    const setAttr = (name: string, value: string) =>
        m(() => {
            block.attrs.set(name, value);
            block.el.setAttribute(name, value);
        });
    const delAttr = (name: string) =>
        m(() => {
            block.attrs.delete(name);
            block.el.removeAttribute(name);
        });
    const addAttr = () => {
        const name = newAttrName.trim();
        if (!name || ["type", "classId", "parentClassId"].includes(name)) return;
        setAttr(name, newAttrVal);
        setNewAttrName("");
        setNewAttrVal("");
        setAddingAttr(false);
    };
    void rev;

    return (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)]/60 px-3 py-1.5">
                <button
                    type="button"
                    onClick={() => toggleTreeBlock(key)}
                    className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                    aria-label={open ? "Collapse" : "Expand"}
                >
                    {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
                </button>
                <input
                    key={`t:${block.type}`}
                    defaultValue={block.type}
                    list="skilltree-types"
                    title="Block type — <skillTree type=…>"
                    onBlur={(e) => setType(e.target.value)}
                    className={`${INPUT_CLS} w-40 text-[var(--color-accent)]`}
                />
                {!open && (
                    <span className="text-[10px] text-[var(--color-text-faint)]">
                        {block.classId != null ? `classId ${block.classId}` : ""}
                        {block.parentClassId != null ? ` · parent ${block.parentClassId}` : ""}
                        {[...block.attrs].length ? ` · ${[...block.attrs].map(([k, v]) => `${k}=${v}`).join(" ")}` : ""}
                    </span>
                )}
                <span className="ml-auto text-[10px] text-[var(--color-text-faint)]">
                    {block.rows.length} skill{block.rows.length === 1 ? "" : "s"} ·{" "}
                    <span className="mono">{block.file.relPath}</span>
                </span>
                {confirmDel ? (
                    <button
                        type="button"
                        onClick={deleteBlock}
                        className="rounded border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-1.5 py-[1px] text-[10px] text-[var(--color-danger)]"
                    >
                        confirm
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => {
                            setConfirmDel(true);
                            window.setTimeout(() => setConfirmDel(false), 3000);
                        }}
                        title="Delete this whole <skillTree> block"
                        aria-label="Delete this block"
                        className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                    >
                        <X size={13} aria-hidden />
                    </button>
                )}
                <datalist id="skilltree-types">
                    {KNOWN_TREE_TYPES.map((t) => (
                        <option key={t} value={t} />
                    ))}
                </datalist>
            </div>
            {open && (
                <div className="space-y-1.5 p-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-[var(--color-border)]/40 bg-[var(--color-surface-2)]/30 p-1.5 text-[11px]">
                        <label className="flex items-center gap-1">
                            <span className={ROW_LABEL_CLS}>classId</span>
                            <input
                                key={`c:${block.classId ?? ""}`}
                                defaultValue={block.classId ?? ""}
                                placeholder="(none)"
                                onBlur={(e) => setClassId(e.target.value)}
                                className={`${INPUT_CLS} w-16`}
                            />
                        </label>
                        <label className="flex items-center gap-1">
                            <span className={ROW_LABEL_CLS}>parentClassId</span>
                            <input
                                key={`p:${block.parentClassId ?? ""}`}
                                defaultValue={block.parentClassId ?? ""}
                                placeholder="(none)"
                                onBlur={(e) => setParentClassId(e.target.value)}
                                className={`${INPUT_CLS} w-16`}
                            />
                        </label>
                        {[...block.attrs.entries()].map(([name, value]) => (
                            <span
                                key={name}
                                className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-[1px]"
                            >
                                <span className="text-[var(--color-text-faint)]">{name}</span>
                                <input
                                    className="mono w-16 bg-transparent text-[11px] outline-none"
                                    defaultValue={value}
                                    onBlur={(e) => {
                                        if (e.target.value !== value) setAttr(name, e.target.value);
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => delAttr(name)}
                                    aria-label={`Remove ${name}`}
                                    className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                                >
                                    <X size={10} aria-hidden />
                                </button>
                            </span>
                        ))}
                        {addingAttr ? (
                            <span className="inline-flex items-center gap-1">
                                <input
                                    autoFocus
                                    value={newAttrName}
                                    onChange={(e) => setNewAttrName(e.target.value)}
                                    placeholder="attr"
                                    className={`${INPUT_CLS} w-24`}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") addAttr();
                                        if (e.key === "Escape") setAddingAttr(false);
                                    }}
                                />
                                <input
                                    value={newAttrVal}
                                    onChange={(e) => setNewAttrVal(e.target.value)}
                                    placeholder="value"
                                    className={`${INPUT_CLS} w-20`}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") addAttr();
                                        if (e.key === "Escape") setAddingAttr(false);
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={addAttr}
                                    className="rounded border border-dashed border-[var(--color-border)] px-1.5 py-[1px] text-[10px] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-accent-2)]"
                                >
                                    add
                                </button>
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setAddingAttr(true)}
                                className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-[0.1em] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                            >
                                <Plus size={10} aria-hidden /> attr
                            </button>
                        )}
                    </div>
                    {block.rows.length === 0 && (
                        <div className="px-1 text-[11px] text-[var(--color-text-faint)]">(empty block)</div>
                    )}
                    {block.rows.map((row, i) => (
                        <TreeRowEditor
                            key={`${i}:${row.skillId}:${row.skillLevel}`}
                            row={row}
                            mutate={m}
                            catalog={catalog}
                            onRemove={() => removeRow(i)}
                        />
                    ))}
                    <button
                        type="button"
                        onClick={addRow}
                        className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                    >
                        <Plus size={11} aria-hidden /> add skill
                    </button>
                </div>
            )}
        </div>
    );
});

function TreeRowEditor({
    row,
    mutate,
    catalog,
    onRemove
}: {
    row: TreeSkillRow;
    mutate: (fn: () => void) => void;
    catalog: SkillCatalog;
    onRemove: () => void;
}) {
    const inspect = useInspectSkill();
    const [addingAttr, setAddingAttr] = useState(false);
    const [newAttrName, setNewAttrName] = useState("");
    const [newAttrVal, setNewAttrVal] = useState("");
    const [newRemoveId, setNewRemoveId] = useState("");

    const brief = catalog?.get(row.skillId) ?? null;
    const displayName = brief?.name ?? row.skillName ?? "";
    const idUnknown = !!catalog && !catalog.has(row.skillId);

    const setSkillLevel = (raw: string) => {
        const n = Number.parseInt(raw.trim(), 10);
        const v = Number.isFinite(n) ? n : row.skillLevel;
        mutate(() => {
            row.skillLevel = v;
            row.el.setAttribute("skillLevel", String(v));
        });
    };
    const setSkillId = (raw: string) => {
        const n = Number.parseInt(raw.trim(), 10);
        const v = Number.isFinite(n) ? n : row.skillId;
        mutate(() => {
            row.skillId = v;
            row.el.setAttribute("skillId", String(v));
            const nm = catalog?.get(v)?.name;
            if (nm) {
                row.skillName = nm;
                row.el.setAttribute("skillName", nm);
            }
        });
    };
    const setAttr = (name: string, v: string) =>
        mutate(() => {
            row.attrs.set(name, v);
            row.el.setAttribute(name, v);
        });
    const delAttr = (name: string) =>
        mutate(() => {
            row.attrs.delete(name);
            row.el.removeAttribute(name);
        });
    const addAttr = () => {
        const name = newAttrName.trim();
        if (!name) return;
        setAttr(name, newAttrVal);
        setNewAttrName("");
        setNewAttrVal("");
        setAddingAttr(false);
    };
    const addRemoveSkill = () => {
        const n = Number.parseInt(newRemoveId.trim(), 10);
        setNewRemoveId("");
        if (!Number.isFinite(n) || row.removeSkills.includes(n)) return;
        mutate(() => {
            row.removeSkills.push(n);
            const doc = row.el.ownerDocument;
            const rs = doc.createElement("removeSkill");
            rs.setAttribute("id", String(n));
            row.el.appendChild(doc.createTextNode("\n\t\t\t"));
            row.el.appendChild(rs);
            row.el.appendChild(doc.createTextNode("\n\t\t"));
        });
    };
    const delRemoveSkill = (id: number) =>
        mutate(() => {
            row.removeSkills = row.removeSkills.filter((x) => x !== id);
            for (const c of Array.from(row.el.children)) {
                if (c.tagName !== "removeSkill") continue;
                const cid = Number(c.getAttribute("id") ?? c.getAttribute("skillId"));
                if (cid === id) {
                    const prev = c.previousSibling;
                    if (prev && prev.nodeType === Node.TEXT_NODE && /^\s*$/.test(prev.textContent ?? "")) prev.remove();
                    c.remove();
                }
            }
        });

    const otherChildren = Array.from(row.el.children).filter((c) => c.tagName !== "removeSkill");

    return (
        <div className="rounded border border-[var(--color-border)]/50 bg-[var(--color-surface-2)]/40 p-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label className="flex items-center gap-1">
                    <span className={ROW_LABEL_CLS}>id</span>
                    <input
                        className={`${INPUT_CLS} w-16`}
                        defaultValue={String(row.skillId)}
                        onBlur={(e) => setSkillId(e.target.value)}
                    />
                </label>
                <button
                    type="button"
                    onClick={() => inspect(row.skillId)}
                    title="Show skill info"
                    className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-[12px] hover:text-[var(--color-accent)]"
                >
                    <span className="truncate text-[var(--color-text)]">
                        {displayName || <span className="italic text-[var(--color-text-faint)]">(no name)</span>}
                    </span>
                    <Info size={11} aria-hidden className="shrink-0 text-[var(--color-text-faint)]" />
                </button>
                <label className="flex items-center gap-1">
                    <span className={ROW_LABEL_CLS}>lvl</span>
                    <input
                        className={`${INPUT_CLS} w-12`}
                        defaultValue={String(row.skillLevel)}
                        onBlur={(e) => setSkillLevel(e.target.value)}
                    />
                </label>
                <button
                    type="button"
                    onClick={onRemove}
                    title="Remove this skill row"
                    aria-label="Remove this skill row"
                    className="ml-auto text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                >
                    <X size={13} aria-hidden />
                </button>
            </div>

            {idUnknown && (
                <div className="mt-1 text-[10px] text-[var(--color-warning)]">
                    id {row.skillId} not found in stats/skills/.
                </div>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {[...row.attrs.entries()].map(([name, value]) => (
                    <span
                        key={name}
                        className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-[1px]"
                    >
                        <span className="text-[var(--color-text-faint)]">{name}</span>
                        <input
                            className="mono w-16 bg-transparent text-[11px] outline-none"
                            defaultValue={value}
                            onBlur={(e) => {
                                if (e.target.value !== value) setAttr(name, e.target.value);
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => delAttr(name)}
                            aria-label={`Remove ${name}`}
                            className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                        >
                            <X size={10} aria-hidden />
                        </button>
                    </span>
                ))}
                {addingAttr ? (
                    <span className="inline-flex items-center gap-1">
                        <input
                            autoFocus
                            list="tree-attr-names"
                            value={newAttrName}
                            onChange={(e) => setNewAttrName(e.target.value)}
                            placeholder="attr"
                            className={`${INPUT_CLS} w-28`}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") addAttr();
                                if (e.key === "Escape") setAddingAttr(false);
                            }}
                        />
                        <input
                            value={newAttrVal}
                            onChange={(e) => setNewAttrVal(e.target.value)}
                            placeholder="value"
                            className={`${INPUT_CLS} w-20`}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") addAttr();
                                if (e.key === "Escape") setAddingAttr(false);
                            }}
                        />
                        <button
                            type="button"
                            onClick={addAttr}
                            className="rounded border border-dashed border-[var(--color-border)] px-1.5 py-[1px] text-[10px] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-accent-2)]"
                        >
                            add
                        </button>
                        <datalist id="tree-attr-names">
                            {COMMON_ROW_ATTRS.map((a) => (
                                <option key={a} value={a} />
                            ))}
                        </datalist>
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={() => setAddingAttr(true)}
                        className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-[0.1em] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                    >
                        <Plus size={10} aria-hidden /> attr
                    </button>
                )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={ROW_LABEL_CLS}>removes</span>
                {row.removeSkills.length === 0 && <span className="text-[var(--color-text-faint)]">—</span>}
                {row.removeSkills.map((id) => (
                    <SkillChip
                        key={id}
                        id={id}
                        catalog={catalog}
                        onRemove={() => delRemoveSkill(id)}
                        title={`Skill ${id} — removed from the character when this row is learned`}
                    />
                ))}
                <input
                    value={newRemoveId}
                    onChange={(e) => setNewRemoveId(e.target.value.replace(/[^\d]/g, ""))}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addRemoveSkill();
                        }
                    }}
                    onBlur={addRemoveSkill}
                    placeholder="+ id"
                    className={`${INPUT_CLS} w-14`}
                />
                {otherChildren.length > 0 && (
                    <span className="text-[10px] text-[var(--color-text-faint)]">
                        · {otherChildren.length} other child element{otherChildren.length === 1 ? "" : "s"} preserved (
                        {[...new Set(otherChildren.map((c) => c.tagName))].join(", ")})
                    </span>
                )}
            </div>
        </div>
    );
}
