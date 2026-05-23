import { useCallback } from "react";
import type { SkillBrief } from "../../classes/skillCatalog";
import { ipc } from "../../lib/ipc";
import { logger } from "../../lib/logger";
import { TIER2_DATS } from "../../lib/tier2Dats";
import { invalidateTier2Id } from "../../lib/tier2RowCache";
import { useSettings } from "../../state/SettingsContext";

export type SkillCatalog = Map<number, SkillBrief> | null;

export const CLASS_NODES_KEY = "classes.collapsedClassNodes";

export const CLASS_DAT_KEYS = TIER2_DATS.filter((e) => e.appliesTo === "class").map((e) => e.key);

export const TIER_LABELS = ["base", "1st", "2nd", "3rd", "4th", "5th"];
export function tierLabel(depth: number): string {
    return TIER_LABELS[depth] ?? `tier ${depth}`;
}

export type Issue = { severity: "error" | "warn" | "note"; message: string; classId?: number };

export const CLASSINFO_CLIENT_FIELDS: readonly (readonly [field: string, label: string])[] = [
    ["classrole", "role"],
    ["classrole_name", "role key"],
    ["classtransfer_degree", "transfer"]
];

export const CLASSINFO_HELP: Record<string, string> = {
    classrole:
        "Role group the client buckets this class under in the class window / class-change tree — Adventurer, Fighter, Knight, Rogue, Archer, Wizard, Summoner, Healer, Enchanter, Warrior… (a name resolved via L2GameDataName.dat).",
    classrole_name:
        "Index into the client's classrole_type enum — picks which localized role label (novice / warrior / knight / rogue / archer / wizard / summoner / support / enchanter…) the class window shows for this class.",
    classtransfer_degree:
        "How many class changes deep this class is: 0 = starting class, 1 = after the 1st transfer, 2 = after the 2nd, and so on. The class-change UI uses it to place the class in the progression.",
    description:
        "Free text shown in the in-game class window when this class is selected. Client-only — there's no server-side equivalent (classList.xml has only the name)."
};

export const CLASSINFO_STAT_PAIRS: readonly (readonly [clientKey: string, serverTag: string])[] = [
    ["str", "baseSTR"],
    ["dex", "baseDEX"],
    ["con", "baseCON"],
    ["int", "baseINT"],
    ["wit", "baseWIT"],
    ["men", "baseMEN"],
    ["luc", "baseLUC"],
    ["cha", "baseCHA"]
];

export function templateBaseStats(staticData: Element | null): Record<string, number> {
    const out: Record<string, number> = {};
    if (!staticData) return out;
    const kids = Array.from(staticData.children);
    for (const [clientKey, serverTag] of CLASSINFO_STAT_PAIRS) {
        const el = kids.find((c) => c.tagName === serverTag);
        if (!el) continue;
        const n = Number((el.textContent ?? "").trim());
        if (Number.isFinite(n)) out[clientKey] = n;
    }
    return out;
}

export const CLASSINFO_INPUT =
    "mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent-2)]";
export const DESC_TEXTAREA =
    "mono mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] leading-relaxed text-[var(--color-text)] outline-none focus:border-[var(--color-accent-2)] resize-y";
export const DESC_LABEL = "text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]";

export const INIT_STAT_COLS = ["str", "dex", "con", "int", "wit", "men", "luc", "cha"] as const;
export const CLIENT_DAT_INPUT =
    "mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent-2)]";
export const CHAIN_TREE_IDS = (row: Record<string, unknown>): number[] => {
    const t = row.tree;
    if (!Array.isArray(t)) return [];
    return t
        .map((x) => (typeof x === "number" ? x : (x as Record<string, unknown> | null)?.class_id))
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
};
export const chainArrayShape = (row: Record<string, unknown>): "obj" | "num" => {
    const t = row.tree;
    return Array.isArray(t) && t.length > 0 && typeof t[0] === "object" ? "obj" : "num";
};
export const buildChainArray = (ids: number[], shape: "obj" | "num"): unknown[] =>
    shape === "obj" ? ids.map((id) => ({ class_id: id })) : ids.slice();

export const INIT_RACE_NAMES = ["human", "elf", "dark elf", "orc", "dwarf", "kamael", "ertheia"];
export const INIT_SEX_NAMES = ["male", "female"];
export const initRowLabel = (r: Record<string, unknown>): string => {
    const ri = Number(r.race);
    const si = Number(r.sex);
    const rn = Number.isFinite(ri) && INIT_RACE_NAMES[ri] ? INIT_RACE_NAMES[ri] : `race ${r.race}`;
    const sn = Number.isFinite(si) && INIT_SEX_NAMES[si] ? INIT_SEX_NAMES[si] : `sex ${r.sex}`;
    return `${rn} · ${sn}`;
};

export function useDatField(pushOp: (op: { undo: () => void; redo: () => void }) => void) {
    const { refreshPendingTier2Edits } = useSettings();
    return useCallback(
        (
            key: string,
            invalidateId: number,
            locator: Record<string, unknown>,
            fields: Record<string, unknown>,
            undoFields: Record<string, unknown>
        ) => {
            const apply = (f: Record<string, unknown>) =>
                ipc
                    .applyGenericDatEdits(key, locator, f)
                    .then(() => {
                        invalidateTier2Id(key, invalidateId);
                        return refreshPendingTier2Edits(key);
                    })
                    .catch((e) => logger.warn(`${key}-edit`, "edit failed", { ...locator, message: String(e) }));
            void apply(fields);
            pushOp({ undo: () => void apply(undoFields), redo: () => void apply(fields) });
        },
        [pushOp, refreshPendingTier2Edits]
    );
}
