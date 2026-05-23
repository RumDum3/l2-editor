const HELP: Record<string, string> = {
    classId: "Which class this template belongs to (matches a <class classId> in classList.xml).",
    staticData:
        "Per-class base values that don't change with level — primary stats, base atk/def/speeds, collision, the creation spawn point.",
    lvlUpgainData:
        "Per-level table: max HP/MP/CP and their regen, indexed by character level. Levels above the last entry inherit the previous row's values.",

    baseSTR: "Base STR — drives physical attack / weapon damage. Modified at runtime by items and buffs.",
    baseDEX: "Base DEX — drives attack & cast speed, accuracy, evasion, crit chance.",
    baseCON: "Base CON — drives max HP/CP, HP regen, and resistance to several debuffs.",
    baseINT: "Base INT — drives magic attack.",
    baseWIT: "Base WIT — drives casting speed, magic crit chance, and magic-skill cast time.",
    baseMEN: "Base MEN — drives max MP, MP regen, and magic-debuff resistance.",
    baseLUC: "Base LUC — affects drop/spoil chance and some luck-based mechanics (modern chronicles).",
    baseCHA: "Base CHA — affects vitality / fame / certain reward rates (modern chronicles).",

    physicalAbnormalResist: "Flat % resistance to physical debuffs landing on this class.",
    magicAbnormalResist: "Flat % resistance to magical debuffs landing on this class.",

    creationPoints:
        "World location(s) a newly-created character of this class spawns at — one <node x y z/> per candidate point (one is picked at creation).",
    node: "A spawn coordinate (x, y, z) in world units.",

    basePAtk: "Base physical attack power before STR / weapon / buffs are applied.",
    baseMAtk: "Base magic attack power before INT / weapon / buffs are applied.",
    baseCritRate:
        "Base physical critical-hit rate (L2J units: roughly 1/10 of a percent — e.g. 4 ≈ 0.4 base, scaled by DEX).",
    baseMCritRate: "Base magic critical-hit rate (scaled by WIT).",
    basePSkillCritRate: "Base critical rate for physical *skills* (separate from auto-attack crit).",
    baseAtkType:
        "Weapon type assumed when nothing is equipped (FIST / SWORD / BLUNT / DAGGER / BOW / …) — affects unarmed animation and the no-weapon attack stats below.",
    basePAtkSpd: "Base physical attack speed with no weapon (higher = faster swings).",
    baseMAtkSpd: "Base casting speed with no weapon (higher = faster casts).",
    baseAtkRange: "Melee reach with no weapon, in world units.",
    baseRndDam: "Base random-damage spread, in % — physical hits roll ±this around the average.",
    baseCanPenetrate: "Base shield-penetration value (0 for player classes; relevant for some NPCs).",
    baseDamRange: "Hit-box geometry for unarmed attacks — the cone/box a swing covers.",
    verticalDirection: "Vertical offset of the unarmed attack hit-box.",
    horizontalDirection: "Horizontal offset of the unarmed attack hit-box.",
    distance: "Forward reach of the unarmed attack hit-box, in world units.",
    width: "Width of the unarmed attack hit-box, in world units.",

    basePDef:
        "Base physical defence each armour slot contributes while that slot is empty (so a naked character still has some P.Def).",
    baseMDef: "Base magic defence each jewel slot contributes while that slot is empty.",
    chest: "P.Def from an empty chest slot.",
    legs: "P.Def from an empty legs slot.",
    head: "P.Def from an empty head slot.",
    feet: "P.Def from empty boots.",
    gloves: "P.Def from empty gloves.",
    underwear: "P.Def from an empty underwear/shirt slot.",
    cloak: "P.Def from an empty cloak slot.",
    rear: "M.Def from an empty right-earring slot.",
    lear: "M.Def from an empty left-earring slot.",
    rfinger: "M.Def from an empty right-ring slot.",
    lfinger: "M.Def from an empty left-ring slot.",
    neck: "M.Def from an empty necklace slot.",

    baseMoveSpd: "Base movement speeds (before run/movement buffs and the dash modifier).",
    walk: "Walk speed.",
    run: "Run speed (the usual move speed).",
    slowSwim: "Swim speed while not sprinting underwater.",
    fastSwim: "Swim speed while sprinting underwater.",
    baseBreath: "Underwater air supply — seconds you can stay submerged before drowning damage starts.",
    baseSafeFall: "Maximum fall distance (world units) that deals no fall damage.",
    collisionMale:
        "Collision capsule for male characters of this class (radius + height) — affects pathing and how close others can stand.",
    collisionFemale: "Collision capsule for female characters of this class.",
    radius: "Collision cylinder radius, in world units.",
    height: "Collision cylinder height, in world units.",

    level: "Character level this row applies to (the `val` attribute). Levels past the last row inherit the previous row's numbers.",
    hp: "Max HP at this level, before CON / items / buffs are layered on.",
    mp: "Max MP at this level, before MEN / items / buffs.",
    cp: "Max CP at this level, before CON / items / buffs.",
    hpRegen: "HP regenerated per regen tick at this level (further modified by CON, sitting, zones, etc.).",
    mpRegen: "MP regenerated per regen tick at this level.",
    cpRegen: "CP regenerated per regen tick at this level."
};

export function templateHelpFor(tag: string): string | null {
    return HELP[tag] ?? null;
}
