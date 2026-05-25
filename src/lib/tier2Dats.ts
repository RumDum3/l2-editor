import type { ChronicleInfo } from "./ipc";

export const CHRONICLE = {
    PRELUDE: 0,
    HARBINGERS_OF_WAR: 1,
    AGE_OF_SPLENDOR: 2,
    RISE_OF_DARKNESS: 3,
    SCIONS_OF_DESTINY: 4,
    OATH_OF_BLOOD: 5,
    INTERLUDE: 6,
    THE_KAMAEL: 7,
    HELLBOUND: 8,
    GRACIA: 9,
    GRACIA_PLUS: 10,
    GRACIA_FINAL: 11,
    EPILOGUE: 12,
    FREYA_TAUTI: 13,
    HIGH_FIVE: 14,
    AWAKENING: 15,
    LINDVIOR: 16,
    VALIANCE: 17,
    ERTHEIA: 18,
    UNDERGROUND: 19,
    HELIOS: 20,
    GRAND_CRUSADE: 21,
    SALVATION: 22,
    ETINAS_FATE: 23,
    FAFURION: 24,
    PRELUDE_OF_WAR: 25,
    PRELUDE_OF_WAR_2: 26,
    PRELUDE_OF_WAR_3: 27,
    HOMUNCULUS: 28,
    HOMUNCULUS_2: 29,
    RETURN_OF_QUEEN_ANT: 30,
    RETURN_OF_QUEEN_ANT_2: 31,
    MASTER_CLASS: 32,
    MASTER_CLASS_2: 33,
    MASTER_CLASS_3: 34,
    SOURCE_OF_FLAME: 35,
    AGE_OF_MAGIC: 36,
    SHINEMAKER: 37,
    PATH_OF_ROGUE: 38,
    SHIELD_OF_KINGDOM: 39,
    SUPERION: 40,
    ORC_VILLAGE: 41
} as const;

export type Tier2DatEntry = {
    key: string;
    label: string;
    description: string;
    schemaName: string;
    pickerTitle: string;
    defaultSubfolder: string;
    indexField?: string;
    minChronicle?: number;
    maxChronicle?: number;
    appliesTo?: "skill" | "class" | "world" | "npc";
};

export const TIER2_DATS: Tier2DatEntry[] = [
    {
        key: "skill_soundgrp",
        label: "Skill sounds",
        description: "Cast / shot / impact sound effects per skill (SkillSoundgrp.dat).",
        schemaName: "skillsoundgrp",
        pickerTitle: "Pick SkillSoundgrp.dat (under <client>/system/)",
        defaultSubfolder: "system",
        minChronicle: CHRONICLE.SCIONS_OF_DESTINY
    },
    {
        key: "skill_acquire",
        label: "Skill acquire",
        description: "Class-level learning tables: who learns what at what level for how much SP.",
        schemaName: "skillacquire",
        pickerTitle: "Pick SkillAcquire.dat (under <client>/system/)",
        defaultSubfolder: "system",
        minChronicle: CHRONICLE.ERTHEIA
    },
    {
        key: "replace_skill_icon",
        label: "Replace skill icon",
        description: "Per-skill icon overrides (ReplaceSkillIcon.dat).",
        schemaName: "replaceskillicon",
        pickerTitle: "Pick ReplaceSkillIcon.dat",
        defaultSubfolder: "system",
        minChronicle: CHRONICLE.AWAKENING
    },
    {
        key: "alter_skill_data",
        label: "Alter skills",
        description: "Origin↔alter pairs — chains where one skill morphs into another (AlterSkillData.dat).",
        schemaName: "alterskilldata",
        pickerTitle: "Pick AlterSkillData.dat",
        defaultSubfolder: "system",
        indexField: "origin_skill_id",
        minChronicle: CHRONICLE.AWAKENING
    },
    {
        key: "skill_enchant_setting",
        label: "Skill enchant settings",
        description: "Enchant route definitions per skill (SkillEnchantSetting.dat).",
        schemaName: "SkillEnchantSetting",
        pickerTitle: "Pick SkillEnchantSetting.dat",
        defaultSubfolder: "system",
        minChronicle: CHRONICLE.ERTHEIA
    },
    {
        key: "skill_enchant_charge",
        label: "Skill enchant costs",
        description: "SP / adena required for each enchant level (SkillEnchantCharge.dat).",
        schemaName: "skillenchantcharge",
        pickerTitle: "Pick SkillEnchantCharge.dat",
        defaultSubfolder: "system",
        minChronicle: CHRONICLE.ERTHEIA
    },
    {
        key: "class_info",
        label: "Class info (client)",
        description:
            "Per-class display data the client shows in the class window: base STR/DEX/CON/INT/WIT/MEN/LUC/CHA, role, transfer degree, description (ClassInfo-*.dat). Keyed on class id; surfaces in the Classes workspace.",
        schemaName: "classinfo",
        pickerTitle: "Pick ClassInfo-<lang>.dat (under <client>/system/)",
        defaultSubfolder: "system",
        indexField: "class",
        appliesTo: "class",
        minChronicle: CHRONICLE.ERTHEIA
    },
    {
        key: "class_tree",
        label: "Class tree (client)",
        description:
            "The awakening-path chains the class-change UI draws — each row is a base class plus the chain of class ids it can become (ClassTree.dat). Keyed on the base class id.",
        schemaName: "classtree",
        pickerTitle: "Pick ClassTree.dat (under <client>/system/)",
        defaultSubfolder: "system",
        indexField: "id",
        appliesTo: "class",
        minChronicle: CHRONICLE.PRELUDE_OF_WAR
    },
    {
        key: "class_tree_desc",
        label: "Class tree descriptions (client)",
        description:
            "Two-line blurbs shown for each class in the class-change UI (ClassTreeDesc-*.dat). Keyed on class id.",
        schemaName: "classtreedesc",
        pickerTitle: "Pick ClassTreeDesc-<lang>.dat",
        defaultSubfolder: "system",
        indexField: "classID",
        appliesTo: "class",
        minChronicle: CHRONICLE.PRELUDE_OF_WAR
    },
    {
        key: "class_initial_stat",
        label: "Initial stats (client)",
        description:
            "Starting STR/DEX/CON/INT/WIT/MEN/LUC/CHA per directly-creatable class, by race and sex (CharacterInitialStatExData.dat). Keyed on class id.",
        schemaName: "characterinitialstatexdata",
        pickerTitle: "Pick CharacterInitialStatExData.dat",
        defaultSubfolder: "system",
        indexField: "class",
        appliesTo: "class",
        minChronicle: CHRONICLE.SALVATION
    },
    {
        key: "minimap_region",
        label: "Minimap regions (client)",
        description:
            "World-atlas sheet positions and sizes — what `WorldLocX`/`WorldLocY` each RadarMap_<N> sheet sits at (MinimapRegion.dat). Drives the World workspace's map layout.",
        schemaName: "minimapregion",
        pickerTitle: "Pick MinimapRegion.dat (under <client>/system/)",
        defaultSubfolder: "system",
        indexField: "regionid",
        appliesTo: "world",
        minChronicle: CHRONICLE.SCIONS_OF_DESTINY
    },
    {
        key: "hunting_zone",
        label: "Hunting areas (client)",
        description:
            "The hunting/teleport areas the in-game hunting-zone UI lists — name, recommended level range and the start-NPC location for each (HuntingZone-*.dat). Surfaces in the World workspace's region modal.",
        schemaName: "huntingzone",
        pickerTitle: "Pick HuntingZone-<lang>.dat (under <client>/system/)",
        defaultSubfolder: "system",
        indexField: "id",
        appliesTo: "world",
        minChronicle: CHRONICLE.LINDVIOR
    },
    {
        key: "npc_name",
        label: "NPC names (client)",
        description:
            "Client-side display names and titles per NPC id (NpcName-*.dat). Surfaces in the NPCs workspace; mismatches with the server are flagged.",
        schemaName: "npcname",
        pickerTitle: "Pick NpcName-<lang>.dat (under <client>/system/)",
        defaultSubfolder: "system",
        indexField: "id",
        appliesTo: "npc",
        minChronicle: CHRONICLE.SCIONS_OF_DESTINY
    },
    {
        key: "npc_grp",
        label: "NPC visuals (client)",
        description:
            "Per-NPC mesh, textures, sounds, speed and the rest of the client-only render state (NpcGrp.dat). Keyed on npc_id; surfaces in the NPCs workspace.",
        schemaName: "npcgrp",
        pickerTitle: "Pick NpcGrp.dat (under <client>/system/)",
        defaultSubfolder: "system",
        indexField: "npc_id",
        appliesTo: "npc",
        minChronicle: CHRONICLE.SCIONS_OF_DESTINY
    },
    {
        key: "npc_string",
        label: "NPC strings (client)",
        description:
            "Localized string table referenced by NPC dialogue/server messages (NpcString-*.dat). Keyed on stringID.",
        schemaName: "npcstring",
        pickerTitle: "Pick NpcString-<lang>.dat (under <client>/system/)",
        defaultSubfolder: "system",
        indexField: "stringID",
        appliesTo: "npc",
        minChronicle: CHRONICLE.HIGH_FIVE
    },
    {
        key: "npc_teleporter",
        label: "NPC teleporters (client)",
        description:
            "Per-NPC teleport anchor points and target zone ids the client uses for gatekeepers (NPCTeleporter.dat). Keyed on npc_id.",
        schemaName: "npcteleporter",
        pickerTitle: "Pick NPCTeleporter.dat (under <client>/system/)",
        defaultSubfolder: "system",
        indexField: "npc_id",
        appliesTo: "npc",
        minChronicle: CHRONICLE.ERTHEIA
    }
];

export function getTier2Entry(key: string): Tier2DatEntry | undefined {
    return TIER2_DATS.find((e) => e.key === key);
}

export function isTier2AvailableIn(
    entry: Tier2DatEntry,
    chronicle: ChronicleInfo | null,
    availableSchemas: ReadonlySet<string> | null
): boolean {
    if (availableSchemas) {
        return availableSchemas.has(entry.schemaName.toLowerCase());
    }
    if (!chronicle) return true;
    const min = entry.minChronicle ?? 0;
    const max = entry.maxChronicle ?? Number.POSITIVE_INFINITY;
    return chronicle.ordinal >= min && chronicle.ordinal <= max;
}
