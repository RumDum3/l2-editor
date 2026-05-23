import { Section } from "../widgets/fieldPrimitives";
import type { Skill } from "../model";

export function BlocksSection({ skill }: { skill: Skill }) {
    return (
        <Section storageKey="raw-xml" title="Raw XML">
            <div className="px-3 py-2">
                <SkillSource el={skill.el} />
            </div>
        </Section>
    );
}

function SkillSource({ el }: { el: Element }) {
    const xml = new XMLSerializer().serializeToString(el);
    return (
        <pre className="mono whitespace-pre-wrap rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)] p-2 text-[11px] leading-relaxed text-[var(--color-text)]">
            {xml}
        </pre>
    );
}
