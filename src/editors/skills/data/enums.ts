import { ABNORMAL_TYPE } from "./abnormalType";
import { ABNORMAL_VISUAL_EFFECT } from "./abnormalVisualEffect";

export type FieldWidget =
    | { kind: "select"; choices: readonly string[] }
    | { kind: "combo"; choices: readonly string[] }
    | { kind: "tags"; choices: readonly string[] };

export const SKILL_ENUMS: Record<string, readonly string[]> = {
    operateType: [
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "A6",
        "CA1",
        "CA2",
        "CA5",
        "DA1",
        "DA2",
        "DA3",
        "DA4",
        "DA5",
        "DA6",
        "P",
        "T",
        "TG",
        "AU"
    ],

    targetType: [
        "ADVANCE_BASE",
        "ARTILLERY",
        "DOOR_TREASURE",
        "ENEMY",
        "ENEMY_NOT",
        "ENEMY_ONLY",
        "FORTRESS_FLAGPOLE",
        "GROUND",
        "HOLYTHING",
        "ITEM",
        "NONE",
        "NPC_BODY",
        "OTHERS",
        "PC_BODY",
        "SELF",
        "SUMMON",
        "TARGET",
        "TARGET_OR_SELF",
        "WYVERN_TARGET",
        "MY_MENTOR",
        "MY_PARTY",
        "OWNER_PET",
        "RECALL_CREATURE"
    ],

    affectScope: [
        "VALAKAS_SCOPE",
        "DEAD_PLEDGE",
        "DEAD_UNION",
        "FAN",
        "FAN_PB",
        "NONE",
        "PARTY",
        "DEAD_PARTY",
        "PARTY_PLEDGE",
        "DEAD_PARTY_PLEDGE",
        "PLEDGE",
        "POINT_BLANK",
        "RANGE",
        "RANGE_SORT_BY_HP",
        "RING_RANGE",
        "SINGLE",
        "SQUARE",
        "SQUARE_PB",
        "STATIC_OBJECT_SCOPE",
        "SUMMON_EXCEPT_MASTER",
        "WYVERN_SCOPE"
    ],

    affectObject: [
        "ALL",
        "CLAN",
        "FRIEND",
        "FRIEND_PC",
        "HIDDEN_PLACE",
        "INVISIBLE",
        "NOE",
        "NOT_FRIEND",
        "NOT_FRIEND_PC",
        "OBJECT_DEAD_NPC_BODY",
        "UNDEAD_REAL_ENEMY",
        "WYVERN_OBJECT"
    ],

    nextAction: ["NONE", "ATTACK", "CAST"],

    basicProperty: ["NONE", "PHYSICAL", "MAGIC"],

    isMagic: ["0", "1", "2", "3"],

    attributeType: ["NONE", "FIRE", "WATER", "WIND", "EARTH", "HOLY", "DARK"],

    trait: [
        "NONE",
        "SWORD",
        "BLUNT",
        "DAGGER",
        "POLE",
        "FIST",
        "BOW",
        "ETC",
        "UNK_8",
        "POISON",
        "HOLD",
        "BLEED",
        "SLEEP",
        "SHOCK",
        "DERANGEMENT",
        "BUG_WEAKNESS",
        "ANIMAL_WEAKNESS",
        "PLANT_WEAKNESS",
        "BEAST_WEAKNESS",
        "DRAGON_WEAKNESS",
        "PARALYZE",
        "DUAL",
        "DUALFIST",
        "BOSS",
        "GIANT_WEAKNESS",
        "CONSTRUCT_WEAKNESS",
        "DEATH",
        "VALAKAS",
        "ANESTHESIA",
        "CRITICAL_POISON",
        "ROOT_PHYSICALLY",
        "ROOT_MAGICALLY",
        "RAPIER",
        "CROSSBOW",
        "ANCIENTSWORD",
        "TURN_STONE",
        "GUST",
        "PHYSICAL_BLOCKADE",
        "TARGET",
        "PHYSICAL_WEAKNESS",
        "MAGICAL_WEAKNESS",
        "DUALDAGGER",
        "DEMONIC_WEAKNESS",
        "DIVINE_WEAKNESS",
        "ELEMENTAL_WEAKNESS",
        "FAIRY_WEAKNESS",
        "HUMAN_WEAKNESS",
        "HUMANOID_WEAKNESS",
        "UNDEAD_WEAKNESS",
        "DUALBLUNT",
        "KNOCKBACK",
        "KNOCKDOWN",
        "PULL",
        "HATE",
        "AGGRESSION",
        "AIRBIND",
        "DISARM",
        "DEPORT",
        "CHANGEBODY",
        "TWOHANDCROSSBOW",
        "ZONE",
        "PSYCHIC",
        "EMBRYO_WEAKNESS",
        "SPIRIT_WEAKNESS"
    ]
};

export function widgetFor(tag: string): FieldWidget | null {
    const small = SKILL_ENUMS[tag];
    if (small) return { kind: "select", choices: small };
    if (tag === "abnormalType" || tag === "subordinationAbnormalType") {
        return { kind: "combo", choices: ABNORMAL_TYPE };
    }
    if (tag === "abnormalVisualEffect") {
        return { kind: "tags", choices: ABNORMAL_VISUAL_EFFECT };
    }
    if (tag === "abnormalResists") {
        return { kind: "tags", choices: ABNORMAL_TYPE };
    }
    return null;
}

export const ENUM_LABELS: Record<string, Record<string, string>> = {
    operateType: {
        A1: "A1 — active, instant effect",
        A2: "A2 — active, continuous + instant effect",
        A3: "A3 — active, instant + continuous (incl. self)",
        A4: "A4 — active, instant effect (event herb)",
        A5: "A5 — active aura",
        A6: "A6 — active, synergy",
        CA1: "CA1 — channeled, instant effect per tick",
        CA2: "CA2 — channeled (variant)",
        CA5: "CA5 — channeled, continuous effect per tick",
        DA1: "DA1 — directional, charge/rush (instant)",
        DA2: "DA2 — directional, charge/rush (continuous)",
        DA3: "DA3 — directional, blink",
        DA4: "DA4 — directional, left (continuous)",
        DA5: "DA5 — directional, right (continuous)",
        DA6: "DA6 — directional, charge to cast range",
        P: "P — passive",
        T: "T — toggle",
        TG: "TG — toggle (group)",
        AU: "AU — aura"
    },

    targetType: {
        ADVANCE_BASE: "Advance base / outpost",
        ARTILLERY: "Headquarters artillery",
        DOOR_TREASURE: "Door / treasure chest",
        ENEMY: "Enemy (incl. flagged allies)",
        ENEMY_NOT: "Anything but a valid enemy",
        ENEMY_ONLY: "Enemy — players only (no monsters)",
        FORTRESS_FLAGPOLE: "Fortress flagpole",
        GROUND: "Ground position",
        HOLYTHING: "Holy artifact (siege)",
        ITEM: "Inventory item",
        NONE: "No target",
        NPC_BODY: "NPC corpse",
        OTHERS: "Anyone but the caster",
        PC_BODY: "Player corpse",
        SELF: "Self",
        SUMMON: "Own summon / pet",
        TARGET: "Current target (no validation)",
        TARGET_OR_SELF: "Current target, else self",
        WYVERN_TARGET: "Wyvern",
        MY_MENTOR: "Mentor / mentee",
        MY_PARTY: "Self + party",
        OWNER_PET: "Pet's owner",
        RECALL_CREATURE: "Recall destination"
    },

    affectScope: {
        SINGLE: "Just the target",
        NONE: "Just the target",
        RANGE: "Around the target",
        RANGE_SORT_BY_HP: "Around the target (lowest HP first)",
        POINT_BLANK: "Around the caster",
        RING_RANGE: "Ring around the target (min..max)",
        FAN: "Cone (caster's facing)",
        FAN_PB: "Cone (point-blank)",
        SQUARE: "Rectangle (from target)",
        SQUARE_PB: "Rectangle (from caster)",
        PARTY: "Target's party",
        PARTY_PLEDGE: "Target's party + clan",
        PLEDGE: "Target's clan",
        DEAD_PLEDGE: "Dead clan members in range",
        DEAD_PARTY: "Dead party members in range",
        DEAD_PARTY_PLEDGE: "Dead party + clan in range",
        DEAD_UNION: "Dead alliance members in range",
        SUMMON_EXCEPT_MASTER: "All summons except the caster",
        STATIC_OBJECT_SCOPE: "Static world objects",
        VALAKAS_SCOPE: "Valakas area",
        WYVERN_SCOPE: "Wyvern area"
    },

    affectObject: {
        ALL: "Everyone (no filter)",
        FRIEND: "Allies",
        FRIEND_PC: "Allied players",
        NOT_FRIEND: "Non-allies",
        NOT_FRIEND_PC: "Non-allied players",
        CLAN: "Clan members",
        INVISIBLE: "Includes invisible targets",
        HIDDEN_PLACE: "Targets in hidden zones",
        UNDEAD_REAL_ENEMY: "Undead enemies only",
        OBJECT_DEAD_NPC_BODY: "Dead NPC corpses",
        WYVERN_OBJECT: "Wyvern objects",
        NOE: "Alliance carve-out (NOE)"
    },

    basicProperty: {
        NONE: "None",
        PHYSICAL: "Physical (resisted by STR/CON)",
        MAGIC: "Magic (resisted by MEN)"
    },

    nextAction: {
        NONE: "Idle after cast",
        ATTACK: "Auto-attack the target",
        CAST: "Re-cast (chain)"
    },

    attributeType: {
        NONE: "Non-elemental",
        FIRE: "Fire",
        WATER: "Water",
        WIND: "Wind",
        EARTH: "Earth",
        HOLY: "Holy",
        DARK: "Dark"
    },

    isMagic: {
        "0": "0 — physical",
        "1": "1 — magic",
        "2": "2 — static (not interruptible, ignores cooldown/cast-speed stats)",
        "3": "3 — dance / song"
    }
};

export function humanizeEnumValue(value: string): string {
    const spaced = value.replace(/_/g, " ").toLowerCase().trim();
    return spaced.length === 0 ? value : spaced[0].toUpperCase() + spaced.slice(1);
}

export function labelFor(tag: string, value: string): string {
    return ENUM_LABELS[tag]?.[value] ?? humanizeEnumValue(value);
}
