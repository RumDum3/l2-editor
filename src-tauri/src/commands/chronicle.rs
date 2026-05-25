use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChronicleInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub ordinal: u32,
    pub protocol: Option<u32>,
    pub family: &'static str,
    pub definition_file: Option<&'static str>,
}

pub const CHRONICLES: &[ChronicleInfo] = &[
    ChronicleInfo { id: "Prelude",              label: "Prelude",                                            ordinal: 0,  protocol: None,      family: "ancient",        definition_file: None },
    ChronicleInfo { id: "HarbingersOfWar",      label: "C1 Harbingers of War",                               ordinal: 1,  protocol: None,      family: "ancient",        definition_file: None },
    ChronicleInfo { id: "AgeOfSplendor",        label: "C2 Age of Splendor",                                 ordinal: 2,  protocol: None,      family: "ancient",        definition_file: None },
    ChronicleInfo { id: "RiseOfDarkness",       label: "C3 Rise of Darkness",                                ordinal: 3,  protocol: None,      family: "ancient",        definition_file: None },
    ChronicleInfo { id: "ScionsOfDestiny",      label: "C4 Scions of Destiny",                               ordinal: 4,  protocol: None,      family: "pre-awakening",  definition_file: Some("04_scions_of_destiny.xml") },
    ChronicleInfo { id: "OathOfBlood",          label: "C5 Oath of Blood",                                   ordinal: 5,  protocol: None,      family: "pre-awakening",  definition_file: None },
    ChronicleInfo { id: "Interlude",            label: "CT0 Interlude",                                      ordinal: 6,  protocol: None,      family: "pre-awakening",  definition_file: Some("06_interlude.xml") },
    ChronicleInfo { id: "TheKamael",            label: "C6 The Kamael",                                      ordinal: 7,  protocol: None,      family: "pre-awakening",  definition_file: None },
    ChronicleInfo { id: "Hellbound",            label: "Hellbound",                                          ordinal: 8,  protocol: None,      family: "pre-awakening",  definition_file: None },
    ChronicleInfo { id: "Gracia",               label: "Gracia",                                             ordinal: 9,  protocol: None,      family: "pre-awakening",  definition_file: None },
    ChronicleInfo { id: "GraciaPlus",           label: "Gracia Plus",                                        ordinal: 10, protocol: None,      family: "pre-awakening",  definition_file: None },
    ChronicleInfo { id: "GraciaFinal",          label: "Gracia Final",                                       ordinal: 11, protocol: None,      family: "pre-awakening",  definition_file: None },
    ChronicleInfo { id: "Epilogue",             label: "CT2.4 Epilogue",                                     ordinal: 12, protocol: None,      family: "pre-awakening",  definition_file: Some("12_epilogue.xml") },
    ChronicleInfo { id: "FreyaTauti",           label: "CT2.5 Freya / Tauti",                                ordinal: 13, protocol: None,      family: "pre-awakening",  definition_file: None },
    ChronicleInfo { id: "HighFive",             label: "CT2.6 High Five",                                    ordinal: 14, protocol: Some(146), family: "pre-awakening",  definition_file: Some("14_high_five.xml") },
    ChronicleInfo { id: "Awakening",            label: "Awakening (Goddess of Destruction)",                 ordinal: 15, protocol: Some(152), family: "awakening",      definition_file: Some("15_awakening.xml") },
    ChronicleInfo { id: "Lindvior",             label: "Lindvior",                                           ordinal: 16, protocol: Some(165), family: "awakening",      definition_file: Some("20_lindvior.xml") },
    ChronicleInfo { id: "Valiance",             label: "Valiance",                                           ordinal: 17, protocol: Some(196), family: "awakening",      definition_file: Some("21_valiance.xml") },
    ChronicleInfo { id: "Ertheia",              label: "Ertheia (Classic 1.0)",                              ordinal: 18, protocol: Some(216), family: "classic",        definition_file: Some("22_ertheia.xml") },
    ChronicleInfo { id: "Underground",          label: "Underground (Age of Splendor)",                      ordinal: 19, protocol: Some(228), family: "classic",        definition_file: Some("25_underground.xml") },
    ChronicleInfo { id: "Helios",               label: "Helios (Saviors)",                                   ordinal: 20, protocol: Some(267), family: "classic",        definition_file: Some("26_helios.xml") },
    ChronicleInfo { id: "GrandCrusade",         label: "Grand Crusade (Classic Zaken)",                      ordinal: 21, protocol: Some(271), family: "classic",        definition_file: Some("27_grand_crusade.xml") },
    ChronicleInfo { id: "Salvation",            label: "Salvation (Classic Antharas)",                       ordinal: 22, protocol: Some(285), family: "classic",        definition_file: Some("28_salvation.xml") },
    ChronicleInfo { id: "EtinasFate",           label: "Etina's Fate (Seven Signs)",                         ordinal: 23, protocol: Some(298), family: "classic",        definition_file: Some("29_etinas_fate.xml") },
    ChronicleInfo { id: "Fafurion",             label: "Fafurion (Secret of Empire)",                        ordinal: 24, protocol: Some(338), family: "classic",        definition_file: Some("30_fafurion.xml") },
    ChronicleInfo { id: "PreludeOfWar",         label: "Prelude of War (Classic Saviors 2.9.5)",             ordinal: 25, protocol: Some(358), family: "classic",        definition_file: Some("31_prelude_of_war.xml") },
    ChronicleInfo { id: "PreludeOfWar2",        label: "Prelude of War Pt. 2 (Classic Kamael)",              ordinal: 26, protocol: Some(388), family: "classic",        definition_file: Some("32_prelude_of_war_2.xml") },
    ChronicleInfo { id: "PreludeOfWar3",        label: "Prelude of War Pt. 3 (Essence Death Knight)",        ordinal: 27, protocol: Some(412), family: "essence",        definition_file: Some("33_prelude_of_war_3.xml") },
    ChronicleInfo { id: "Homunculus",           label: "Homunculus (Essence Fluffy Reinforcement)",          ordinal: 28, protocol: Some(420), family: "essence",        definition_file: Some("34_homunculus.xml") },
    ChronicleInfo { id: "Homunculus2",          label: "Homunculus Ch. 2 (Essence Dwelling of Spirits)",     ordinal: 29, protocol: Some(428), family: "essence",        definition_file: Some("35_homunculus_2.xml") },
    ChronicleInfo { id: "ReturnOfTheQueenAnt",  label: "Return of the Queen Ant (Essence Sylph)",            ordinal: 30, protocol: Some(440), family: "essence",        definition_file: Some("36_return_of_the_queen_ant.xml") },
    ChronicleInfo { id: "ReturnOfTheQueenAnt2", label: "Return of the Queen Ant Ch. 2 (Essence Frost Lord)", ordinal: 31, protocol: Some(447), family: "essence",        definition_file: Some("37_return_of_the_queen_ant_2.xml") },
    ChronicleInfo { id: "MasterClass",          label: "Master Class (Essence Battle Chronicle)",            ordinal: 32, protocol: Some(454), family: "essence",        definition_file: Some("38_master_class.xml") },
    ChronicleInfo { id: "MasterClass2",         label: "Master Class Ch. 2 (Essence Vanguard)",              ordinal: 33, protocol: Some(458), family: "essence",        definition_file: Some("39_master_class_2.xml") },
    ChronicleInfo { id: "MasterClass3",         label: "Master Class Ch. 3 (Essence Crusader)",              ordinal: 34, protocol: Some(465), family: "essence",        definition_file: Some("40_master_class_3.xml") },
    ChronicleInfo { id: "TheSourceOfFlame",     label: "The Source of Flame (Essence Assassin)",             ordinal: 35, protocol: Some(471), family: "essence",        definition_file: Some("41_the_source_of_flame.xml") },
    ChronicleInfo { id: "AgeOfMagic",           label: "Age of Magic (Aztacans Temple)",                     ordinal: 36, protocol: Some(478), family: "essence",        definition_file: Some("42_age_of_magic.xml") },
    ChronicleInfo { id: "Shinemaker",           label: "Shinemaker (Seven Signs)",                           ordinal: 37, protocol: Some(485), family: "essence",        definition_file: Some("43_shinemaker.xml") },
    ChronicleInfo { id: "PathOfRogue",          label: "Path of Rogue (High Elves)",                         ordinal: 38, protocol: Some(491), family: "essence",        definition_file: Some("44_path_of_rogue.xml") },
    ChronicleInfo { id: "ShieldOfKingdom",      label: "Shield of Kingdom (Heart of Volcano)",               ordinal: 39, protocol: Some(497), family: "essence",        definition_file: Some("45_shield_of_kingdom.xml") },
    ChronicleInfo { id: "Superion",             label: "Superion (Guardians)",                               ordinal: 40, protocol: Some(502), family: "essence",        definition_file: Some("46_superion.xml") },
    ChronicleInfo { id: "OrcVillage",           label: "Orc Village (Warg)",                                 ordinal: 41, protocol: Some(510), family: "essence",        definition_file: Some("47_orc_village.xml") },
];

// Newest chronicle whose known protocol is <= the probed value.
pub fn chronicle_from_protocol(protocol: u32) -> &'static ChronicleInfo {
    let mut best: Option<&ChronicleInfo> = None;
    for c in CHRONICLES.iter() {
        let Some(p) = c.protocol else { continue };
        if p <= protocol {
            match best {
                Some(b) if b.protocol.unwrap_or(0) >= p => {}
                _ => best = Some(c),
            }
        }
    }
    best.unwrap_or_else(|| chronicle_by_id("Superion").unwrap())
}

pub fn chronicle_by_id(id: &str) -> Option<&'static ChronicleInfo> {
    CHRONICLES.iter().find(|c| c.id.eq_ignore_ascii_case(id))
}

#[allow(dead_code)]
pub fn ordinal_of(id: &str) -> Option<u32> {
    chronicle_by_id(id).map(|c| c.ordinal)
}

#[tauri::command]
pub fn list_chronicles() -> Vec<ChronicleInfo> {
    CHRONICLES.to_vec()
}

#[tauri::command]
pub fn infer_chronicle(protocol: u32) -> ChronicleInfo {
    *chronicle_from_protocol(protocol)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChronicleDatEntry {
    pub pattern: String,
    pub schema_name: String,
    pub introduced_version: String,
}

#[tauri::command]
pub fn chronicle_dats(chronicle_id: String) -> Result<Vec<ChronicleDatEntry>, String> {
    let Some(info) = chronicle_by_id(&chronicle_id) else {
        return Err(format!("unknown chronicle: {chronicle_id}"));
    };
    let Some(def_file) = info.definition_file else {
        return Ok(Vec::new());
    };
    let path = dat_engine::data_dir().join("structure").join(def_file);
    let table = dat_engine::dispatch::load_dispatch(&path)
        .map_err(|e| format!("loading {}: {e}", path.display()))?;
    Ok(table
        .entries
        .into_iter()
        .map(|e| ChronicleDatEntry {
            pattern: e.pattern,
            schema_name: e.schema_name,
            introduced_version: e.chronicle,
        })
        .collect())
}
