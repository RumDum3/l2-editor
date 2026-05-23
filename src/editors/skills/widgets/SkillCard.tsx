import { AlertTriangle } from "lucide-react";
import { TextureImage } from "../../../components/TextureImage";
import { findMismatches } from "../../../lib/skillFieldMap";
import { pickCanonicalSkillname, useSkillnameRows } from "../../../lib/skillNameRowCache";
import { useSkillRows } from "../../../lib/skillRowCache";
import { formatSkillText } from "../../../lib/skillText";
import { useSettings } from "../../../state/SettingsContext";
import type { Skill } from "../model";

type Props = {
    entity: Skill;
    onSelect: () => void;
};

export function SkillCard({ entity: skill, onSelect }: Props) {
    const { skillNames, skillgrp } = useSettings();
    const rows = useSkillRows(skillgrp.kind === "done" ? skill.id : null);
    const mismatchCount = rows ? findMismatches(skill, rows).length : 0;
    const operateType = readField(skill, "operateType");
    const targetType = readField(skill, "targetType");
    const iconRef = readField(skill, "icon");

    const skillnameRows = useSkillnameRows(skillNames.kind === "done" ? skill.id : null);
    let clientDesc = "";
    let clientName = "";
    if (skillnameRows) {
        const entry = pickCanonicalSkillname(skillnameRows);
        if (entry) {
            clientDesc = formatSkillText(entry.desc ?? "", entry.desc_param ?? "", "inline");
            if (entry.name && entry.name !== skill.name) clientName = entry.name;
        }
    }

    return (
        <button
            type="button"
            onClick={onSelect}
            className="group flex h-44 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition hover:border-[var(--color-accent-2)] hover:bg-[var(--color-surface-2)] focus:border-[var(--color-accent-2)] focus:outline-none"
        >
            <div className="flex items-start gap-3">
                <TextureImage file={iconRef} size={40} />
                <div className="min-w-0 flex-1">
                    <div className="mono flex items-center gap-1.5 text-[10px] text-[var(--color-text-faint)]">
                        <span>#{String(skill.id).padStart(5, "0")}</span>
                        {mismatchCount > 0 && <MismatchBadge count={mismatchCount} />}
                    </div>
                    <div className="truncate text-[13px] font-semibold text-[var(--color-text)]" title={skill.name}>
                        {skill.name || <span className="text-[var(--color-text-faint)]">(no name)</span>}
                    </div>
                    {clientName && (
                        <div className="truncate text-[10px] text-[var(--color-accent)]" title={clientName}>
                            {clientName}
                        </div>
                    )}
                </div>
            </div>

            {clientDesc && (
                <p
                    className="mt-2 line-clamp-3 text-[10px] leading-snug text-[var(--color-text-faint)]"
                    title={clientDesc}
                >
                    {clientDesc}
                </p>
            )}

            <div className="mono mt-auto flex items-center gap-2 text-[10px] text-[var(--color-text-faint)]">
                <Tag>{skill.toLevel} lvls</Tag>
                {operateType && <Tag>{operateType}</Tag>}
                {targetType && <Tag>{targetType}</Tag>}
            </div>
        </button>
    );
}

function readField(skill: Skill, tag: string): string {
    const f = skill.fields.find((x) => x.tag === tag);
    if (!f) return "";
    if (f.value.kind === "single") return f.value.value;
    const map = f.value.kind === "perLevel" ? f.value.values : f.value.base;
    return map.get(1) ?? "";
}

function Tag({ children }: { children: React.ReactNode }) {
    return (
        <span className="rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)] px-1.5 py-[1px]">
            {children}
        </span>
    );
}

export function MismatchBadge({ count }: { count: number }) {
    return (
        <span
            className="inline-flex items-center gap-0.5 rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-1 py-[1px] text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--color-warning)]"
            title={`${count} field${count === 1 ? "" : "s"} on the client differ from server XML — open the skill and use “push” on each, then Save`}
        >
            <AlertTriangle size={10} aria-hidden />
            <span>{count}</span>
        </span>
    );
}
