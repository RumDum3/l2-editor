import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { compareValue, type Drift, type DriftField } from "../../../lib/drift";
import { ipc } from "../../../lib/ipc";
import { logger } from "../../../lib/logger";
import { findMismatches } from "../../../lib/skillFieldMap";
import { DriftBadge } from "../../../components/Drift";
import { invalidateSkillnameId, useSkillnameRows } from "../../../lib/skillNameRowCache";
import { useSkillRows } from "../../../lib/skillRowCache";
import { useSettings } from "../../../state/SettingsContext";
import { MismatchBadge } from "../widgets/SkillCard";
import { Field, Section } from "../widgets/fieldPrimitives";
import { rootHelpFor } from "../data/help";
import { lintSkill } from "../lint";
import { useClassSkillTrees } from "../data/skillTrees";
import { type RootAttr, rootAttrDefault, setRootAttr, type Skill } from "../model";

export function Header({
    skill,
    mutate,
    onCompare
}: {
    skill: Skill;
    mutate: (fn: () => void) => void;
    onCompare: () => void;
}) {
    const { skillgrp, skillNames, refreshPendingSkillNameEdits } = useSettings();
    const rows = useSkillRows(skillgrp.kind === "done" ? skill.id : null);
    const fieldMismatches = rows ? findMismatches(skill, rows).length : 0;

    const nameRows = useSkillnameRows(skillNames.kind === "done" ? skill.id : null);
    const nameDrift = useMemo<Drift | null>(() => {
        if (skillNames.kind !== "done" || !nameRows) return null;
        const fields: DriftField[] = [];
        for (const r of nameRows) {
            if ((r.skill_sublevel ?? 0) !== 0) continue;
            if (typeof r.name !== "string") continue;
            const f = compareValue({
                label: `name @ level ${r.skill_level}`,
                server: skill.name,
                client: r.name
            });
            if (f) fields.push({ ...f, note: "SkillName.dat row" });
        }
        if (fields.length === 0) return null;
        return { subject: `skill #${skill.id}`, clientSource: "SkillName.dat", fields };
    }, [skillNames.kind, nameRows, skill.id, skill.name]);
    const totalMismatches = fieldMismatches + (nameDrift ? 1 : 0);

    const pushNameToClient = () => {
        if (skillNames.kind !== "done" || !skill.name) return;
        const toLevel = Math.max(1, skill.toLevel | 0);
        const updates = [];
        for (let lvl = 1; lvl <= toLevel; lvl++) {
            updates.push({ level: lvl, sublevel: 0, fields: { name: skill.name } });
        }
        ipc.applySkillNameEdits(skill.id, updates)
            .then((hits) => {
                invalidateSkillnameId(skill.id);
                refreshPendingSkillNameEdits();
                if (hits > 0) {
                    logger.info("skill-sync", `pushed XML name "${skill.name}" → client SkillName (${hits} rows)`);
                }
            })
            .catch((e) =>
                logger.warn("skillname-sync", "name push failed", {
                    skillId: skill.id,
                    message: String(e)
                })
            );
    };

    return (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            <div className="flex items-baseline gap-3">
                <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">Skill</span>
                <span className="mono text-[var(--color-accent-2)]">#{skill.id}</span>
                <span className="text-[var(--color-accent)] text-sm">{skill.name}</span>
                {totalMismatches > 0 && <MismatchBadge count={totalMismatches} />}
                <button
                    type="button"
                    onClick={onCompare}
                    className="ml-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] hover:border-[var(--color-accent-2)]"
                    title="Compare this skill with another"
                >
                    Compare with…
                </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
                <Field
                    label="id"
                    value={String(skill.id)}
                    onCommit={(v) => mutate(() => setRootAttr(skill, "id", v))}
                    help={rootHelpFor("id")}
                />
                <div>
                    <Field
                        label="name"
                        value={skill.name}
                        onCommit={(v) => mutate(() => setRootAttr(skill, "name", v))}
                        help={rootHelpFor("name")}
                    />
                    {nameDrift && (
                        <div className="mt-0.5 flex items-center gap-1.5 pl-3 text-[10px]">
                            <DriftBadge drift={nameDrift} />
                            <button
                                type="button"
                                onClick={pushNameToClient}
                                className="rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-1 py-[1px] text-[8px] font-semibold uppercase tracking-[0.15em] text-[var(--color-warning)] hover:bg-[var(--color-warning)]/20"
                                title="Write the server XML name to every SkillName row of this skill (Save flushes to disk)"
                            >
                                push
                            </button>
                        </div>
                    )}
                </div>
                <Field
                    label="toLevel"
                    value={String(skill.toLevel)}
                    onCommit={(v) => mutate(() => setRootAttr(skill, "toLevel", v))}
                    help={rootHelpFor("toLevel")}
                />
            </div>
            <AdvancedIdentity skill={skill} mutate={mutate} />
        </div>
    );
}

function AdvancedIdentity({ skill, mutate }: { skill: Skill; mutate: (fn: () => void) => void }) {
    const [open, setOpen] = useState(false);
    const attrs: Exclude<RootAttr, "id" | "name" | "toLevel">[] = [
        "subLevel",
        "referenceId",
        "displayId",
        "displayLevel"
    ];
    return (
        <div className="mt-3">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
            >
                {open ? <ChevronDown size={11} aria-hidden /> : <ChevronRight size={11} aria-hidden />} more identity
            </button>
            {open && (
                <div className="mt-2 grid grid-cols-4 gap-3">
                    {attrs.map((name) => {
                        const cur = skill.el.getAttribute(name) ?? "";
                        return (
                            <Field
                                key={`${name}-${cur}`}
                                label={name}
                                value={cur}
                                placeholder={rootAttrDefault(skill, name) ?? "(per level)"}
                                onCommit={(v) => mutate(() => setRootAttr(skill, name, v))}
                                help={rootHelpFor(name)}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export function ClassTreesSection({ skill }: { skill: Skill }) {
    const { config } = useSettings();
    const trees = useClassSkillTrees(config?.dataRoot);
    return (
        <Section storageKey="class-trees" title="Class skill trees">
            <div className="space-y-1.5 px-3 py-2 text-[11px]">
                {trees == null ? (
                    <div className="text-[var(--color-text-faint)]">Loading class data…</div>
                ) : (
                    (() => {
                        const isCommon = trees.commonSkills.has(skill.id);
                        const owners = [...(trees.skillOwners.get(skill.id) ?? [])].sort(
                            (a, b) => a.classId - b.classId
                        );
                        const nameOf = (cid: number) => trees.classes.find((c) => c.id === cid)?.name ?? `class ${cid}`;
                        if (!isCommon && owners.length === 0) {
                            return (
                                <div className="text-[var(--color-text-faint)]">
                                    Not in any class skill tree — a mob / quest / item skill, or a higher level of a
                                    learned skill.
                                </div>
                            );
                        }
                        return (
                            <>
                                {isCommon && (
                                    <div className="rounded border border-[var(--color-accent-2)]/40 bg-[var(--color-accent-2)]/10 px-2 py-1 text-[var(--color-accent-2)]">
                                        Common skill — every class learns it.
                                    </div>
                                )}
                                {owners.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {owners.map((o) => (
                                            <span
                                                key={o.classId}
                                                className="mono inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-[1px]"
                                                title={`classId ${o.classId}`}
                                            >
                                                <span className="text-[var(--color-text)]">{nameOf(o.classId)}</span>
                                                {o.getLevel > 0 && (
                                                    <span className="text-[var(--color-text-faint)]">
                                                        lv {o.getLevel}
                                                    </span>
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {owners.length > 0 && (
                                    <div className="text-[10px] text-[var(--color-text-faint)]/70">
                                        Subclasses inherit it too — use the grid's class filter for the full list.
                                    </div>
                                )}
                            </>
                        );
                    })()
                )}
            </div>
        </Section>
    );
}

export function LintBanner({ skill }: { skill: Skill }) {
    const { chronicle } = useSettings();
    const chronicleOrdinal = chronicle?.ordinal ?? null;
    const issues = useMemo(
        () => lintSkill(skill, { chronicleOrdinal }),
        [skill, chronicleOrdinal]
    );
    const hasError = issues.some((i) => i.level === "error");
    const [open, setOpen] = useState(hasError);
    if (issues.length === 0) return null;
    const boxCls = hasError
        ? "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10"
        : "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10";
    const headCls = hasError ? "text-[var(--color-danger)]" : "text-[var(--color-warning)]";
    return (
        <div className={`border-b px-4 py-1.5 ${boxCls}`}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`flex items-center gap-1.5 text-[11px] font-medium ${headCls}`}
            >
                {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
                <AlertTriangle size={12} aria-hidden />
                <span>
                    {issues.length} issue{issues.length === 1 ? "" : "s"}
                </span>
            </button>
            {open && (
                <ul className="mt-1 space-y-0.5 pl-5 text-[11px] text-[var(--color-text-faint)]">
                    {issues.map((i, idx) => (
                        <li key={idx}>
                            <span
                                className={`mono ${i.level === "error" ? "text-[var(--color-danger)]" : "text-[var(--color-warning)]"}`}
                            >
                                {i.where}
                            </span>{" "}
                            — {i.msg}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
