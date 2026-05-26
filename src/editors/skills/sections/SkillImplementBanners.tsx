import { useSkillnameRows } from "../../../lib/skillNameRowCache";
import { useSkillRows } from "../../../lib/skillRowCache";
import { useSettings } from "../../../state/SettingsContext";
import { SkillgrpImplementBanner, SkillnameImplementBanner } from "./SkillImplementBanner";
import type { Skill } from "../model";

export function SkillImplementBanners({ skill }: { skill: Skill }) {
    const { skillgrp, skillNames } = useSettings();
    const grpReady = skillgrp.kind === "done";
    const nameReady = skillNames.kind === "done";
    const grpRows = useSkillRows(grpReady ? skill.id : null);
    const nameRows = useSkillnameRows(nameReady ? skill.id : null);
    const missingGrp = grpReady && grpRows !== undefined && (grpRows === null || grpRows.length === 0);
    const missingName = nameReady && nameRows !== undefined && (nameRows === null || nameRows.length === 0);
    if (!missingGrp && !missingName) return null;
    return (
        <>
            {missingGrp && <SkillgrpImplementBanner skill={skill} />}
            {missingName && <SkillnameImplementBanner skill={skill} />}
        </>
    );
}
