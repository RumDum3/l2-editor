import { X } from "lucide-react";
import { useState } from "react";
import { ipc, type SkillnameRow } from "../../../lib/ipc";
import { logger } from "../../../lib/logger";
import { TIER2_DATS, type Tier2DatEntry } from "../../../lib/tier2Dats";
import { invalidateTier2Id, useTier2Rows } from "../../../lib/tier2RowCache";
import { invalidateSkillnameId, pickCanonicalSkillname, useSkillnameRows } from "../../../lib/skillNameRowCache";
import { useSkillRows } from "../../../lib/skillRowCache";
import { formatSkillText } from "../../../lib/skillText";
import { useSettings } from "../../../state/SettingsContext";
import { Section } from "../widgets/fieldPrimitives";
import type { Skill } from "../model";

const SKILLNAME_TEXTAREA_CLS =
    "mono mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] leading-relaxed text-[var(--color-text)] outline-none focus:border-[var(--color-accent-2)] resize-y";
const SKILLNAME_INPUT_CLS =
    "mono mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent-2)]";

function skillnameRowLabel(r: SkillnameRow): string {
    const l = r.skill_level ?? 0;
    const s = r.skill_sublevel ?? 0;
    return l === 1 && s === 0 ? "level 1" : `level ${l}${s ? ` · sub ${s}` : ""}`;
}
function skillnameRowKey(r: SkillnameRow): string {
    return `${r.skill_level ?? 0}:${r.skill_sublevel ?? 0}`;
}

export function ClientText({ skill }: { skill: Skill }) {
    const { skillNames, refreshPendingSkillNameEdits } = useSettings();
    const rows = useSkillnameRows(skillNames.kind === "done" ? skill.id : null);
    const [selKey, setSelKey] = useState<string | null>(null);

    if (skillNames.kind !== "done") return null;
    if (rows === undefined) {
        return (
            <Section storageKey="client-text" title="Client text">
                <div className="px-3 py-2 text-[11px] text-[var(--color-text-faint)]">loading…</div>
            </Section>
        );
    }
    if (!rows || rows.length === 0) return null;

    const byPos = (a: SkillnameRow, b: SkillnameRow) =>
        (a.skill_level ?? 0) - (b.skill_level ?? 0) || (a.skill_sublevel ?? 0) - (b.skill_sublevel ?? 0);
    const textRows = rows.filter((r) => !!(r.name || r.desc || r.enchant_name || r.enchant_desc)).sort(byPos);
    const pickRows = textRows.length > 0 ? textRows : [...rows].sort(byPos);
    const canonical = pickCanonicalSkillname(pickRows) ?? pickRows[0];
    const sel = (selKey && pickRows.find((r) => skillnameRowKey(r) === selKey)) || canonical;
    if (!sel) return null;

    const lvl = sel.skill_level ?? 0;
    const sub = sel.skill_sublevel ?? 0;
    const rawDesc = sel.desc ?? "";
    const rawDescParam = sel.desc_param ?? "";
    const rawEnchant = sel.enchant_desc ?? "";
    const rawEnchantParam = sel.enchant_desc_param ?? "";
    const descPreview = formatSkillText(rawDesc, rawDescParam, "block");
    const enchantPreview = formatSkillText(rawEnchant, rawEnchantParam, "block");
    const hasNameMismatch = !!sel.name && sel.name !== skill.name;
    const showEnchant = rawEnchant.length > 0 || rawEnchantParam.length > 0;
    const cascades = sub === 0 && rows.some((r) => (r.skill_level ?? 0) === lvl && (r.skill_sublevel ?? 0) > 0);

    const pushFields = (fields: Record<string, string>) => {
        ipc.applySkillNameEdits(skill.id, [{ level: lvl, sublevel: sub, fields }])
            .then(() => {
                invalidateSkillnameId(skill.id);
                refreshPendingSkillNameEdits();
            })
            .catch((e) =>
                logger.warn("skillname-sync", "description push failed", {
                    skillId: skill.id,
                    message: String(e)
                })
            );
    };
    const k = skillnameRowKey(sel);

    return (
        <Section storageKey="client-text" title="Client text">
            <div className="space-y-2 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                    <span>editing</span>
                    {pickRows.length > 1 ? (
                        <select
                            value={k}
                            onChange={(e) => setSelKey(e.target.value)}
                            className="mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] normal-case tracking-normal outline-none focus:border-[var(--color-accent-2)]"
                        >
                            {pickRows.map((r) => (
                                <option key={skillnameRowKey(r)} value={skillnameRowKey(r)}>
                                    {skillnameRowLabel(r)}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <span className="mono normal-case tracking-normal">{skillnameRowLabel(sel)}</span>
                    )}
                    {cascades && (
                        <span className="normal-case tracking-normal text-[var(--color-text-faint)]/70">
                            base — edits apply to all sub-levels at this level
                        </span>
                    )}
                    {hasNameMismatch && (
                        <span className="mono normal-case tracking-normal text-[var(--color-accent)]">
                            · {sel.name}
                        </span>
                    )}
                </div>

                <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                        Description
                    </span>
                    <textarea
                        key={`d:${k}:${rawDesc}`}
                        defaultValue={rawDesc}
                        rows={3}
                        className={SKILLNAME_TEXTAREA_CLS}
                        placeholder="(no description on the dat)"
                        onBlur={(e) => {
                            if (e.target.value !== rawDesc) pushFields({ desc: e.target.value });
                        }}
                    />
                    {descPreview && descPreview !== rawDesc && (
                        <p className="mt-1 whitespace-pre-line text-[10px] italic text-[var(--color-text-faint)]">
                            {descPreview}
                        </p>
                    )}
                </label>

                <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                        Desc params{" "}
                        <span className="lowercase tracking-normal opacity-60">
                            (<span className="mono">;</span>-separated → $s1, $s2…)
                        </span>
                    </span>
                    <input
                        key={`dp:${k}:${rawDescParam}`}
                        defaultValue={rawDescParam}
                        className={SKILLNAME_INPUT_CLS}
                        placeholder="(none)"
                        title="Semicolon-separated values — $s1 substitutes the 1st value, $s2 the 2nd, etc."
                        onBlur={(e) => {
                            if (e.target.value !== rawDescParam) pushFields({ desc_param: e.target.value });
                        }}
                    />
                </label>

                {showEnchant && (
                    <>
                        <label className="block">
                            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                                Enchant description
                            </span>
                            <textarea
                                key={`ed:${k}:${rawEnchant}`}
                                defaultValue={rawEnchant}
                                rows={2}
                                className={SKILLNAME_TEXTAREA_CLS}
                                onBlur={(e) => {
                                    if (e.target.value !== rawEnchant) pushFields({ enchant_desc: e.target.value });
                                }}
                            />
                            {enchantPreview && enchantPreview !== rawEnchant && (
                                <p className="mt-1 whitespace-pre-line text-[10px] italic text-[var(--color-text-faint)]">
                                    {enchantPreview}
                                </p>
                            )}
                        </label>
                        <label className="block">
                            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                                Enchant desc params{" "}
                                <span className="lowercase tracking-normal opacity-60">
                                    (<span className="mono">;</span>-separated → $s1, $s2…)
                                </span>
                            </span>
                            <input
                                key={`edp:${k}:${rawEnchantParam}`}
                                defaultValue={rawEnchantParam}
                                className={SKILLNAME_INPUT_CLS}
                                placeholder="(none)"
                                title="Semicolon-separated values — $s1 substitutes the 1st value, $s2 the 2nd, etc."
                                onBlur={(e) => {
                                    if (e.target.value !== rawEnchantParam)
                                        pushFields({ enchant_desc_param: e.target.value });
                                }}
                            />
                        </label>
                    </>
                )}
            </div>
        </Section>
    );
}

export function EnchantVariants({ skill }: { skill: Skill }) {
    const grpRows = useSkillRows(skill.id);
    const nameRows = useSkillnameRows(skill.id);
    const enchantRows = (grpRows ?? []).filter((r) => typeof r.skill_sublevel === "number" && r.skill_sublevel > 0);
    if (enchantRows.length === 0) return null;

    type RouteSummary = {
        route: number;
        rowCount: number;
        steps: number[];
        levels: number[];
        sampleName: string | undefined;
    };
    const byRoute = new Map<number, RouteSummary>();
    for (const r of enchantRows) {
        const sub = r.skill_sublevel as number;
        const route = Math.floor(sub / 1000);
        const step = sub % 1000;
        const lvl = Number(r.skill_level ?? 0);
        let summary = byRoute.get(route);
        if (!summary) {
            summary = { route, rowCount: 0, steps: [], levels: [], sampleName: undefined };
            byRoute.set(route, summary);
        }
        summary.rowCount++;
        if (!summary.steps.includes(step)) summary.steps.push(step);
        if (!summary.levels.includes(lvl)) summary.levels.push(lvl);
    }
    if (nameRows) {
        for (const summary of byRoute.values()) {
            const candidates = nameRows
                .filter((n) => {
                    const sub = Number(n.skill_sublevel ?? 0);
                    return Math.floor(sub / 1000) === summary.route;
                })
                .sort(
                    (a, b) =>
                        Number(a.skill_level ?? 0) - Number(b.skill_level ?? 0) ||
                        Number(a.skill_sublevel ?? 0) - Number(b.skill_sublevel ?? 0)
                );
            const sample = candidates[0];
            summary.sampleName = sample?.name;
        }
    }

    const routes = [...byRoute.values()].sort((a, b) => a.route - b.route);
    const totalRows = enchantRows.length;

    return (
        <Section
            storageKey="enchant-variants"
            title={`Enchant variants · ${routes.length} route${routes.length === 1 ? "" : "s"} · ${totalRows} rows`}
        >
            <div className="grid gap-1.5 px-3 py-2 text-[11px]">
                {routes.map((r) => {
                    const minStep = Math.min(...r.steps);
                    const maxStep = Math.max(...r.steps);
                    const minLvl = Math.min(...r.levels);
                    const maxLvl = Math.max(...r.levels);
                    const stepLabel = minStep === maxStep ? `${minStep}` : `${minStep}–${maxStep}`;
                    const lvlLabel = minLvl === maxLvl ? `${minLvl}` : `${minLvl}–${maxLvl}`;
                    return (
                        <div
                            key={r.route}
                            className="flex items-center gap-3 rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)] px-3 py-1.5"
                        >
                            <span className="mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                                Route
                            </span>
                            <span className="mono text-[var(--color-accent-2)]">{r.route}</span>
                            <span className="text-[var(--color-text-faint)]">·</span>
                            <span className="mono text-[10px] text-[var(--color-text-faint)]">steps {stepLabel}</span>
                            <span className="text-[var(--color-text-faint)]">·</span>
                            <span className="mono text-[10px] text-[var(--color-text-faint)]">lv {lvlLabel}</span>
                            <span className="text-[var(--color-text-faint)]">·</span>
                            <span className="mono text-[10px] text-[var(--color-text-faint)]">{r.rowCount} rows</span>
                            {r.sampleName && (
                                <span className="ml-auto truncate text-[var(--color-accent)]" title={r.sampleName}>
                                    {r.sampleName}
                                </span>
                            )}
                        </div>
                    );
                })}
                <p className="text-[10px] text-[var(--color-text-faint)]">
                    To tweak a specific route, open the matching field above and use the “Sublevel overrides” section in
                    its Edit modal — Save flushes both base and override values to the client.
                </p>
            </div>
        </Section>
    );
}

export function ClientExtras({ skill }: { skill: Skill }) {
    return (
        <>
            {TIER2_DATS.filter((entry) => (entry.appliesTo ?? "skill") === "skill").map((entry) => (
                <Tier2RowsBlock key={entry.key} entry={entry} skillId={skill.id} />
            ))}
        </>
    );
}

const TIER2_ID_KEYS: ReadonlySet<string> = new Set([
    "skill_id",
    "skill_level",
    "skill_sublevel",
    "origin_skill_id",
    "origin_skill_level",
    "alter_skill_id",
    "alter_skill_level",
    "enchant_route",
    "enchant_step",
    "enchant_sub_level"
]);

function Tier2RowsBlock({ entry, skillId }: { entry: Tier2DatEntry; skillId: number }) {
    const rows = useTier2Rows(entry.key, skillId);
    const { refreshPendingTier2Edits } = useSettings();
    if (!rows || rows.length === 0) return null;

    const idxField = entry.indexField ?? "skill_id";

    const levelField = idxField.replace(/_id$/, "_level");
    const lvlOf = (r: Record<string, unknown>) => {
        const n = Number(r[levelField]);
        return Number.isFinite(n) ? n : 0;
    };
    const maxLevel = Math.max(...rows.map(lvlOf), 0);

    const locatorOf = (row: Record<string, unknown>) => {
        const loc: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
            if (TIER2_ID_KEYS.has(k)) loc[k] = v;
        }
        return loc;
    };
    const refresh = () => {
        invalidateTier2Id(entry.key, skillId);
        refreshPendingTier2Edits(entry.key);
    };
    const warn = (action: string, e: unknown) =>
        logger.warn("tier2-sync", `${action} failed`, { key: entry.key, skillId, message: String(e) });

    const commit = (row: Record<string, unknown>, field: string, newValue: unknown) => {
        ipc.applyGenericDatEdits(entry.key, locatorOf(row), { [field]: newValue })
            .then(refresh)
            .catch((e) => warn("edit", e));
    };
    const removeRow = (row: Record<string, unknown>) => {
        ipc.deleteGenericDatRow(entry.key, locatorOf(row))
            .then(refresh)
            .catch((e) => warn("delete row", e));
    };
    const addRow = () => {
        const tmpl = [...rows].sort((a, b) => lvlOf(b) - lvlOf(a))[0] ?? rows[0];
        const overrides: Record<string, unknown> = { [idxField]: skillId, [levelField]: maxLevel + 1 };
        if ("skill_sublevel" in tmpl) overrides.skill_sublevel = 0;
        ipc.addGenericDatRow(entry.key, locatorOf(tmpl), overrides)
            .then((newId) => {
                if (newId == null) {
                    logger.warn("tier2-sync", "add row: nothing to clone from", { key: entry.key });
                    return;
                }
                refresh();
            })
            .catch((e) => warn("add row", e));
    };

    return (
        <Section storageKey={`tier2:${entry.key}`} title={entry.label}>
            <div className="space-y-1.5 px-3 py-2">
                {rows.map((row, i) => {
                    const idFields = Object.entries(row).filter(([k]) => TIER2_ID_KEYS.has(k));
                    const editFields = Object.entries(row).filter(([k]) => !TIER2_ID_KEYS.has(k));
                    return (
                        <div
                            key={`r${i}`}
                            className="space-y-1 rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)] p-2"
                        >
                            <div className="flex items-start justify-between gap-2">
                                {idFields.length > 0 ? (
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                                        {idFields.map(([k, v]) => (
                                            <span key={k}>
                                                <span>{k.replace(/_/g, " ")}</span>{" "}
                                                <span className="mono normal-case tracking-normal text-[var(--color-accent-2)]">
                                                    {String(v)}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <span />
                                )}
                                <button
                                    type="button"
                                    onClick={() => removeRow(row)}
                                    title="Delete this row from the dat"
                                    aria-label="Delete this row from the dat"
                                    className="shrink-0 text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                                >
                                    <X size={13} aria-hidden />
                                </button>
                            </div>
                            {editFields.length === 0 ? (
                                <div className="text-[11px] text-[var(--color-text-faint)]">(no editable fields)</div>
                            ) : (
                                editFields.map(([k, v]) => (
                                    <Tier2FieldRow key={k} field={k} value={v} onCommit={(nv) => commit(row, k, nv)} />
                                ))
                            )}
                        </div>
                    );
                })}
                <button
                    type="button"
                    onClick={addRow}
                    title={`Append a copy of the ${levelField.replace(/_/g, " ")}-${maxLevel} row with the level bumped`}
                    className="text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                >
                    + add row (copy of {levelField.replace(/_/g, " ")} {maxLevel})
                </button>
            </div>
            <div className="px-3 pb-2 text-[10px] text-[var(--color-text-faint)]">{entry.description}</div>
        </Section>
    );
}

function Tier2FieldRow({
    field,
    value,
    onCommit
}: {
    field: string;
    value: unknown;
    onCommit: (newValue: unknown) => void;
}) {
    const isBool = typeof value === "boolean";
    const isNum = typeof value === "number";
    const display = value == null ? "" : String(value);
    if (isBool) {
        return (
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(e) => onCommit(e.target.checked)}
                    className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent-2)]"
                />
                <span className="mono w-44 shrink-0 text-[11px] text-[var(--color-text-faint)]">{field}</span>
                <span className="text-[11px] text-[var(--color-text-faint)]">{value ? "true" : "false"}</span>
            </label>
        );
    }
    return (
        <label className="flex items-center gap-2">
            <span className="mono w-44 shrink-0 text-[11px] text-[var(--color-text-faint)]">{field}</span>
            <input
                key={display}
                defaultValue={display}
                className="mono flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                onBlur={(e) => {
                    const nv = e.target.value;
                    if (nv === display) return;
                    if (isNum) {
                        const n = Number(nv);
                        if (Number.isFinite(n)) {
                            onCommit(n);
                            return;
                        }
                    }
                    onCommit(nv);
                }}
            />
        </label>
    );
}
