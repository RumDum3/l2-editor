import { ArrowRight, X } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ipc } from "../../lib/ipc";
import { logger } from "../../lib/logger";
import { buildUpdatesForSkill } from "../../lib/skillFieldMap";
import { invalidateSkillnameId } from "../../lib/skillNameRowCache";
import { invalidateId } from "../../lib/skillRowCache";
import { useSettings } from "../../state/SettingsContext";
import { BlocksSection } from "./sections/BlocksSection";
import { ClientExtras, ClientText, EnchantVariants } from "./sections/clientPanels";
import { CompareModal } from "./widgets/CompareModal";
import { ConditionsSection } from "./sections/ConditionsSection";
import { EffectsSection } from "./sections/EffectsSection";
import { Section } from "./widgets/fieldPrimitives";
import { FieldsSection } from "./sections/FieldsSection";
import { ClassTreesSection, Header, LintBanner } from "./sections/skillEditorChrome";
import { SkillImplementBanners } from "./sections/SkillImplementBanners";
import {
    addAttachSkill,
    addSkillVariable,
    removeAttachSkillAt,
    removeSkillVariableAt,
    setAttachSkillAt,
    setSkillVariableAt,
    type Skill
} from "./model";

type Props = {
    entity: Skill;
    mutate: (fn: () => void) => void;
    revision: number;
};

export function SkillEditor({ entity: skill, mutate, revision }: Props) {
    const [compareOpen, setCompareOpen] = useState(false);
    const { skillgrp, skillNames, refreshPendingClientEdits, refreshPendingSkillNameEdits } = useSettings();

    const skillgrpReady = skillgrp.kind === "done";
    const skillNameReady = skillNames.kind === "done";

    const lastToLevelRef = useRef<{ id: number; toLevel: number } | null>(null);
    if (lastToLevelRef.current?.id !== skill.id) {
        lastToLevelRef.current = { id: skill.id, toLevel: skill.toLevel };
    }

    const scrollRef = useRef<HTMLDivElement>(null);
    const savedScrollRef = useRef<{ id: number; top: number } | null>(null);
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const saved = savedScrollRef.current;
        el.scrollTop = saved && saved.id === skill.id ? saved.top : 0;
    }, [revision, skill.id]);

    const mutateWithSync = useCallback(
        (fn: () => void) => {
            savedScrollRef.current = { id: skill.id, top: scrollRef.current?.scrollTop ?? 0 };
            const previousToLevel = lastToLevelRef.current?.toLevel ?? skill.toLevel;
            const previousName = skill.name;
            const previousGrpJson = skillgrpReady ? JSON.stringify(buildUpdatesForSkill(skill)) : "";
            mutate(fn);
            const id = skill.id;

            if (skillgrpReady) {
                const updates = buildUpdatesForSkill(skill);
                if (updates.length > 0 && JSON.stringify(updates) !== previousGrpJson) {
                    ipc.applySkillEdits(id, updates)
                        .then(() => {
                            invalidateId(id);
                            refreshPendingClientEdits();
                        })
                        .catch((e) => {
                            logger.warn("skill-sync", "applySkillEdits failed", {
                                skillId: id,
                                message: String(e)
                            });
                        });
                }
            }

            if (skillNameReady && skill.name && (skill.name !== previousName || skill.toLevel !== previousToLevel)) {
                const toLevel = Math.max(1, skill.toLevel | 0);
                const updates: { level: number; sublevel: number; fields: Record<string, string> }[] = [];
                for (let lvl = 1; lvl <= toLevel; lvl++) {
                    updates.push({ level: lvl, sublevel: 0, fields: { name: skill.name } });
                }
                ipc.applySkillNameEdits(id, updates)
                    .then(() => {
                        invalidateSkillnameId(id);
                        refreshPendingSkillNameEdits();
                    })
                    .catch((e) => {
                        logger.warn("skillname-sync", "applySkillNameEdits failed", {
                            skillId: id,
                            message: String(e)
                        });
                    });
            }

            if ((skillgrpReady || skillNameReady) && skill.toLevel !== previousToLevel) {
                lastToLevelRef.current = { id, toLevel: skill.toLevel };
                ipc.setSkillToLevel(id, skill.toLevel)
                    .then((res) => {
                        if (res.skillgrpDelta !== 0) {
                            invalidateId(id);
                        }
                        if (res.skillnameDelta !== 0) {
                            invalidateSkillnameId(id);
                        }
                        if (res.skillgrpDelta !== 0 || res.skillnameDelta !== 0) {
                            logger.info(
                                "skill-sync",
                                `toLevel ${previousToLevel}→${skill.toLevel}: skillgrp ${res.skillgrpDelta >= 0 ? "+" : ""}${res.skillgrpDelta}, skillname ${res.skillnameDelta >= 0 ? "+" : ""}${res.skillnameDelta}`
                            );
                        }
                        refreshPendingClientEdits();
                        refreshPendingSkillNameEdits();
                    })
                    .catch((e) => {
                        logger.warn("skill-sync", "setSkillToLevel failed", {
                            skillId: id,
                            message: String(e)
                        });
                    });
            }
        },
        [mutate, skill, skillgrpReady, skillNameReady, refreshPendingClientEdits, refreshPendingSkillNameEdits]
    );

    return (
        <div ref={scrollRef} className="flex h-full flex-col overflow-y-auto">
            <Header
                skill={skill}
                mutate={mutateWithSync}
                onCompare={() => setCompareOpen(true)}
                key={`h:${revision}:${skill.id}`}
            />
            <LintBanner skill={skill} key={`l:${revision}:${skill.id}`} />
            <SkillImplementBanners skill={skill} key={`i:${revision}:${skill.id}`} />
            <ClientText skill={skill} />
            <ClassTreesSection skill={skill} />
            <EnchantVariants skill={skill} key={`e:${revision}:${skill.id}`} />
            <FieldsSection skill={skill} mutate={mutateWithSync} key={`f:${skill.id}`} />
            <VariablesSection skill={skill} mutate={mutateWithSync} />
            <ConditionsSection skill={skill} mutate={mutateWithSync} />
            <EffectsSection skill={skill} mutate={mutateWithSync} key={`eff:${revision}:${skill.id}`} />
            <AttachSkillsSection skill={skill} mutate={mutateWithSync} />
            <ClientExtras skill={skill} key={`x:${skill.id}`} />
            <BlocksSection skill={skill} key={`b:${revision}:${skill.id}`} />
            <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} base={skill} />
        </div>
    );
}

function VariablesSection({ skill, mutate }: { skill: Skill; mutate: (fn: () => void) => void }) {
    return (
        <Section title="Variables">
            <div className="space-y-1.5 px-3 py-2">
                {skill.variables.length === 0 && (
                    <div className="text-[11px] text-[var(--color-text-faint)]">
                        Named values referenced in effect formulas as <span className="mono">{"{name}"}</span>.
                    </div>
                )}
                {skill.variables.map((v, i) => (
                    <div key={`v${i}:${v.name}`} className="flex items-center gap-2">
                        <input
                            className="mono w-40 shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                            defaultValue={v.name}
                            onBlur={(e) => {
                                if (e.target.value !== v.name)
                                    mutate(() => setSkillVariableAt(skill, i, e.target.value, v.val));
                            }}
                        />
                        <span className="text-[var(--color-text-faint)]">=</span>
                        <input
                            className="mono flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]"
                            defaultValue={v.val}
                            onBlur={(e) => {
                                if (e.target.value !== v.val)
                                    mutate(() => setSkillVariableAt(skill, i, v.name, e.target.value));
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => mutate(() => removeSkillVariableAt(skill, i))}
                            title={`Remove ${v.name}`}
                            aria-label={`Remove ${v.name}`}
                            className="text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                        >
                            <X size={13} aria-hidden />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => mutate(() => addSkillVariable(skill))}
                    className="text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                >
                    + add variable
                </button>
            </div>
        </Section>
    );
}

const ATTACH_INPUT =
    "mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[12px] outline-none focus:border-[var(--color-accent-2)]";

function AttachSkillsSection({ skill, mutate }: { skill: Skill; mutate: (fn: () => void) => void }) {
    return (
        <Section storageKey="attach-skills" title="Attached skills">
            <div className="space-y-1.5 px-3 py-2">
                {skill.attachSkills.length === 0 && (
                    <div className="text-[11px] text-[var(--color-text-faint)]">
                        Conditional swaps — if the caster also knows the <span className="mono">required</span> skill,
                        this skill resolves to the mapped one instead. Leave a level box blank for 1.
                    </div>
                )}
                {skill.attachSkills.map((r, i) => (
                    <div
                        key={`as${i}`}
                        className="flex flex-wrap items-center gap-1.5 rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)] px-2 py-1"
                    >
                        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                            if has
                        </span>
                        <input
                            className={`${ATTACH_INPUT} w-20`}
                            defaultValue={r.requiredSkillId}
                            placeholder="skillId"
                            onBlur={(e) => {
                                if (e.target.value !== r.requiredSkillId)
                                    mutate(() => setAttachSkillAt(skill, i, "requiredSkillId", e.target.value));
                            }}
                        />
                        <span className="text-[10px] text-[var(--color-text-faint)]">lv</span>
                        <input
                            className={`${ATTACH_INPUT} w-12`}
                            defaultValue={r.requiredSkillLevel}
                            placeholder="1"
                            onBlur={(e) => {
                                if (e.target.value !== r.requiredSkillLevel)
                                    mutate(() => setAttachSkillAt(skill, i, "requiredSkillLevel", e.target.value));
                            }}
                        />
                        <ArrowRight size={12} className="mx-0.5 text-[var(--color-text-faint)]" aria-hidden />
                        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)]">
                            cast
                        </span>
                        <input
                            className={`${ATTACH_INPUT} w-20`}
                            defaultValue={r.skillId}
                            placeholder="skillId"
                            onBlur={(e) => {
                                if (e.target.value !== r.skillId)
                                    mutate(() => setAttachSkillAt(skill, i, "skillId", e.target.value));
                            }}
                        />
                        <span className="text-[10px] text-[var(--color-text-faint)]">lv</span>
                        <input
                            className={`${ATTACH_INPUT} w-12`}
                            defaultValue={r.skillLevel}
                            placeholder="1"
                            onBlur={(e) => {
                                if (e.target.value !== r.skillLevel)
                                    mutate(() => setAttachSkillAt(skill, i, "skillLevel", e.target.value));
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => mutate(() => removeAttachSkillAt(skill, i))}
                            title="Remove this row"
                            aria-label="Remove this row"
                            className="ml-auto text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
                        >
                            <X size={13} aria-hidden />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => mutate(() => addAttachSkill(skill))}
                    className="text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-accent-2)]"
                >
                    + add attached skill
                </button>
            </div>
        </Section>
    );
}
