import { X } from "lucide-react";
import { useState } from "react";
import { ipc } from "../../../lib/ipc";
import { logger } from "../../../lib/logger";
import { invalidateTier2Id, useTier2Rows } from "../../../lib/tier2RowCache";
import { useSettings } from "../../../state/SettingsContext";
import { HelpIcon, Tooltip } from "../../Tooltip";
import {
    buildChainArray,
    CHAIN_TREE_IDS,
    chainArrayShape,
    CLASSINFO_CLIENT_FIELDS,
    CLASSINFO_HELP,
    CLASSINFO_INPUT,
    CLIENT_DAT_INPUT,
    DESC_LABEL,
    DESC_TEXTAREA,
    INIT_STAT_COLS,
    initRowLabel,
    useDatField
} from "../classData";
import { Row, Section } from "../ui";

export function ClassInfoHelp({ field }: { field: string }) {
    const help = CLASSINFO_HELP[field];
    if (!help) return null;
    return (
        <Tooltip content={<span className="text-[11px] normal-case tracking-normal">{help}</span>}>
            <HelpIcon />
        </Tooltip>
    );
}

export function DescField({
    label,
    value,
    onCommit,
    rows = 3,
    placeholder = "(empty)",
    help
}: {
    label: React.ReactNode;
    value: unknown;
    onCommit: (val: string, orig: unknown) => void;
    rows?: number;
    placeholder?: string;
    help?: React.ReactNode;
}) {
    const display = value == null ? "" : String(value);
    return (
        <label className="block">
            <span className={`inline-flex items-center gap-1 ${DESC_LABEL}`}>
                {label}
                {help}
            </span>
            <textarea
                key={`${typeof label === "string" ? label : ""}:${display}`}
                defaultValue={display}
                rows={rows}
                className={DESC_TEXTAREA}
                placeholder={placeholder}
                onBlur={(e) => {
                    if (e.target.value !== display) onCommit(e.target.value, value);
                }}
            />
        </label>
    );
}

export function ClassClientInfoRows({
    classId,
    pushOp
}: {
    classId: number;
    pushOp: (op: { undo: () => void; redo: () => void }) => void;
}) {
    const infoRows = useTier2Rows("class_info", classId);
    const descRows = useTier2Rows("class_tree_desc", classId);
    const editDat = useDatField(pushOp);
    const r = infoRows && infoRows.length > 0 ? (infoRows[0] as Record<string, unknown>) : null;
    const dr = descRows && descRows.length > 0 ? (descRows[0] as Record<string, unknown>) : null;
    if (!r && !dr) return null;
    const fields = r ? CLASSINFO_CLIENT_FIELDS.filter(([f]) => f in r) : [];
    const hasDesc = !!r && "description" in r;

    const commitInfo = (field: string, raw: string, orig: unknown) => {
        let value: unknown = raw;
        if (typeof orig === "number") {
            const n = Number(raw.trim());
            if (!Number.isFinite(n)) return;
            value = n;
        }
        editDat("class_info", classId, { class: classId }, { [field]: value }, { [field]: orig });
    };
    const commitDesc = (field: string, val: string, orig: unknown) =>
        editDat("class_tree_desc", classId, { classID: classId }, { [field]: val }, { [field]: orig });
    return (
        <>
            {fields.map(([field, label]) => (
                <Row key={field} label={label}>
                    <input
                        key={r![field] == null ? "" : String(r![field])}
                        defaultValue={r![field] == null ? "" : String(r![field])}
                        onBlur={(e) => {
                            const cur = r![field] == null ? "" : String(r![field]);
                            if (e.target.value !== cur) commitInfo(field, e.target.value, r![field]);
                        }}
                        className={`${CLASSINFO_INPUT} w-44`}
                    />
                    <span className="ml-1.5">
                        <ClassInfoHelp field={field} />
                    </span>
                </Row>
            ))}
            {hasDesc && (
                <DescField
                    label="Description"
                    value={r!.description}
                    onCommit={(val, orig) => commitInfo("description", val, orig)}
                    placeholder="(no description on the dat)"
                    help={<ClassInfoHelp field="description" />}
                />
            )}
            {dr && (
                <>
                    <DescField
                        label="desc1"
                        value={dr.desc1}
                        rows={2}
                        onCommit={(val, orig) => commitDesc("desc1", val, orig)}
                    />
                    <DescField
                        label="desc2"
                        value={dr.desc2}
                        rows={2}
                        onCommit={(val, orig) => commitDesc("desc2", val, orig)}
                    />
                </>
            )}
        </>
    );
}

export function ClassInitialStatsBlock({
    classId,
    templateStats,
    pushOp
}: {
    classId: number;
    templateStats?: Record<string, number>;
    pushOp: (op: { undo: () => void; redo: () => void }) => void;
}) {
    const rows = useTier2Rows("class_initial_stat", classId);
    const editDat = useDatField(pushOp);
    if (!rows || rows.length === 0) return null;
    const commitInit = (r: Record<string, unknown>, field: string, raw: string) => {
        const n = Number(raw.trim());
        if (!Number.isFinite(n)) return;
        const old = Number(r[field]);
        if (n === old) return;
        editDat(
            "class_initial_stat",
            classId,
            { class: classId, race: r.race, sex: r.sex },
            { [field]: n },
            { [field]: old }
        );
    };
    return (
        <div className="space-y-1 border-t border-[var(--color-border)]/40 pt-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                initial stats — per race / sex
            </div>
            <div className="overflow-x-auto">
                <table className="text-[11px]">
                    <thead>
                        <tr className="text-[var(--color-text-faint)]">
                            <th className="px-2 py-0.5 text-left font-normal" />
                            {INIT_STAT_COLS.map((k) => (
                                <th key={k} className="px-1 py-0.5 text-center font-normal uppercase">
                                    {k}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => {
                            const r = row as Record<string, unknown>;
                            return (
                                <tr key={i} className="border-t border-[var(--color-border)]/30">
                                    <td className="whitespace-nowrap px-2 py-0.5 text-[var(--color-text)]">
                                        {initRowLabel(r)}
                                    </td>
                                    {INIT_STAT_COLS.map((k) => {
                                        const cur = Number(r[k]);
                                        const drift =
                                            templateStats?.[k] != null &&
                                            Number.isFinite(cur) &&
                                            cur !== templateStats[k];
                                        return (
                                            <td key={k} className="px-0.5 py-0.5">
                                                <div className="flex items-center justify-center gap-0.5">
                                                    <input
                                                        key={`${k}:${cur}`}
                                                        type="number"
                                                        defaultValue={Number.isFinite(cur) ? String(cur) : ""}
                                                        onBlur={(e) => commitInit(r, k, e.target.value)}
                                                        title={
                                                            drift ? `server template: ${templateStats?.[k]}` : undefined
                                                        }
                                                        className={`mono w-12 rounded border bg-[var(--color-surface)] px-1 py-0.5 text-center text-[11px] outline-none focus:border-[var(--color-accent-2)] ${
                                                            drift
                                                                ? "border-[var(--color-warning)] text-[var(--color-warning)]"
                                                                : "border-[var(--color-border)]"
                                                        }`}
                                                    />
                                                    {drift && (
                                                        <span className="font-bold text-[var(--color-warning)]">!</span>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function ClassAwakeningPathsBlock({
    classId,
    classNameOf,
    pushOp
}: {
    classId: number;
    classNameOf: (id: number) => string;
    pushOp: (op: { undo: () => void; redo: () => void }) => void;
}) {
    const { refreshPendingTier2Edits } = useSettings();
    const chains = useTier2Rows("class_tree", classId);
    const [appendIds, setAppendIds] = useState<Record<number, string>>({});
    if (!chains || chains.length === 0) return null;
    const editChain = (row: Record<string, unknown>, newIds: number[]) => {
        const shape = chainArrayShape(row);
        const oldIds = CHAIN_TREE_IDS(row);
        const apply = (fromIds: number[], toIds: number[]) =>
            ipc
                .applyGenericDatEdits(
                    "class_tree",
                    { id: classId, tree: buildChainArray(fromIds, shape) },
                    { tree: buildChainArray(toIds, shape) }
                )
                .then(() => {
                    invalidateTier2Id("class_tree", classId);
                    return refreshPendingTier2Edits("class_tree");
                })
                .catch((e) => logger.warn("classtree-edit", "edit failed", { classId, message: String(e) }));
        void apply(oldIds, newIds);
        pushOp({ undo: () => void apply(newIds, oldIds), redo: () => void apply(oldIds, newIds) });
    };
    return (
        <Section title="Awakening paths">
            <p className="text-[10px] text-[var(--color-text-faint)]">
                The class-change chains shown in the in-game UI.
            </p>
            {chains.map((row, i) => {
                const r = row as Record<string, unknown>;
                const ids = CHAIN_TREE_IDS(r);
                return (
                    <div key={i} className="flex flex-wrap items-center gap-1 text-[11px]">
                        {ids.map((id, j) => (
                            <span key={`${j}:${id}`} className="flex items-center gap-1">
                                {j > 0 && <span className="text-[var(--color-text-faint)]">→</span>}
                                <span
                                    className={`inline-flex items-center gap-1 rounded border px-1 py-[1px] ${
                                        id === classId
                                            ? "border-[var(--color-accent-2)]"
                                            : "border-[var(--color-border)]"
                                    }`}
                                >
                                    <input
                                        key={`${j}:${id}`}
                                        type="number"
                                        defaultValue={id}
                                        onBlur={(e) => {
                                            const n = Number(e.target.value.trim());
                                            if (Number.isFinite(n) && n !== id)
                                                editChain(
                                                    r,
                                                    ids.map((x, k) => (k === j ? n : x))
                                                );
                                        }}
                                        className="mono w-12 bg-transparent text-[11px] outline-none"
                                    />
                                    <span className="truncate text-[var(--color-text-faint)]">{classNameOf(id)}</span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            editChain(
                                                r,
                                                ids.filter((_, k) => k !== j)
                                            )
                                        }
                                        aria-label={`Remove ${classNameOf(id)}`}
                                        className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                                    >
                                        <X size={10} aria-hidden />
                                    </button>
                                </span>
                            </span>
                        ))}
                        <span className="text-[var(--color-text-faint)]">→</span>
                        <input
                            value={appendIds[i] ?? ""}
                            onChange={(e) => setAppendIds((p) => ({ ...p, [i]: e.target.value.replace(/[^\d]/g, "") }))}
                            onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                const n = Number((appendIds[i] ?? "").trim());
                                if (Number.isFinite(n) && (appendIds[i] ?? "") !== "") {
                                    editChain(r, [...ids, n]);
                                    setAppendIds((p) => ({ ...p, [i]: "" }));
                                }
                            }}
                            placeholder="+ id"
                            className={`${CLIENT_DAT_INPUT} w-14`}
                        />
                    </div>
                );
            })}
        </Section>
    );
}
