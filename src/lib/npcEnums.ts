export const RACES = [
    "ANGEL",
    "ANIMAL",
    "BEAST",
    "BUG",
    "CONSTRUCT",
    "DEMONIC",
    "DIVINE",
    "DRAGON",
    "DWARF",
    "ELEMENTAL",
    "ELF",
    "ETC",
    "FAIRY",
    "GIANT",
    "HUMAN",
    "HUMANOID",
    "KAMAEL",
    "MAGICCREATURE",
    "MERCENARY",
    "NONE",
    "ORC",
    "PLANT",
    "SIEGE_WEAPON",
    "SPIRIT",
    "UNDEAD"
] as const;

export const SEXES = ["MALE", "FEMALE", "ETC"] as const;

export const WEAPON_TYPES = [
    "NONE",
    "SWORD",
    "BLUNT",
    "DAGGER",
    "BOW",
    "POLE",
    "ETC",
    "FIST",
    "DUAL",
    "DUALFIST",
    "BIGSWORD",
    "PET",
    "ROD",
    "BIGBLUNT",
    "CROSSBOW",
    "RAPIER",
    "ANCIENTSWORD",
    "FLAG",
    "FUKIYA",
    "MUSIC",
    "PISTOLS",
    "TWOHANDCROSSBOW",
    "OWNTHING"
] as const;

export const ATTRIBUTE_ELEMENTS = ["FIRE", "WATER", "WIND", "EARTH", "HOLY", "DARK", "NONE"] as const;

export const MP_REWARD_TYPES = ["DIFF", "PER"] as const;

export const MP_REWARD_AFFECTS = ["SOLO", "PARTY"] as const;

export const AI_TYPES = [
    "FIGHTER",
    "ARCHER",
    "BALANCED",
    "MAGE",
    "HEALER",
    "CORPSE",
    "MELEE",
    "SHOOTER",
    "CASTER",
    "TANK"
] as const;

export const NPC_TYPES = [
    "Folk",
    "Monster",
    "Merchant",
    "Warehouse",
    "Auctioneer",
    "Teleporter",
    "Trainer",
    "Fisherman",
    "ClanHallManager",
    "ClassMaster",
    "CastleChamberlain",
    "VillageMaster",
    "RaidBoss",
    "GrandBoss",
    "ChestMonster",
    "FeedableBeast",
    "GuardMonster",
    "FriendlyMob",
    "Guard",
    "Defender",
    "SiegeGuard",
    "FortCommander",
    "Doorman",
    "Artefact",
    "Trap",
    "Decoy",
    "Pet",
    "Servitor",
    "Summon",
    "FlyMonster",
    "Quest",
    "ControllableMob",
    "Boss",
    "BroadcastingTower",
    "RaceManager",
    "Npc"
] as const;

export type Race = (typeof RACES)[number];
export type Sex = (typeof SEXES)[number];
export type WeaponType = (typeof WEAPON_TYPES)[number];
export type AttributeElement = (typeof ATTRIBUTE_ELEMENTS)[number];
export type MpRewardType = (typeof MP_REWARD_TYPES)[number];
export type MpRewardAffects = (typeof MP_REWARD_AFFECTS)[number];
export type AiType = (typeof AI_TYPES)[number];
export type NpcType = (typeof NPC_TYPES)[number];
