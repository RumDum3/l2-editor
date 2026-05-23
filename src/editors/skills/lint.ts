import { widgetFor } from "./data/enums";
import { isBoolField } from "./data/fieldCatalog";
import { CONDITION_HANDLERS, EFFECT_HANDLERS } from "./data/handlers";
import type { FieldValue, Skill } from "./model";

export type LintLevel = "error" | "warn";
export type LintIssue = { level: LintLevel; where: string; msg: string };

function perLevelLevels(v: FieldValue): number[] {
    if (v.kind === "single") return [];
    const base = v.kind === "perLevel" ? v.values : v.base;
    return [...base.keys()];
}

export function lintSkill(skill: Skill): LintIssue[] {
    const out: LintIssue[] = [];
    const has = (tag: string) => skill.fields.some((f) => f.tag === tag);

    if (!has("operateType")) {
        out.push({
            level: "error",
            where: "operateType",
            msg: "Missing — the server requires <operateType> (A1/A2/P/T/…); the skill won't load without it."
        });
    }

    for (const f of skill.fields) {
        if (f.value.kind !== "single") {
            const lvls = perLevelLevels(f.value).sort((a, b) => a - b);
            if (lvls.length > 0) {
                const max = lvls[lvls.length - 1];
                if (skill.toLevel > 0 && max > skill.toLevel) {
                    out.push({
                        level: "warn",
                        where: f.tag,
                        msg: `Has a value for level ${max} but toLevel is ${skill.toLevel} — that entry is never used.`
                    });
                }
                if (lvls[0] > 1) {
                    out.push({
                        level: "warn",
                        where: f.tag,
                        msg: `Lowest per-level entry is level ${lvls[0]} — levels 1..${lvls[0] - 1} fall back to the field default.`
                    });
                }
            }
        } else {
            const w = widgetFor(f.tag);
            if (w?.kind === "select" && f.value.value && !w.choices.includes(f.value.value)) {
                out.push({
                    level: "warn",
                    where: f.tag,
                    msg: `Value "${f.value.value}" isn't a recognized ${f.tag} value (kept verbatim — fine if your server build added it).`
                });
            }
            if (isBoolField(f.tag) && f.value.value !== "true" && f.value.value !== "false") {
                out.push({
                    level: "warn",
                    where: f.tag,
                    msg: `Boolean field has value "${f.value.value}" — expected "true" or "false".`
                });
            }
        }
    }

    const isDebuff = skill.fields.some(
        (f) => f.tag === "isDebuff" && f.value.kind === "single" && f.value.value === "true"
    );
    const epField = skill.fields.find((f) => f.tag === "effectPoint");
    if (isDebuff && epField?.value.kind === "single") {
        const ep = Number(epField.value.value);
        if (Number.isFinite(ep) && ep >= 0) {
            out.push({
                level: "warn",
                where: "effectPoint",
                msg: "isDebuff is true but effectPoint is ≥ 0 — NPC AI reads positive effectPoint as a beneficial skill."
            });
        }
    }

    const knownEffects = new Set(EFFECT_HANDLERS);
    const knownConditions = new Set(CONDITION_HANDLERS);
    for (const g of skill.effectGroups) {
        for (const it of g.items) {
            if (it.handler && !knownEffects.has(it.handler)) {
                out.push({
                    level: "warn",
                    where: `${g.scope} / ${it.handler}`,
                    msg: `"${it.handler}" isn't a recognized effect handler (written verbatim — fine if your server build added it).`
                });
            }
        }
    }
    for (const g of skill.conditionGroups) {
        for (const leaf of g.leaves) {
            if (leaf.kind !== "handler") continue;
            const h = leaf.item.handler;
            if (h && !knownConditions.has(h)) {
                out.push({
                    level: "warn",
                    where: `${g.scope} / ${h}`,
                    msg: `"${h}" isn't a recognized condition handler.`
                });
            }
        }
    }

    return out;
}
