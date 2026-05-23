import { ipc } from "../../lib/ipc";
import { invalidateSkillnameId } from "../../lib/skillNameRowCache";
import { invalidateId } from "../../lib/skillRowCache";
import { buildUpdatesForSkill } from "../../lib/skillFieldMap";
import type { EditorPlugin } from "../types";
import { type Skill, parseSkill, parseSkillList } from "./model";
import { SkillCard } from "./widgets/SkillCard";
import { SkillEditor } from "./SkillEditor";

export const skillsPlugin: EditorPlugin<Skill> = {
    id: "skills",
    label: "Skills",
    dataPath: "stats/skills",
    recursive: true,

    matches(doc) {
        const root = doc.documentElement;
        if (!root || root.tagName !== "list") return false;
        return Array.from(root.children).some((c) => c.tagName === "skill");
    },

    parse(doc) {
        return parseSkillList(doc);
    },

    parseEntity(el) {
        return parseSkill(el);
    },

    async afterEntityRestored(skill) {
        try {
            const grpUpdates = buildUpdatesForSkill(skill);
            if (grpUpdates.length > 0) {
                await ipc.applySkillEdits(skill.id, grpUpdates);
                invalidateId(skill.id);
            }
        } catch {}
        try {
            if (skill.name) {
                const toLevel = Math.max(1, skill.toLevel | 0);
                const nameUpdates: { level: number; sublevel: number; fields: Record<string, string> }[] = [];
                for (let lvl = 1; lvl <= toLevel; lvl++) {
                    nameUpdates.push({ level: lvl, sublevel: 0, fields: { name: skill.name } });
                }
                await ipc.applySkillNameEdits(skill.id, nameUpdates);
                invalidateSkillnameId(skill.id);
            }
        } catch {}
    },

    elementOf(skill) {
        return skill.el;
    },

    summarize(skill) {
        return { id: skill.id, label: skill.name };
    },

    idAttr: "id",

    newEntity(doc, id) {
        const el = doc.createElement("skill");
        el.setAttribute("id", String(id));
        el.setAttribute("toLevel", "1");
        el.setAttribute("name", "New skill");
        const op = doc.createElement("operateType");
        op.textContent = "A1";
        el.appendChild(op);
        return el;
    },

    Editor: SkillEditor,
    Card: SkillCard
};
