import { SKILL_ENUMS } from "./enums";

export type ParamType = "int" | "float" | "bool" | "string" | "enum";

export type ParamSpec = {
    name: string;
    type: ParamType;
    default?: string;
    enumKey?: string;
    perLevel?: boolean;
    desc?: string;
};

export type HandlerSchema = {
    desc: string;
    params: ParamSpec[];
};

export const HANDLER_PARAM_ENUMS: Record<string, readonly string[]> = {
    statModifierType: ["DIFF", "PER"],
    baseStat: ["STR", "DEX", "CON", "INT", "WIT", "MEN"],
    dispelSlotType: ["BUFF", "DEBUFF", "PASSIVE"]
};

export function paramEnumChoices(key: string): readonly string[] | null {
    return HANDLER_PARAM_ENUMS[key] ?? SKILL_ENUMS[key] ?? null;
}

const STAT_PARAMS: ParamSpec[] = [
    {
        name: "amount",
        type: "float",
        default: "0",
        desc: "The value: a flat amount when mode=DIFF, a multiplier when mode=PER."
    },
    {
        name: "mode",
        type: "enum",
        enumKey: "statModifierType",
        default: "DIFF",
        desc: "DIFF = add `amount`; PER = multiply by `amount` (e.g. 1.1 = +10%)."
    }
];
const statEffect = (label: string): HandlerSchema => ({ desc: `Modifies ${label}.`, params: STAT_PARAMS });

export const EFFECT_SCHEMAS: Record<string, HandlerSchema> = {
    MaxHp: statEffect("max HP"),
    MaxMp: statEffect("max MP"),
    MaxCp: statEffect("max CP"),
    Speed: statEffect("movement speed"),
    Accuracy: statEffect("physical accuracy"),
    MagicAccuracy: statEffect("magic accuracy"),
    PhysicalEvasion: statEffect("physical evasion"),
    MagicalEvasion: statEffect("magic evasion"),
    PhysicalAttackSpeed: statEffect("attack speed"),
    MagicalAttackSpeed: statEffect("casting speed"),
    CriticalRate: statEffect("physical critical rate"),
    MagicCriticalRate: statEffect("magic critical rate"),
    CriticalDamage: statEffect("physical critical damage"),
    PhysicalDefence: statEffect("physical defence (P. Def)"),
    MagicalDefence: statEffect("magic defence (M. Def)"),
    ShieldDefence: statEffect("shield defence"),
    ShieldDefenceRate: statEffect("shield block rate"),

    PhysicalDamage: {
        desc: "Deals physical (P. Atk-based) damage. `power` = base power; the *Mod params and flags tune the formula.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "pAtkMod", type: "float", default: "1.0" },
            { name: "pDefMod", type: "float", default: "1.0" },
            { name: "criticalChance", type: "float", default: "10" },
            { name: "ignoreShieldDefence", type: "bool", default: "false" },
            { name: "overHit", type: "bool", default: "false" },
            { name: "abnormalType", type: "string" },
            { name: "damageModifier", type: "float", default: "1" },
            { name: "powerModifier", type: "float", default: "1" },
            { name: "raceModifier", type: "float", default: "1" },
            { name: "races", type: "string" }
        ]
    },
    MagicalDamage: {
        desc: "Deals magical (M. Atk-based) damage. `power` = base power.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "overHit", type: "bool", default: "false" },
            { name: "debuffModifier", type: "float", default: "1" },
            { name: "raceModifier", type: "float", default: "1" },
            { name: "races", type: "string" }
        ]
    },
    HpDrain: {
        desc: "Deals damage and heals the caster for `percentage`% of it.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "percentage", type: "float", default: "0" }
        ]
    },
    Backstab: {
        desc: "Backstab damage — requires standing behind the target. `chanceBoost` adds to the hit rate.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "chanceBoost", type: "float", default: "0", perLevel: true },
            { name: "criticalChance", type: "float", default: "0" },
            { name: "overHit", type: "bool", default: "false" }
        ]
    },
    FatalBlow: {
        desc: "Fatal Blow (dagger blow) damage. `chanceBoost` adds to the blow's hit rate.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "chanceBoost", type: "float", default: "0", perLevel: true },
            { name: "criticalChance", type: "float", default: "0" },
            { name: "overHit", type: "bool", default: "false" },
            { name: "abnormalType", type: "string" },
            { name: "abnormalPower", type: "float", default: "1" }
        ]
    },
    Lethal: {
        desc: "Instant-kill chances. `fullLethal` = % to drop HP to 1 (players) / 0 (NPCs); `halfLethal` = % to halve current HP.",
        params: [
            { name: "fullLethal", type: "float", default: "0", perLevel: true },
            { name: "halfLethal", type: "float", default: "0", perLevel: true }
        ]
    },
    Bluff: {
        desc: "Forces the target to turn around (sets up a back attack).",
        params: [{ name: "chance", type: "int", default: "100", desc: "% chance to apply." }]
    },

    Heal: {
        desc: "Restores HP. `power` = amount healed.",
        params: [{ name: "power", type: "float", default: "0", perLevel: true }]
    },
    HealPercent: {
        desc: "Restores HP as a % of the target's max HP.",
        params: [{ name: "power", type: "float", default: "0", perLevel: true }]
    },
    HealOverTime: {
        desc: "Restores HP each tick over the buff's duration.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "ticks", type: "int", default: "5", desc: "Number of ticks spread over abnormalTime." }
        ]
    },
    DamOverTime: {
        desc: "Deals HP damage each tick over the debuff's duration.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "ticks", type: "int", default: "5" },
            { name: "canKill", type: "bool", default: "false", desc: "Whether a tick can reduce the target's HP to 0." }
        ]
    },
    DamOverTimePercent: {
        desc: "Deals HP damage each tick as a % of the target's max HP.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "ticks", type: "int", default: "5" },
            { name: "canKill", type: "bool", default: "false" }
        ]
    },
    Resurrection: {
        desc: "Lets the caster resurrect the target; restored HP/MP/CP = the *Percent params.",
        params: [
            { name: "power", type: "int", default: "0" },
            { name: "hpPercent", type: "int", default: "0" },
            { name: "mpPercent", type: "int", default: "0" },
            { name: "cpPercent", type: "int", default: "0" }
        ]
    },

    CallSkill: {
        desc: "Casts another skill on the target.",
        params: [
            { name: "skillId", type: "int", default: "0" },
            { name: "skillLevel", type: "int", default: "1" },
            { name: "skillSubLevel", type: "int", default: "0" },
            {
                name: "skillLevelScaleTo",
                type: "int",
                default: "0",
                desc: "If > 0, scales the called skill's level with this skill's level up to here."
            },
            { name: "chance", type: "int", default: "100", desc: "% chance to fire." }
        ]
    },
    AddSkillBySkill: {
        desc: "While the target is under `existingSkill`, grants `addedSkill`.",
        params: [
            { name: "existingSkillId", type: "int", default: "0" },
            { name: "existingSkillLevel", type: "int", default: "1" },
            { name: "addedSkillId", type: "int", default: "0" },
            { name: "addedSkillLevel", type: "int", default: "1" }
        ]
    },
    ReplaceSkillBySkill: {
        desc: "Swaps `existingSkill` for `replacementSkill` on the target's skill bar.",
        params: [
            { name: "existingSkillId", type: "int", default: "0" },
            { name: "existingSkillLevel", type: "int", default: "-1" },
            { name: "replacementSkillId", type: "int", default: "0" },
            { name: "replacementSkillLevel", type: "int", default: "-1" }
        ]
    },
    TriggerSkillByDamageDealt: {
        desc: "Fires `skill` with `chance`% when the holder deals ≥ `minDamage` damage.",
        params: [
            { name: "minDamage", type: "int", default: "1" },
            { name: "chance", type: "int", default: "100" },
            { name: "skillId", type: "int", default: "0" },
            { name: "skillLevel", type: "int", default: "1" },
            { name: "targetType", type: "enum", enumKey: "targetType", default: "SELF" },
            {
                name: "attackerType",
                type: "string",
                default: "Creature",
                desc: "InstanceType the attack must come from (Creature / Player / Npc / …)."
            },
            { name: "isCritical", type: "bool", default: "false" },
            { name: "renewDuration", type: "bool", default: "false" },
            { name: "allowNormalAttack", type: "bool", default: "true" },
            { name: "allowSkillAttack", type: "bool", default: "false" },
            { name: "minAttackerLevel", type: "int", default: "1" },
            { name: "maxAttackerLevel", type: "int" }
        ]
    },
    TriggerSkillBySkill: {
        desc: "When the holder casts `castSkill`, also fires `skill` with `chance`%.",
        params: [
            { name: "castSkillId", type: "int", default: "0" },
            { name: "castSkillLevel", type: "int", default: "0" },
            { name: "chance", type: "int", default: "100" },
            { name: "skillId", type: "int", default: "0" },
            { name: "skillLevel", type: "int", default: "0" },
            { name: "skillLevelScaleTo", type: "int", default: "0" },
            { name: "targetType", type: "enum", enumKey: "targetType", default: "TARGET" },
            { name: "replace", type: "bool", default: "true" }
        ]
    },

    DispelBySlot: {
        desc: "Removes buffs matching `dispel` — a `;`-separated list of `abnormalType,abnormalLevel` pairs.",
        params: [
            { name: "dispel", type: "string", desc: "e.g. `BLEED,1;POISON,1` — pair = abnormalType,abnormalLevel." }
        ]
    },
    DispelByCategory: {
        desc: "Removes up to `max` buffs in `slot`, `rate`% chance each.",
        params: [
            { name: "slot", type: "enum", enumKey: "dispelSlotType", default: "BUFF" },
            { name: "rate", type: "int", default: "100" },
            { name: "max", type: "int", default: "1" }
        ]
    },

    SummonNpc: {
        desc: "Spawns `npcCount` × NPC `npcId` near the caster.",
        params: [
            { name: "npcId", type: "int", default: "0" },
            { name: "npcCount", type: "int", default: "1" },
            { name: "despawnDelay", type: "int", default: "0", desc: "ms before it disappears (0 = until killed)." },
            { name: "randomOffset", type: "bool", default: "false" },
            { name: "isSummonSpawn", type: "bool", default: "false" },
            { name: "singleInstance", type: "bool", default: "false" },
            { name: "aggressive", type: "bool", default: "true" }
        ]
    },
    Transformation: {
        desc: "Transforms the caster (id from TransformData).",
        params: [{ name: "transformationId", type: "string" }]
    },
    BlockAction: {
        desc: "Blocks the listed actions on the target (a `;`-separated list of action ids).",
        params: [{ name: "blockedActions", type: "string" }]
    },
    AbnormalTimeChange: {
        desc: "Changes the remaining time of an active abnormal on the target.",
        params: [
            { name: "id", type: "int", default: "0", desc: "Skill id whose abnormal to adjust." },
            { name: "slot", type: "string", desc: "abnormalType to adjust (alternative to `id`)." },
            { name: "time", type: "int", default: "-1", desc: "New remaining time in ms (-1 = remove the abnormal)." },
            { name: "mode", type: "string", default: "DEBUFF", desc: "Which side to act on (BUFF / DEBUFF)." }
        ]
    },

    ManaHeal: {
        desc: "Restores MP. `power` = amount.",
        params: [{ name: "power", type: "float", default: "0", perLevel: true }]
    },
    ManaHealPercent: {
        desc: "Restores MP as a % of max MP.",
        params: [{ name: "power", type: "float", default: "0", perLevel: true }]
    },
    ManaHealOverTime: {
        desc: "Restores MP each tick over the buff's duration.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "ticks", type: "int", default: "5" }
        ]
    },
    CpHeal: {
        desc: "Restores CP. `power` = amount.",
        params: [{ name: "power", type: "float", default: "0", perLevel: true }]
    },
    CpHealPercent: {
        desc: "Restores CP as a % of max CP.",
        params: [{ name: "power", type: "float", default: "0", perLevel: true }]
    },
    CpHealOverTime: {
        desc: "Restores CP each tick over the buff's duration.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "ticks", type: "int", default: "5" }
        ]
    },
    HpCpHeal: {
        desc: "Restores HP and CP together.",
        params: [{ name: "power", type: "float", default: "0", perLevel: true }]
    },
    Relax: {
        desc: "Sit-and-rest buff: greatly boosted HP/MP regen while seated.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true, desc: "Regen multiplier while resting." },
            { name: "ticks", type: "int", default: "10" }
        ]
    },
    FakeDeath: {
        desc: "Feigns death — looks dead to monsters, can't act until you stand; regenerates HP/MP each tick while down.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "ticks", type: "int", default: "5" }
        ]
    },

    DeathLink: {
        desc: "Damage scaled by the caster's missing HP.",
        params: [{ name: "power", type: "float", default: "0", perLevel: true }]
    },
    MagicalSoulDamage: {
        desc: "Magic damage that consumes Soul charges for extra power.",
        params: [{ name: "power", type: "float", default: "0", perLevel: true }]
    },
    PhysicalSoulDamage: {
        desc: "Physical damage that consumes Soul charges for extra power.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "criticalChance", type: "float", default: "0" },
            { name: "ignoreShieldDefence", type: "bool", default: "false" },
            { name: "overHit", type: "bool", default: "false" }
        ]
    },
    SoulBlow: {
        desc: "Dagger blow (Mortal Blow / Backstab family) — big damage, requires positioning.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "chanceBoost", type: "float", default: "0", perLevel: true },
            { name: "overHit", type: "bool", default: "false" }
        ]
    },
    EnergyDamage: {
        desc: "Damage scaled by the caster's stored energy charges.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "criticalChance", type: "int", default: "10" },
            { name: "ignoreShieldDefence", type: "bool", default: "false" },
            { name: "overHit", type: "bool", default: "false" },
            { name: "chargeConsume", type: "int", default: "0" },
            { name: "pDefMod", type: "float", default: "1.0" }
        ]
    },
    RealDamage: {
        desc: "Deals 'real' damage that ignores defences / reductions.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            {
                name: "mode",
                type: "enum",
                enumKey: "statModifierType",
                default: "DIFF",
                desc: "DIFF = flat power; PER = % of the target's max HP."
            }
        ]
    },
    MagicalDamageMp: {
        desc: "Magic damage that also drains MP.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "critical", type: "bool", default: "false" },
            { name: "criticalLimit", type: "float", default: "0" }
        ]
    },
    MagicalDamageOverTime: {
        desc: "Magic damage dealt each tick over the debuff's duration.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "ticks", type: "int", default: "5" },
            { name: "canKill", type: "bool", default: "false" }
        ]
    },
    ManaDamOverTime: {
        desc: "Drains MP each tick over the debuff's duration (mana burn).",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "ticks", type: "int", default: "5" }
        ]
    },
    MagicalDamageByAbnormal: {
        desc: "Magic damage, boosted against targets that have a matching abnormal.",
        params: [{ name: "power", type: "float", default: "0", perLevel: true }]
    },
    PhysicalDamageHpLink: {
        desc: "Physical damage scaled by the caster's missing HP.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "criticalChance", type: "float", default: "0" },
            { name: "overHit", type: "bool", default: "false" }
        ]
    },
    PhysicalDamageWeaponBonus: {
        desc: "Physical damage with an extra bonus per equipped weapon type.",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "criticalChance", type: "float", default: "10" },
            { name: "ignoreShieldDefence", type: "bool", default: "false" },
            { name: "overHit", type: "bool", default: "false" },
            { name: "pDefMod", type: "float", default: "1.0" }
        ]
    },

    DispelBySkillId: {
        desc: "Removes the abnormal granted by `skillId` from the target.",
        params: [
            { name: "skillId", type: "int", default: "0" },
            { name: "rate", type: "int", default: "100", desc: "% chance per matching buff." }
        ]
    },
    StealAbnormal: {
        desc: "Steals up to `max` buffs in `slot` off the target and applies them to the caster.",
        params: [
            { name: "slot", type: "enum", enumKey: "dispelSlotType", default: "BUFF" },
            { name: "rate", type: "int", default: "100" },
            { name: "max", type: "int", default: "1" }
        ]
    },
    AbnormalShield: {
        desc: "Blocks incoming debuffs — `times` of them (-1 = no limit, just for the duration).",
        params: [{ name: "times", type: "int", default: "-1" }]
    },
    ResistAbnormalByCategory: {
        desc: "Reduces the land rate of debuffs in `slot` by `amount`.",
        params: [
            { name: "amount", type: "float", default: "0" },
            { name: "slot", type: "enum", enumKey: "dispelSlotType", default: "DEBUFF" }
        ]
    },
    ResistDispelByCategory: {
        desc: "Reduces the chance buffs in `slot` get cancelled by `amount`.",
        params: [
            { name: "amount", type: "float", default: "0" },
            { name: "slot", type: "enum", enumKey: "dispelSlotType", default: "BUFF" }
        ]
    },

    TriggerSkill: {
        desc: "Generic trigger — fires `skill` on the target.",
        params: [
            { name: "skillId", type: "int", default: "0" },
            { name: "skillLevel", type: "int", default: "1" },
            { name: "targetType", type: "enum", enumKey: "targetType", default: "TARGET" },
            {
                name: "adjustLevel",
                type: "bool",
                default: "false",
                desc: "Scale the fired skill's level to the holder's."
            }
        ]
    },
    TriggerSkillByAvoid: {
        desc: "Fires `skill` with `chance`% when the holder evades an attack.",
        params: [
            { name: "chance", type: "int", default: "100" },
            { name: "skillId", type: "int", default: "0" },
            { name: "skillLevel", type: "int", default: "0" },
            { name: "targetType", type: "enum", enumKey: "targetType", default: "TARGET" },
            { name: "skillLevelScaleTo", type: "int", default: "0" }
        ]
    },
    TriggerSkillByDamageReceived: {
        desc: "Fires `skill` with `chance`% when the holder takes ≥ `minDamage` damage (and HP ≤ `hpPercent`%).",
        params: [
            { name: "minDamage", type: "int", default: "1" },
            { name: "chance", type: "int", default: "100" },
            { name: "hpPercent", type: "int", default: "100" },
            { name: "skillId", type: "int", default: "0" },
            { name: "skillLevel", type: "int", default: "1" },
            { name: "targetType", type: "enum", enumKey: "targetType", default: "SELF" },
            { name: "minAttackerLevel", type: "int", default: "1" },
            { name: "maxAttackerLevel", type: "int" }
        ]
    },
    TriggerSkillByKill: {
        desc: "Fires `skill` with `chance`% when the holder kills a creature of `victimType`.",
        params: [
            { name: "chance", type: "int", default: "100" },
            { name: "skillId", type: "int", default: "0" },
            { name: "skillLevel", type: "int", default: "0" },
            {
                name: "victimType",
                type: "string",
                default: "Creature",
                desc: "InstanceType (Creature / Player / Npc / …)."
            }
        ]
    },
    TriggerSkillByHpPercent: {
        desc: "Fires `skill` while the holder's HP% is within [percentFrom, percentTo].",
        params: [
            { name: "skillId", type: "int", default: "0" },
            { name: "skillLevel", type: "int", default: "1" },
            { name: "percentFrom", type: "int", default: "0" },
            { name: "percentTo", type: "int", default: "100" }
        ]
    },
    TriggerSkillByDeathBlow: {
        desc: "Fires `skill` with `chance`% when the holder lands a death blow.",
        params: [
            { name: "chance", type: "int", default: "100" },
            { name: "skillId", type: "int", default: "0" },
            { name: "skillLevel", type: "int", default: "1" },
            { name: "targetType", type: "enum", enumKey: "targetType", default: "SELF" },
            { name: "attackerType", type: "string", default: "Creature" },
            { name: "minAttackerLevel", type: "int", default: "1" },
            { name: "maxAttackerLevel", type: "int" }
        ]
    },
    TriggerSkillByMagicType: {
        desc: "Fires `skill` when the holder casts a skill whose magic type is in `magicTypes`.",
        params: [
            { name: "magicTypes", type: "string", desc: "`;`-separated list of isMagic codes (0/1/2/3)." },
            { name: "chance", type: "int", default: "100" },
            { name: "skillId", type: "int", default: "0" },
            { name: "skillLevel", type: "int", default: "0" },
            { name: "skillLevelScaleTo", type: "int", default: "0" },
            { name: "targetType", type: "enum", enumKey: "targetType", default: "TARGET" },
            { name: "replace", type: "bool", default: "true" }
        ]
    },
    TriggerSkillWithDelay: {
        desc: "Fires `triggerSkill` after `delay`.",
        params: [
            { name: "triggerSkill", type: "string", desc: "`id-level` (e.g. `1234-3`)." },
            { name: "delay", type: "string", desc: "Delay in ms (may be per-level via a `;`-list)." }
        ]
    },

    Confuse: {
        desc: "Confuses the target — it attacks random nearby creatures.",
        params: [{ name: "chance", type: "int", default: "100" }]
    },
    KnockBack: {
        desc: "Knocks the target back (briefly stunned). `distance` in game units.",
        params: [
            { name: "distance", type: "int", default: "50" },
            { name: "speed", type: "int", default: "0" },
            { name: "delay", type: "int", default: "0" },
            { name: "animationSpeed", type: "int", default: "0" },
            { name: "knockDown", type: "bool", default: "false" }
        ]
    },
    PullBack: {
        desc: "Yanks the target toward the caster.",
        params: [
            { name: "speed", type: "int", default: "0" },
            { name: "delay", type: "int", default: "0" },
            { name: "animationSpeed", type: "int", default: "0" }
        ]
    },
    FlyAway: {
        desc: "Hurls the target `radius` units through the air.",
        params: [{ name: "radius", type: "int", default: "200" }]
    },
    TargetCancel: {
        desc: "Cancels the target's current target and breaks its cast.",
        params: [{ name: "chance", type: "int", default: "100" }]
    },
    AddHate: {
        desc: "Adds `power` aggro on the caster (with the target's monsters).",
        params: [
            { name: "power", type: "float", default: "0", perLevel: true },
            { name: "affectSummoner", type: "bool", default: "false" }
        ]
    },
    DamageBlock: {
        desc: "Blocks incoming damage of `type` (PHYSICAL / MAGICAL / …) for the duration.",
        params: [{ name: "type", type: "string" }]
    },
    BlockSkill: {
        desc: "Blocks skills of the listed magic types / ids on the target.",
        params: [
            { name: "magicTypes", type: "string", desc: "`;`-separated isMagic codes." },
            { name: "skillIds", type: "string", desc: "`;`-separated skill ids." }
        ]
    },
    DisableSkill: {
        desc: "Disables the listed skills / skill types on the target.",
        params: [{ name: "disable", type: "string", desc: "`;`-separated skill ids or types." }]
    },

    ReduceDamage: {
        desc: "Reduces incoming damage (DIFF = flat, PER = % multiplier).",
        params: [
            { name: "amount", type: "float", default: "0" },
            { name: "mode", type: "enum", enumKey: "statModifierType", default: "DIFF" }
        ]
    },
    AbsorbDamage: {
        desc: "Absorbs incoming hits into a damage pool.",
        params: [
            { name: "damage", type: "float", default: "0" },
            { name: "mode", type: "enum", enumKey: "statModifierType", default: "DIFF" },
            { name: "hits", type: "int", default: "-1", desc: "Number of hits absorbed (-1 = duration-based)." },
            { name: "casterHpMod", type: "float", default: "0" }
        ]
    },
    ReflectSkill: {
        desc: "Reflects `type` skills back at the caster.",
        params: [
            { name: "type", type: "enum", enumKey: "basicProperty", default: "PHYSICAL" },
            { name: "amount", type: "float", default: "0", desc: "% chance to reflect." }
        ]
    },
    VampiricAttack: {
        desc: "Restores the caster's HP for `amount`% of physical damage dealt.",
        params: [
            { name: "amount", type: "float", default: "0" },
            { name: "chance", type: "float", default: "100", desc: "% chance to proc." }
        ]
    },
    CheatDeath: {
        desc: "Survives a lethal hit at the configured HP/MP/CP (the absolute values take precedence over the *Percent ones).",
        params: [
            { name: "hp", type: "int", default: "-1" },
            { name: "mp", type: "int", default: "-1" },
            { name: "cp", type: "int", default: "-1" },
            { name: "hpPercent", type: "int", default: "-1" },
            { name: "mpPercent", type: "int", default: "-1" },
            { name: "cpPercent", type: "int", default: "-1" }
        ]
    },

    Summon: {
        desc: "Summons servitor NPC `npcId`. `lifeTime` in seconds (0 = no limit).",
        params: [
            { name: "npcId", type: "int", default: "0" },
            { name: "lifeTime", type: "int", default: "3600" },
            { name: "expMultiplier", type: "float", default: "1" },
            { name: "consumeItemId", type: "int", default: "0" },
            { name: "consumeItemCount", type: "int", default: "1" },
            {
                name: "consumeItemInterval",
                type: "int",
                default: "0",
                desc: "Seconds between upkeep-item consumption (0 = none)."
            }
        ]
    },
    SummonCubic: {
        desc: "Summons Cubic `cubicId` at level `cubicLvl`.",
        params: [
            { name: "cubicId", type: "int", default: "-1" },
            { name: "cubicLvl", type: "int", default: "0" }
        ]
    },
    SummonAgathion: { desc: "Activates Agathion NPC `npcId`.", params: [{ name: "npcId", type: "int", default: "0" }] },
    SummonTrap: {
        desc: "Places Trap NPC `npcId`. `despawnTime` in ms (0 = until triggered).",
        params: [
            { name: "npcId", type: "int", default: "0" },
            { name: "despawnTime", type: "int", default: "0" }
        ]
    },
    Ride: {
        desc: "Mounts ride NPC `npcId` (strider / wyvern / event mount).",
        params: [{ name: "npcId", type: "int", default: "0" }]
    },
    Unsummon: {
        desc: "Un-summons the caster's servitor.",
        params: [{ name: "chance", type: "int", default: "-1", desc: "% chance (-1 = always)." }]
    },
    FocusSouls: { desc: "Grants `charge` Soul charges.", params: [{ name: "charge", type: "int", default: "1" }] },
    FocusMomentum: {
        desc: "Grants Momentum charges.",
        params: [
            { name: "amount", type: "int", default: "1" },
            { name: "maxCharges", type: "int", default: "0", desc: "Cap (0 = engine default)." }
        ]
    },
    SoulEating: {
        desc: "On killing something worth ≥ `expNeeded` XP, gains a Soul; up to `maxSouls`.",
        params: [
            { name: "expNeeded", type: "int", default: "1" },
            { name: "maxSouls", type: "float", default: "10" }
        ]
    },
    Synergy: {
        desc: "Synergy buff — scales up as more party members hold matching buffs.",
        params: [
            { name: "requiredSlots", type: "string", desc: "`;`-list of abnormalTypes that must all be present." },
            { name: "optionalSlots", type: "string", desc: "`;`-list of abnormalTypes that add bonus when present." },
            { name: "partyBuffSkillId", type: "int", default: "0" },
            { name: "skillLevelScaleTo", type: "int", default: "1" },
            { name: "minSlot", type: "int", default: "2" },
            { name: "ticks", type: "int", default: "5" }
        ]
    },
    Reuse: {
        desc: "Modifies the reuse delay of skills of magic type `magicType`.",
        params: [
            { name: "magicType", type: "int", default: "0", desc: "0 = all; otherwise an isMagic code." },
            { name: "amount", type: "float", default: "0" }
        ]
    },
    ReuseSkillById: {
        desc: "Reduces skill `skillId`'s reuse delay by `amount`.",
        params: [
            { name: "skillId", type: "int", default: "0" },
            { name: "amount", type: "int", default: "0" }
        ]
    },

    Teleport: {
        desc: "Teleports the target to a fixed location.",
        params: [
            { name: "x", type: "int", default: "0" },
            { name: "y", type: "int", default: "0" },
            { name: "z", type: "int", default: "0" }
        ]
    },
    Escape: {
        desc: "Recall — teleports the caster home / to a fixed escape point.",
        params: [{ name: "escapeType", type: "string", desc: "TOWN / CLAN / CASTLE / FORTRESS / …" }]
    },
    OpenDoor: {
        desc: "Opens a door / gatekeeper.",
        params: [
            { name: "chance", type: "int", default: "100" },
            { name: "isItem", type: "bool", default: "false" }
        ]
    },
    Crystallize: {
        desc: "Crystallizes the targeted item.",
        params: [{ name: "grade", type: "string", desc: "Crystal grade (D / C / B / A / S / …)." }]
    },
    ClassChange: {
        desc: "Changes the character's class (sub-class slot `index`).",
        params: [{ name: "index", type: "int", default: "0" }]
    },
    CallPc: {
        desc: "Summons the caster's party members to the caster.",
        params: [
            { name: "itemId", type: "int", default: "0", desc: "Item consumed per summoned member (0 = none)." },
            { name: "itemCount", type: "int", default: "0" }
        ]
    },
    GiveExpAndSp: {
        desc: "Grants a flat amount of XP and SP.",
        params: [
            { name: "xp", type: "int", default: "0" },
            { name: "sp", type: "int", default: "0" }
        ]
    },
    GiveSp: { desc: "Grants a flat amount of SP.", params: [{ name: "sp", type: "int", default: "0" }] },
    GiveFame: { desc: "Grants Fame.", params: [{ name: "fame", type: "int", default: "0" }] },
    Feed: {
        desc: "Feeds a pet (restores hunger; the value used depends on the pet type).",
        params: [
            { name: "normal", type: "int", default: "0" },
            { name: "ride", type: "int", default: "0" },
            { name: "wyvern", type: "int", default: "0" }
        ]
    }
};

export const CONDITION_SCHEMAS: Record<string, HandlerSchema> = {
    CheckLevel: {
        desc: "Caster (or target, per `affectType`) level must be within [minLevel, maxLevel].",
        params: [
            { name: "minLevel", type: "int", default: "1" },
            { name: "maxLevel", type: "int" },
            { name: "affectType", type: "string", default: "CASTER", desc: "CASTER or TARGET." }
        ]
    },
    CheckSex: {
        desc: "Caster's sex must match `isFemale`.",
        params: [{ name: "isFemale", type: "bool", default: "false" }]
    },
    OpInZone: {
        desc: "Caster must currently be inside zone `zoneId`.",
        params: [{ name: "zoneId", type: "int", default: "0" }]
    },
    RemainHpPer: {
        desc: "Caster's HP% must be `percentType` `amount`% (e.g. LESS than 30).",
        params: [
            { name: "amount", type: "int", default: "0", desc: "The threshold, in percent." },
            {
                name: "percentType",
                type: "string",
                default: "LESS",
                desc: "LESS / MORE / EQUAL — how `amount` is compared."
            },
            { name: "affectType", type: "string", default: "CASTER" }
        ]
    },
    RemainMpPer: {
        desc: "Caster's MP% must be `percentType` `amount`%.",
        params: [
            { name: "amount", type: "int", default: "0" },
            { name: "percentType", type: "string", default: "LESS" }
        ]
    },
    RemainCpPer: {
        desc: "Caster's CP% must be `percentType` `amount`%.",
        params: [
            { name: "amount", type: "int", default: "0" },
            { name: "percentType", type: "string", default: "LESS" }
        ]
    },
    OpCheckSkill: {
        desc: "Caster (or target) must know skill `skillId`.",
        params: [
            { name: "skillId", type: "int", default: "0" },
            { name: "affectType", type: "string", default: "CASTER" }
        ]
    },
    OpAffectedBySkill: {
        desc: "Target must be under skill `skillId` (any level when -1).",
        params: [
            { name: "skillId", type: "int", default: "-1" },
            { name: "skillLevel", type: "int", default: "-1" }
        ]
    },
    OpNotAffectedBySkill: {
        desc: "Target must NOT be under skill `skillId`.",
        params: [
            { name: "skillId", type: "int", default: "-1" },
            { name: "skillLevel", type: "int", default: "-1" }
        ]
    },
    OpAlignment: {
        desc: "Caster's / target's alignment must be `alignment`.",
        params: [
            {
                name: "alignment",
                type: "string",
                default: "GOOD",
                desc: "GOOD / EVIL / NEUTRAL / CHAOTIC (engine values)."
            },
            { name: "affectType", type: "string", default: "CASTER" }
        ]
    },
    OpBaseStat: {
        desc: "Caster's `stat` (STR / DEX / …) must be within [min, max].",
        params: [
            { name: "stat", type: "enum", enumKey: "baseStat", default: "STR" },
            { name: "min", type: "int", default: "0" },
            { name: "max", type: "int" }
        ]
    },
    OpPledge: {
        desc: "Caster's clan level must be ≥ `level`.",
        params: [{ name: "level", type: "int", default: "1" }]
    },
    OpSocialClass: {
        desc: "Caster's social class must equal `socialClass`.",
        params: [{ name: "socialClass", type: "int", default: "0" }]
    },
    OpEnergyMax: {
        desc: "Caster's energy charges must be ≥ `amount`.",
        params: [{ name: "amount", type: "int", default: "1" }]
    },
    OpCheckClass: {
        desc: "Caster's class must be `classId` (or a subclass of it when `isWithin` is true).",
        params: [
            { name: "classId", type: "string", default: "fighter", desc: "PlayerClass enum value." },
            { name: "isWithin", type: "bool", default: "false" },
            { name: "affectType", type: "string", default: "CASTER" }
        ]
    },
    OpInstantzone: {
        desc: "Caster must currently be inside instance `instanceId`.",
        params: [{ name: "instanceId", type: "int", default: "0" }]
    },
    CanTransform: {
        desc: "Caster must be able to transform into `transformId`.",
        params: [{ name: "transformId", type: "int", default: "-1" }]
    },
    CannotUseInTransform: {
        desc: "Caster must NOT be in transform `transformId` (-1 = any).",
        params: [{ name: "transformId", type: "int", default: "-1" }]
    },
    OpEquipItem: {
        desc: "Caster must have item `itemId` equipped.",
        params: [
            { name: "itemId", type: "int", default: "0" },
            { name: "affectType", type: "string", default: "CASTER" }
        ]
    },
    OpEncumbered: {
        desc: "Caster must be over the configured weight / inventory-slot threshold.",
        params: [
            { name: "weightPercent", type: "int", default: "0", desc: "Min carry-weight %, or 0 to ignore." },
            { name: "slotsPercent", type: "int", default: "0", desc: "Min used-slots %, or 0 to ignore." }
        ]
    },
    OpCheckCastRange: {
        desc: "Target must be within `distance` of the caster.",
        params: [{ name: "distance", type: "int", default: "0" }]
    },
    TargetMyParty: {
        desc: "Target must be in the caster's party.",
        params: [{ name: "includeMe", type: "bool", default: "false", desc: "Whether the caster themselves counts." }]
    }
};

export function handlerSchema(kind: "effect" | "condition", name: string): HandlerSchema | null {
    return (kind === "effect" ? EFFECT_SCHEMAS : CONDITION_SCHEMAS)[name] ?? null;
}
