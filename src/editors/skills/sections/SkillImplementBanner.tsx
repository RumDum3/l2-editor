import { ipc } from "../../../lib/ipc";
import { logger } from "../../../lib/logger";
import { invalidateSkillnameId } from "../../../lib/skillNameRowCache";
import { invalidateId as invalidateSkillId } from "../../../lib/skillRowCache";
import { useSettings } from "../../../state/SettingsContext";
import { ImplementBanner } from "../../../components/ImplementBanner";
import type { Skill } from "../model";

export function SkillgrpImplementBanner({ skill }: { skill: Skill }) {
    const { refreshPendingClientEdits } = useSettings();
    const run = async () => {
        try {
            const toLevel = Math.max(1, skill.toLevel | 0);
            let added = 0;
            for (let lvl = 1; lvl <= toLevel; lvl++) {
                const rid = await ipc.addSkillRow(skill.id, lvl);
                if (rid == null) {
                    if (added === 0) {
                        return {
                            ok: false,
                            error: "Skillgrp.dat has no template row to clone from."
                        };
                    }
                    break;
                }
                added += 1;
            }
            invalidateSkillId(skill.id);
            refreshPendingClientEdits();
            logger.info("skill-implement", `queued ${added} skillgrp row(s) for #${skill.id}`);
            return { ok: true };
        } catch (e) {
            logger.warn("skill-implement", `skillgrp failed`, { id: skill.id, err: String(e) });
            return { ok: false, error: String(e) };
        }
    };
    return (
        <div className="px-4 pt-3">
            <ImplementBanner
                label="Not present in Skillgrp.dat — this skill has no client-side rows."
                note={`will add levels 1–${Math.max(1, skill.toLevel | 0)}`}
                onImplement={run}
            />
        </div>
    );
}

export function SkillnameImplementBanner({ skill }: { skill: Skill }) {
    const { refreshPendingSkillNameEdits } = useSettings();
    const run = async () => {
        try {
            const toLevel = Math.max(1, skill.toLevel | 0);
            const name = skill.name ?? "";
            let added = 0;
            for (let lvl = 1; lvl <= toLevel; lvl++) {
                const rid = await ipc.addSkillnameRow(skill.id, lvl, name);
                if (rid == null) {
                    if (added === 0) {
                        return {
                            ok: false,
                            error: "SkillName.dat has no template row to clone from."
                        };
                    }
                    break;
                }
                added += 1;
            }
            invalidateSkillnameId(skill.id);
            refreshPendingSkillNameEdits();
            logger.info("skill-implement", `queued ${added} skillname row(s) for #${skill.id}`);
            return { ok: true };
        } catch (e) {
            logger.warn("skill-implement", `skillname failed`, { id: skill.id, err: String(e) });
            return { ok: false, error: String(e) };
        }
    };
    return (
        <div className="px-4 pt-3">
            <ImplementBanner
                label="Not present in SkillName.dat — this skill has no client name/description rows."
                note={`will add name "${skill.name ?? ""}" for levels 1–${Math.max(1, skill.toLevel | 0)}`}
                onImplement={run}
            />
        </div>
    );
}
