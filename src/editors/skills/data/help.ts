export type FieldHelp = {
    description: string;
    unit?: string;
    values?: Record<string, string>;
};

export const ROOT_HELP: Record<string, FieldHelp> = {
    id: {
        description:
            "Unique skill ID. Referenced from items, classes, NPCs, quests. " +
            "Changing this on a live shard will orphan every existing reference."
    },
    name: {
        description:
            "Skill name shown in tooltips + chat logs. Cosmetic on the server " +
            "side; the client uses skillname-e.dat for the localized display name."
    },
    toLevel: {
        description:
            "Highest level this skill goes up to. Each per-level field " +
            "(power, mpConsume, magicLevel, ...) needs entries from level 1 up to " +
            "this value, otherwise levels above the last entry inherit the previous one."
    },
    subLevel: {
        description:
            "Enchant sublevel encoded as route×1000 + step (0 = the base skill). " +
            "Rarely set on the <skill> tag itself — enchant routes are usually authored " +
            "via per-<value subLevel=…> entries instead. Default 0."
    },
    referenceId: {
        description:
            "Links this skill to another for sub-class certification / awakening lookups. " +
            "Default 0 (no link). Leave empty unless you know you need it."
    },
    displayId: {
        description:
            "Skill id the client shows in tooltips / the skill bar instead of this one — " +
            "lets a skill masquerade as another. Defaults to the skill's own id; clear to remove."
    },
    displayLevel: {
        description:
            "Skill level the client displays instead of the real one. Defaults to each " +
            "level's own value; set to pin every level's shown level to a fixed number."
    }
};

export const FIELD_HELP: Record<string, FieldHelp> = {
    icon: {
        description:
            "Client texture reference for the skillbar icon. Format is " +
            "`Package.Texture` (typically `icon.skillNNNN`). The icon must exist " +
            "in the matching .utx package or the slot renders empty in-game."
    },

    operateType: {
        description:
            "How the skill is invoked + how its effects apply. (Codes from L2J's " +
            "SkillOperateType — A* active, CA* channeled, DA* directional, P/T/TG/AU passive-ish.)",
        values: {
            A1: "Active. Instant-effect skill — damage, heals, cpdam, etc.",
            A2: "Active. Continuous effect + instant effect — buffs/debuffs, damage/heal over time.",
            A3: "Active. Instant effect on the target + a continuous effect + a continuous effect on the caster.",
            A4: "Active. Instant effect + extra — used by special event herbs.",
            A5: "Active aura skill.",
            A6: "Active synergy skill.",
            CA1: "Channeled active — applies an instant effect on every tick while channeling.",
            CA2: "Channeled active — engine variant (undocumented in source).",
            CA5: "Channeled active — applies a continuous effect on every tick while channeling.",
            DA1: "Directional active — charge/rush, instant effect on arrival.",
            DA2: "Directional active — charge/rush, continuous effect.",
            DA3: "Directional active — blink / teleport.",
            DA4: "Directional active — left, continuous effect.",
            DA5: "Directional active — right, continuous effect.",
            DA6: "Directional active — charge/rush up to the skill's cast range, instant effect.",
            P: "Passive. Always-on. No cast button.",
            T:
                "Toggle. Click on / click off, no MP cost per cast (uses initialMpConsume + " +
                "tickMpConsume while active).",
            TG: "Toggle in a mutually-exclusive group — only one toggle in the group can be active.",
            AU: "Aura. Continuously emitted from the caster (siege flags, etc.)."
        }
    },

    targetType: {
        description:
            "What can be targeted by this skill. Validated client-side AND " +
            "server-side; mismatch = silent fail at cast time.",
        values: {
            ENEMY: "Anything hostile (or neutral if you flag-attack).",
            ENEMY_NOT: "Inverse — anything that's NOT a valid PvP enemy.",
            ENEMY_ONLY: "Only PvP-flagged players + their summons. Not monsters.",
            SELF: "Caster only.",
            TARGET: "Whatever's already selected — no validation. Buff a chosen ally, etc.",
            TARGET_OR_SELF: "Selected target if present, else self.",
            OTHERS: "Anyone except the caster.",
            SUMMON: "Caster's own summon / pet.",
            MY_PARTY: "Party members in range.",
            MY_MENTOR: "The caster's mentor / mentee bond.",
            OWNER_PET: "The pet's owner (for pet-cast skills).",
            GROUND: "Ground-target. Hits at a position, not an entity.",
            ITEM: "Targets an inventory item (uncrystallize, soulshot bind, etc.).",
            DOOR_TREASURE: "Doors and treasure-box NPCs.",
            HOLYTHING: "Cat'a Castle holy artifact.",
            FORTRESS_FLAGPOLE: "Fortress flagpole NPC.",
            ADVANCE_BASE: "Advance base / outpost.",
            ARTILLERY: "Headquarters artillery.",
            NPC_BODY: "NPC corpses (looting / soul crystal effects).",
            PC_BODY: "Player corpses (resurrection).",
            WYVERN_TARGET: "Used by wyvern-mounted skills.",
            RECALL_CREATURE: "Recall (summon to caster).",
            NONE: "No target needed. Self-only auras with this targetType."
        }
    },

    affectScope: {
        description:
            "How the chosen target expands into the actually-affected set " +
            "(single, party, ring around target, etc.).",
        values: {
            SINGLE: "Just the targeted entity.",
            PARTY: "Targeted entity's party (caster's party for self).",
            PARTY_PLEDGE: "Targeted entity's party + clan.",
            PLEDGE: "Targeted entity's clan.",
            RANGE: "Everything within `affectRange` of the target.",
            RANGE_SORT_BY_HP: "Like RANGE but prioritizes lowest-HP first (mass heals).",
            POINT_BLANK: "Everything within range of the CASTER.",
            FAN: "Cone forward from the caster.",
            FAN_PB: "Cone, point-blank variant.",
            SQUARE: "Rectangle in front of caster.",
            SQUARE_PB: "Rectangle, point-blank.",
            RING_RANGE: "Donut — has a min range as well as max.",
            DEAD_PLEDGE: "Dead clan members in range (mass resurrection).",
            DEAD_PARTY: "Dead party members in range.",
            DEAD_PARTY_PLEDGE: "Dead party + clan.",
            DEAD_UNION: "Dead alliance members.",
            SUMMON_EXCEPT_MASTER: "All summoned creatures except the caster.",
            STATIC_OBJECT_SCOPE: "Static world objects (siege flags, etc.).",
            VALAKAS_SCOPE: "Valakas-specific area logic.",
            WYVERN_SCOPE: "Wyvern-specific area logic.",
            NONE: "No expansion. Equivalent to SINGLE for most uses."
        }
    },

    affectObject: {
        description:
            "Filter applied to entities collected by `affectScope`. e.g. " +
            "`FRIEND` strips hostile targets out of an AoE that would otherwise hit them.",
        values: {
            ALL: "No filter.",
            FRIEND: "Allies only.",
            FRIEND_PC: "Allied players only (no NPCs/summons).",
            NOT_FRIEND: "Excludes allies.",
            NOT_FRIEND_PC: "Excludes allied players (NPCs/summons of allies still hit).",
            CLAN: "Clan members only.",
            INVISIBLE: "Hits invisible targets too (clergy/spy reveal).",
            HIDDEN_PLACE: "Targets in hidden zones.",
            UNDEAD_REAL_ENEMY: "Undead-typed enemies only.",
            OBJECT_DEAD_NPC_BODY: "Dead NPC corpses.",
            WYVERN_OBJECT: "Wyvern-related objects.",
            NOE: "(Not Of Enemy) — narrow alliance carve-out."
        }
    },

    affectRange: {
        description:
            "Radius (in game units) of `affectScope` when it's a range-based " +
            "scope. ~30 units = 1 tile; standard shouts are ~600 (= 20 tiles).",
        unit: "game units (~30/tile)"
    },

    affectLimit: {
        description:
            "Maximum number of entities the skill can hit. Some skills have " +
            'a min/max range encoded together (e.g. "3-7" → at least 3, at most 7).'
    },

    castRange: {
        description:
            "Max distance from caster at which the target can be selected. " +
            "Movement to range happens automatically before cast. -1 means infinite.",
        unit: "game units (~30/tile)"
    },

    coolTime: {
        description:
            "Post-cast animation lock — the caster can't act again until this " +
            "elapses. Distinct from reuseDelay (which gates the SKILL, not the caster).",
        unit: "ms"
    },

    hitTime: {
        description:
            "Cast animation duration before the effect lands. Magic skills " +
            "interrupt on damage during this window unless `magicCriticalRate` saves them.",
        unit: "ms"
    },

    reuseDelay: {
        description:
            "Cooldown — how long before this specific skill can be cast again. " +
            "Reduced by magic-reuse stats. 0 = no cooldown.",
        unit: "ms"
    },

    mpConsume: {
        description: "MP cost per cast. Toggles use this on activation."
    },

    mpInitialConsume: {
        description:
            "MP cost the moment cast starts (pays it even if interrupted). " +
            "Charge skills typically deduct mpInitialConsume up-front then mpConsume on success."
    },

    mpPerChanneling: {
        description:
            "MP drained per tick while channeling/toggling. Tickrate is set " + "by the engine, not by this field."
    },

    hpConsume: { description: "HP cost per cast. Used by HP-cost class skills." },

    soulMaxConsumeCount: {
        description: "Maximum souls / charges this skill can spend on a cast (variable-cost skills)."
    },

    chargeConsume: { description: "Number of momentum/focus charges consumed on cast." },

    itemConsumeId: {
        description:
            "Item ID consumed per cast (e.g. soulshot, spirit ore, scroll). " +
            "Pair with `itemConsumeCount` for the per-cast quantity."
    },
    itemConsumeCount: { description: "How many of `itemConsumeId` to spend per cast." },

    effectPoint: {
        description:
            'Buff value the AI uses to decide "should I cast this?". Negative = ' +
            "harmful (target picks). Positive = beneficial (cast on self/ally). Magnitude " +
            "feeds into AI priority — higher = more likely to fire."
    },

    effectRange: {
        description:
            "Cosmetic range of the effect (visual reach of beam/AoE). Different " +
            "from affectRange which controls who's actually hit.",
        unit: "game units"
    },

    magicLevel: {
        description:
            "Magic level used for resistance / land-rate calculations. Mismatch " +
            "between caster level and skill magicLevel applies a penalty to land rate."
    },

    magicCriticalRate: {
        description:
            "Chance of a magic critical (extra damage / can't be interrupted) " +
            "for this specific skill, in 1/10 percent (1000 = 100%).",
        unit: "1/10 percent"
    },

    activateRate: {
        description:
            "Base land rate % used by debuffs / chance-to-apply effects. " +
            "Modified by character stats and magicLevel delta.",
        unit: "percent"
    },

    nextAction: {
        description: "What the AI does after this skill resolves.",
        values: {
            NONE: "Idle / continue current task.",
            ATTACK: "Auto-attack the target after casting.",
            CAST: "Try to cast the same skill again (chains)."
        }
    },

    basicProperty: {
        description: "Stat used for resistance — physical skills key off STR/CON, " + "magic skills off INT/MEN.",
        values: {
            NONE: "No basic-stat resistance check.",
            PHYSICAL: "Resisted by physical-defense stats (STR/CON-based).",
            MAGIC: "Resisted by magic-defense stats (MEN-based)."
        }
    },

    attributeType: {
        description:
            "Elemental tag for damage skills. Element advantage / disadvantage " +
            "modifies final damage by attribute attack vs target's matching defense.",
        values: {
            NONE: "Non-elemental.",
            FIRE: "Fire damage. Strong vs water, weak vs water (mutually opposing).",
            WATER: "Water damage. Opposes fire.",
            WIND: "Wind damage. Opposes earth.",
            EARTH: "Earth damage. Opposes wind.",
            HOLY: "Holy damage. Opposes dark.",
            DARK: "Dark damage. Opposes holy."
        }
    },

    attributeValue: {
        description: "Attribute attack value contributed by this skill."
    },

    abnormalLevel: {
        description:
            "Stack level used for buff overwrite — a higher abnormalLevel buff " +
            "of the same abnormalType replaces a lower one."
    },

    abnormalType: {
        description:
            "Buff/debuff family used for stacking + immunity. Two skills with the " +
            "same abnormalType can't both be active; the higher abnormalLevel wins."
    },

    abnormalTime: {
        description:
            "Buff duration. -1 = until removed (toggle/passive). Some chronicles " +
            "use seconds, some use 1/10s — check the value range.",
        unit: "seconds"
    },

    abnormalVisualEffect: {
        description:
            "Client-side visual / animation effects shown while the buff is " +
            "active. Multi-value, semicolon-separated."
    },

    abnormalChance: {
        description: "Chance this skill's abnormal effect is actually applied even when " + "the skill itself lands.",
        unit: "percent"
    },

    abnormalResists: {
        description:
            "abnormalType values that, if currently on the target, block this " +
            "skill from landing. Multi-value, semicolon-separated."
    },

    stayAfterDeath: {
        description: "If true, the buff persists across the target's death. Default: false."
    },

    isDebuff: {
        description: "Hint for the buff-bar UI (red icon vs blue). Independent of " + "abnormalType — purely cosmetic."
    },

    isMagic: {
        description:
            "Magic vs physical classification. Affects which skill-power stat " +
            "is read (mAtk/pAtk), the critical formula, and interrupt rules.",
        values: {
            "0": "Physical — uses pAtk, rolls a physical crit, interruptible by physical hits.",
            "1": "Magic — uses mAtk, rolls a magic crit, interruptible during the cast.",
            "2": "Static — instant, not interruptible; ignores cast-speed and cooldown-reduction stats (item / potion-like skills).",
            "3": "Dance / song — bard skills (counted against the dance & song limit)."
        }
    },

    canBeDispelled: {
        description: "If false, cancel/cleanse can't remove this buff. Hero auras, " + "transformation buffs, etc."
    },

    trait: {
        description:
            "Damage trait family — used for trait-vulnerability stats on " + "monsters (BOSS, DRAGON_WEAKNESS, etc.)."
    },

    nextActionAttack: {
        description:
            "If true, automatically auto-attacks the target after this skill " +
            "resolves. Equivalent to `nextAction=ATTACK`."
    },

    castRangeOverride: {
        description:
            "Per-level cast-range override applied AFTER castRange. Used by " + "skills whose reach scales with level."
    },

    subordinationAbnormalType: {
        description:
            "A second abnormalType this skill also occupies — used by buffs that overlap " +
            "two buff families for stacking / immunity purposes."
    },

    famePointConsume: { description: "Fame points spent per cast (some PvP / siege utility skills).", unit: "fame" },
    clanRepConsume: { description: "Clan reputation spent per cast (clan-leader skills).", unit: "clan rep" },
    minPledgeClass: { description: "Minimum clan level required to use the skill. 0 = no clan requirement." },

    hitCancelTime: {
        description: "Window during the cast in which a hit cancels it. 0 = engine default behavior.",
        unit: "ms"
    },
    reuseDelayGroup: {
        description:
            "Shared-cooldown group id — casting any skill in the group puts the whole group " +
            "on cooldown together. -1 = the skill has its own independent cooldown."
    },
    staticReuse: {
        description: "If true, the reuse delay is fixed — not shortened by cooldown-reduction stats."
    },

    lvlBonusRate: {
        description: "Extra land-rate added per level of skill (or per caster-level delta), on top of activateRate.",
        unit: "percent per level"
    },
    minChance: {
        description: "Floor on the computed debuff/effect land rate — it can never end up below this %.",
        unit: "percent"
    },
    maxChance: {
        description: "Cap on the computed debuff/effect land rate — it can never end up above this %.",
        unit: "percent"
    },

    abnormalInstant: {
        description: "If true, the abnormal applies its payload once immediately instead of running over abnormalTime."
    },
    deleteAbnormalOnLeave: {
        description: "Remove this buff when the target leaves the party / clan that granted it (party-aura buffs)."
    },
    irreplaceableBuff: {
        description:
            "If true, this buff can't be overwritten by another of the same abnormalType, and cancel / cleanse can't strip it."
    },

    blockedInOlympiad: { description: "If true, the skill can't be used inside an Olympiad match." },
    removedOnAnyActionExceptMove: {
        description:
            "Buff drops the moment the target does anything but move — attack, cast, sit, pick up, etc. (stealth / hide buffs)."
    },
    removedOnDamage: { description: "Buff drops as soon as the target takes damage (meditation / channel buffs)." },
    removedOnUnequipWeapon: {
        description: "Buff drops if the target unequips their weapon (weapon-mastery / stance buffs)."
    },
    excludedFromCheck: {
        description:
            'Skip the "does the character actually own this skill" validation on use — for skills granted transiently ' +
            "(transformations, items, NPC casts)."
    },
    withoutAction: {
        description: "Cast with no animation / action lock — instant utility skills, item-triggered casts."
    },
    blockActionUseSkill: {
        description: "While this buff is on the target, it can't use other skills (skill-lock debuff)."
    },
    isNecessaryToggle: {
        description: "Toggle the engine treats as mandatory — exempt from the usual auto-cancel-on-X toggle clearing."
    },
    canDoubleCast: {
        description: "Eligible for the double-cast mechanic (fires twice in one action). Pairs with doubleCastSkill."
    },
    canCastWhileDisabled: {
        description: "Usable even while the caster is rooted / stunned / silenced (escape skills, cleanses)."
    },
    isSharedWithSummon: {
        description: "If true (default), the caster's servitor / pet inherits this passive or buff too."
    },
    isSuicideAttack: { description: "Kills or heavily damages the caster on use (kamikaze skills)." },
    isRecoveryHerb: {
        description: "Marks this as a recovery-herb pickup effect — instant HP/MP/CP from a dropped herb."
    },
    isMentoring: { description: "Mentor-system skill — only usable on / by a bonded mentor or mentee." },
    isTriggeredSkill: {
        description:
            "Not directly castable — fired by another skill / effect (the TriggerSkill* handlers). Doesn't appear on the skill bar."
    },
    isHidingMessages: { description: 'Suppress the "X used" and buff start / finish system messages for this skill.' },

    channelingSkillId: {
        description: "Skill applied on every channeling tick — the actual payload of a CA*-type (channeled) skill."
    },
    channelingTickInterval: { description: "Seconds between channeling ticks.", unit: "seconds" },
    channelingStart: { description: "Delay before the first channeling tick fires.", unit: "seconds" },

    toggleGroupId: {
        description:
            "Mutually-exclusive toggle group — activating this toggle deactivates the others in the group. -1 = no group."
    },
    attachToggleGroupId: {
        description: "While this toggle is active it also enables an attached toggle group. -1 = none."
    },
    doubleCastSkill: {
        description: "Skill id cast as the second half of a double-cast (see canDoubleCast). 0 = none."
    },
    alternateRangedSkillId: {
        description: "Skill id used instead when the caster has a ranged weapon equipped. 0 = none."
    },
    alternateMeleeSkillId: {
        description: "Skill id used instead when the caster has a melee weapon equipped. 0 = none."
    },
    alternateEnemySkillId: { description: "Skill id used instead when the target is hostile. 0 = none." },
    alternateAllySkillId: { description: "Skill id used instead when the target is friendly. 0 = none." },

    fanRange: {
        description:
            "Cone geometry for FAN-type affectScope: a `;`-separated list of numbers describing the cone's start angle, " +
            "spread, and reach."
    },
    affectHeight: {
        description:
            "Vertical band the AoE affects, as `minZ;maxZ` offsets from the origin — e.g. keeps a ground AoE from hitting flyers."
    },

    displayInList: {
        description:
            "If false, the skill is hidden from the character's skill-list UI (engine skills, passives, sub-skills). Default true."
    }
};

export function helpFor(tag: string): FieldHelp | null {
    return FIELD_HELP[tag] ?? null;
}

export function rootHelpFor(tag: string): FieldHelp | null {
    return ROOT_HELP[tag] ?? null;
}
