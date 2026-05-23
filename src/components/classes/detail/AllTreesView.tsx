import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { SkillTrees } from "../../../classes/model";
import { appendSkillTreeBlock, KNOWN_TREE_TYPES, TreeBlockEditor } from "./SkillTreeEditor";
import type { SkillCatalog } from "../classData";
import { Placeholder } from "../ui";

export function AllTreesView({
    trees,
    selectedType,
    onSelectType,
    mutate,
    catalog,
    onReindex,
    onAddFile,
    rev
}: {
    trees: SkillTrees | null;
    selectedType: string | null;
    onSelectType: (t: string) => void;
    mutate: (path: string, fn: () => void) => void;
    catalog: SkillCatalog;
    onReindex: () => void;
    onAddFile: (filename: string) => void;
    rev: number;
}) {
    const types = useMemo(
        () => (trees ? [...trees.byType.entries()].sort((a, b) => a[0].localeCompare(b[0])) : []),
        [trees, rev]
    );
    const [addingBlock, setAddingBlock] = useState(false);
    const [nbType, setNbType] = useState("classSkillTree");
    const [nbClassId, setNbClassId] = useState("");
    const [nbFile, setNbFile] = useState("");
    const [addingFile, setAddingFile] = useState(false);
    const [nfName, setNfName] = useState("");
    if (!trees) return <Placeholder>Couldn't load stats/players/skillTrees/ — check the data folder.</Placeholder>;
    const blocks = selectedType ? (trees.byType.get(selectedType) ?? []) : [];
    const defaultFileFor = (type: string) => trees.byType.get(type)?.[0]?.file ?? trees.files[0] ?? null;
    const addBlock = () => {
        const type = nbType.trim() || "classSkillTree";
        const file = (nbFile && trees.files.find((f) => f.path === nbFile)) || defaultFileFor(type);
        if (!file) return;
        const cid = nbClassId.trim() === "" ? null : Number(nbClassId.trim());
        const classId = cid != null && Number.isFinite(cid) ? cid : null;
        mutate(file.path, () => {
            appendSkillTreeBlock(file, type, classId);
        });
        onReindex();
        onSelectType(type);
        setAddingBlock(false);
        setNbClassId("");
    };
    return (
        <div className="flex min-h-0 flex-1">
            <aside className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="flex items-center justify-between border-b border-[var(--color-border)]/60 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                    <span>tree types ({types.length})</span>
                    <button
                        type="button"
                        onClick={() => setAddingFile((v) => !v)}
                        title="Create a new skillTrees/*.xml file"
                        className="inline-flex items-center gap-0.5 tracking-[0.1em] hover:text-[var(--color-accent-2)]"
                    >
                        <Plus size={11} aria-hidden /> file
                    </button>
                </div>
                {addingFile && (
                    <div className="flex items-center gap-1 border-b border-[var(--color-border)]/60 bg-[var(--color-surface-2)]/40 px-2 py-1.5">
                        <input
                            autoFocus
                            value={nfName}
                            onChange={(e) => setNfName(e.target.value)}
                            placeholder="name.xml"
                            className="mono w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent-2)]"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && nfName.trim()) {
                                    onAddFile(nfName);
                                    setNfName("");
                                    setAddingFile(false);
                                }
                                if (e.key === "Escape") setAddingFile(false);
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => {
                                if (nfName.trim()) {
                                    onAddFile(nfName);
                                    setNfName("");
                                    setAddingFile(false);
                                }
                            }}
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] hover:border-[var(--color-accent-2)]"
                        >
                            add
                        </button>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto py-1 text-[12px]">
                    {types.map(([type, bs]) => {
                        const rows = bs.reduce((n, b) => n + b.rows.length, 0);
                        const active = selectedType === type;
                        return (
                            <button
                                type="button"
                                key={type}
                                onClick={() => onSelectType(type)}
                                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-2)] ${
                                    active ? "bg-[var(--color-surface-2)] text-[var(--color-accent)]" : ""
                                }`}
                            >
                                <span className="mono truncate">{type}</span>
                                <span className="ml-auto shrink-0 text-[10px] text-[var(--color-text-faint)]">
                                    {bs.length} blk · {rows} sk
                                </span>
                            </button>
                        );
                    })}
                </div>
            </aside>
            <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--color-bg)] p-4">
                <div className="mx-auto max-w-3xl space-y-3">
                    <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-faint)]">
                        {selectedType ? (
                            <span>
                                <span className="mono text-[var(--color-accent)]">{selectedType}</span> —{" "}
                                {blocks.length} block
                                {blocks.length === 1 ? "" : "s"}
                            </span>
                        ) : (
                            <span>Pick a tree type on the left, or add a block.</span>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setNbType(selectedType ?? "classSkillTree");
                                setAddingBlock((v) => !v);
                            }}
                            disabled={trees.files.length === 0}
                            className="ml-auto inline-flex items-center gap-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)] disabled:opacity-40"
                        >
                            <Plus size={11} aria-hidden /> skill tree
                        </button>
                    </div>
                    {addingBlock && trees.files.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)]/40 p-2 text-[11px]">
                            <span className="text-[var(--color-text-faint)]">type</span>
                            <input
                                value={nbType}
                                onChange={(e) => setNbType(e.target.value)}
                                list="skilltree-types-add"
                                className="mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent-2)]"
                            />
                            <span className="text-[var(--color-text-faint)]">classId</span>
                            <input
                                value={nbClassId}
                                onChange={(e) => setNbClassId(e.target.value.replace(/[^\d]/g, ""))}
                                placeholder="(none)"
                                className="mono w-16 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent-2)]"
                            />
                            <span className="text-[var(--color-text-faint)]">in</span>
                            <select
                                value={nbFile || defaultFileFor(nbType.trim() || "classSkillTree")?.path || ""}
                                onChange={(e) => setNbFile(e.target.value)}
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
                                onClick={addBlock}
                                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 hover:border-[var(--color-accent-2)]"
                            >
                                Add
                            </button>
                            <button
                                type="button"
                                onClick={() => setAddingBlock(false)}
                                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)]"
                            >
                                Cancel
                            </button>
                            <datalist id="skilltree-types-add">
                                {KNOWN_TREE_TYPES.map((t) => (
                                    <option key={t} value={t} />
                                ))}
                            </datalist>
                        </div>
                    )}
                    {!selectedType
                        ? null
                        : blocks.map((b, i) => (
                              <TreeBlockEditor
                                  key={`${b.file.path}#${i}`}
                                  block={b}
                                  mutate={mutate}
                                  catalog={catalog}
                                  onReindex={onReindex}
                              />
                          ))}
                </div>
            </div>
        </div>
    );
}
