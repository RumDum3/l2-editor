export type SkillSectionId =
    | "type"
    | "targeting"
    | "costs"
    | "timing"
    | "landRate"
    | "buff"
    | "element"
    | "flags"
    | "ai"
    | "channeling"
    | "linked"
    | "display"
    | "other";

export const SKILL_SECTIONS: readonly { id: SkillSectionId; title: string }[] = [
    { id: "type", title: "Type" },
    { id: "targeting", title: "Targeting & area" },
    { id: "costs", title: "Costs" },
    { id: "timing", title: "Timing & reuse" },
    { id: "landRate", title: "Land rate & power" },
    { id: "buff", title: "Buff / abnormal" },
    { id: "element", title: "Element" },
    { id: "flags", title: "Behavior flags" },
    { id: "ai", title: "NPC AI" },
    { id: "channeling", title: "Channeling" },
    { id: "linked", title: "Linked skills & toggle groups" },
    { id: "display", title: "Display" },
    { id: "other", title: "Other" }
];

export type SkillFieldType = "int" | "float" | "bool" | "string" | "enum";

export type CatalogEntry = {
    name: string;
    section: SkillSectionId;
    type: SkillFieldType;
    default: string;
};

const CATALOG: readonly CatalogEntry[] = [
    { name: "operateType", section: "type", type: "enum", default: "A1" },
    { name: "isMagic", section: "type", type: "enum", default: "0" },
    { name: "trait", section: "type", type: "enum", default: "NONE" },
    { name: "abnormalType", section: "type", type: "enum", default: "NONE" },
    { name: "subordinationAbnormalType", section: "type", type: "enum", default: "NONE" },

    { name: "targetType", section: "targeting", type: "enum", default: "SELF" },
    { name: "affectScope", section: "targeting", type: "enum", default: "SINGLE" },
    { name: "affectObject", section: "targeting", type: "enum", default: "ALL" },
    { name: "affectRange", section: "targeting", type: "int", default: "0" },
    { name: "affectLimit", section: "targeting", type: "string", default: "" },
    { name: "affectHeight", section: "targeting", type: "string", default: "" },
    { name: "fanRange", section: "targeting", type: "string", default: "" },
    { name: "castRange", section: "targeting", type: "int", default: "-1" },
    { name: "effectRange", section: "targeting", type: "int", default: "-1" },

    { name: "mpConsume", section: "costs", type: "int", default: "0" },
    { name: "mpInitialConsume", section: "costs", type: "int", default: "0" },
    { name: "mpPerChanneling", section: "costs", type: "int", default: "0" },
    { name: "hpConsume", section: "costs", type: "int", default: "0" },
    { name: "itemConsumeId", section: "costs", type: "int", default: "0" },
    { name: "itemConsumeCount", section: "costs", type: "int", default: "0" },
    { name: "famePointConsume", section: "costs", type: "int", default: "0" },
    { name: "clanRepConsume", section: "costs", type: "int", default: "0" },
    { name: "soulMaxConsumeCount", section: "costs", type: "int", default: "0" },
    { name: "chargeConsume", section: "costs", type: "int", default: "0" },
    { name: "minPledgeClass", section: "costs", type: "int", default: "0" },

    { name: "hitTime", section: "timing", type: "int", default: "0" },
    { name: "hitCancelTime", section: "timing", type: "float", default: "0" },
    { name: "coolTime", section: "timing", type: "int", default: "0" },
    { name: "reuseDelay", section: "timing", type: "int", default: "0" },
    { name: "reuseDelayGroup", section: "timing", type: "int", default: "-1" },
    { name: "staticReuse", section: "timing", type: "bool", default: "false" },

    { name: "magicLevel", section: "landRate", type: "int", default: "0" },
    { name: "lvlBonusRate", section: "landRate", type: "int", default: "0" },
    { name: "activateRate", section: "landRate", type: "int", default: "-1" },
    { name: "minChance", section: "landRate", type: "int", default: "10" },
    { name: "maxChance", section: "landRate", type: "int", default: "90" },
    { name: "magicCriticalRate", section: "landRate", type: "float", default: "0" },

    { name: "abnormalLevel", section: "buff", type: "int", default: "0" },
    { name: "abnormalTime", section: "buff", type: "int", default: "0" },
    { name: "abnormalVisualEffect", section: "buff", type: "enum", default: "" },
    { name: "abnormalResists", section: "buff", type: "string", default: "" },
    { name: "abnormalInstant", section: "buff", type: "bool", default: "false" },
    { name: "stayAfterDeath", section: "buff", type: "bool", default: "false" },
    { name: "canBeDispelled", section: "buff", type: "bool", default: "true" },
    { name: "deleteAbnormalOnLeave", section: "buff", type: "bool", default: "false" },
    { name: "irreplaceableBuff", section: "buff", type: "bool", default: "false" },

    { name: "attributeType", section: "element", type: "enum", default: "NONE" },
    { name: "attributeValue", section: "element", type: "int", default: "0" },
    { name: "basicProperty", section: "element", type: "enum", default: "NONE" },

    { name: "isDebuff", section: "flags", type: "bool", default: "false" },
    { name: "blockedInOlympiad", section: "flags", type: "bool", default: "false" },
    { name: "removedOnAnyActionExceptMove", section: "flags", type: "bool", default: "false" },
    { name: "removedOnDamage", section: "flags", type: "bool", default: "false" },
    { name: "removedOnUnequipWeapon", section: "flags", type: "bool", default: "false" },
    { name: "excludedFromCheck", section: "flags", type: "bool", default: "false" },
    { name: "withoutAction", section: "flags", type: "bool", default: "false" },
    { name: "blockActionUseSkill", section: "flags", type: "bool", default: "false" },
    { name: "isNecessaryToggle", section: "flags", type: "bool", default: "false" },
    { name: "canDoubleCast", section: "flags", type: "bool", default: "false" },
    { name: "canCastWhileDisabled", section: "flags", type: "bool", default: "false" },
    { name: "isSharedWithSummon", section: "flags", type: "bool", default: "true" },
    { name: "isSuicideAttack", section: "flags", type: "bool", default: "false" },
    { name: "isRecoveryHerb", section: "flags", type: "bool", default: "false" },
    { name: "isMentoring", section: "flags", type: "bool", default: "false" },
    { name: "isTriggeredSkill", section: "flags", type: "bool", default: "false" },
    { name: "isHidingMessages", section: "flags", type: "bool", default: "false" },

    { name: "effectPoint", section: "ai", type: "int", default: "0" },
    { name: "nextAction", section: "ai", type: "enum", default: "NONE" },

    { name: "channelingSkillId", section: "channeling", type: "int", default: "0" },
    { name: "channelingTickInterval", section: "channeling", type: "float", default: "2" },
    { name: "channelingStart", section: "channeling", type: "float", default: "0" },

    { name: "toggleGroupId", section: "linked", type: "int", default: "-1" },
    { name: "attachToggleGroupId", section: "linked", type: "int", default: "-1" },
    { name: "doubleCastSkill", section: "linked", type: "int", default: "0" },
    { name: "alternateRangedSkillId", section: "linked", type: "int", default: "0" },
    { name: "alternateMeleeSkillId", section: "linked", type: "int", default: "0" },
    { name: "alternateEnemySkillId", section: "linked", type: "int", default: "0" },
    { name: "alternateAllySkillId", section: "linked", type: "int", default: "0" },

    { name: "icon", section: "display", type: "string", default: "icon.skill0000" },
    { name: "displayInList", section: "display", type: "bool", default: "true" }
];

const BY_NAME = new Map(CATALOG.map((e) => [e.name, e]));
const ORDER = new Map(CATALOG.map((e, i) => [e.name, i]));

export function catalogEntry(name: string): CatalogEntry | null {
    return BY_NAME.get(name) ?? null;
}

export function sectionOf(name: string): SkillSectionId {
    return BY_NAME.get(name)?.section ?? "other";
}

export function fieldOrder(name: string): number {
    return ORDER.get(name) ?? Number.MAX_SAFE_INTEGER;
}

export function sectionTitle(id: SkillSectionId): string {
    return SKILL_SECTIONS.find((s) => s.id === id)?.title ?? id;
}

export function isBoolField(name: string): boolean {
    return BY_NAME.get(name)?.type === "bool";
}

export function catalogBySection(): { id: SkillSectionId; title: string; entries: CatalogEntry[] }[] {
    return SKILL_SECTIONS.filter((s) => s.id !== "other")
        .map((s) => ({ id: s.id, title: s.title, entries: CATALOG.filter((e) => e.section === s.id) }))
        .filter((g) => g.entries.length > 0);
}
