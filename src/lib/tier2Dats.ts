export type DatChronicle = "classic" | "modern" | "any";

export type Tier2DatEntry = {
    key: string;
    label: string;
    description: string;
    schemaName: string;
    pickerTitle: string;
    defaultSubfolder: string;
    indexField?: string;
    chronicle?: DatChronicle;

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
        chronicle: "any"
    },
    {
        key: "skill_acquire",
        label: "Skill acquire",
        description: "Class-level learning tables: who learns what at what level for how much SP.",
        schemaName: "skillacquire",
        pickerTitle: "Pick SkillAcquire.dat (under <client>/system/)",
        defaultSubfolder: "system",
        chronicle: "classic"
    },
    {
        key: "replace_skill_icon",
        label: "Replace skill icon",
        description: "Per-skill icon overrides (ReplaceSkillIcon.dat).",
        schemaName: "replaceskillicon",
        pickerTitle: "Pick ReplaceSkillIcon.dat",
        defaultSubfolder: "system",
        chronicle: "classic"
    },
    {
        key: "alter_skill_data",
        label: "Alter skills",
        description: "Origin↔alter pairs — chains where one skill morphs into another (AlterSkillData.dat).",
        schemaName: "alterskilldata",
        pickerTitle: "Pick AlterSkillData.dat",
        defaultSubfolder: "system",
        indexField: "origin_skill_id",
        chronicle: "any"
    },
    {
        key: "skill_enchant_setting",
        label: "Skill enchant settings",
        description: "Enchant route definitions per skill (SkillEnchantSetting.dat).",
        schemaName: "SkillEnchantSetting",
        pickerTitle: "Pick SkillEnchantSetting.dat",
        defaultSubfolder: "system",
        chronicle: "classic"
    },
    {
        key: "skill_enchant_charge",
        label: "Skill enchant costs",
        description: "SP / adena required for each enchant level (SkillEnchantCharge.dat).",
        schemaName: "skillenchantcharge",
        pickerTitle: "Pick SkillEnchantCharge.dat",
        defaultSubfolder: "system",
        chronicle: "classic"
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
        chronicle: "any"
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
        chronicle: "any"
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
        chronicle: "any"
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
        chronicle: "any"
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
        chronicle: "any"
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
        chronicle: "any"
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
        chronicle: "any"
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
        chronicle: "any"
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
        chronicle: "any"
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
        chronicle: "any"
    }
];

export function getTier2Entry(key: string): Tier2DatEntry | undefined {
    return TIER2_DATS.find((e) => e.key === key);
}
