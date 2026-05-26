import { invoke } from "@tauri-apps/api/core";

export type AppConfig = {
    dataRoot: string;
    clientRoot: string;
    skillNamesDatPath: string;
    skillgrpDatPath: string;
    tier2DatPaths?: Record<string, string>;
    clientProtocol?: number | null;
    chronicleId?: string | null;
};

export type ChronicleInfo = {
    id: string;
    label: string;
    ordinal: number;
    protocol: number | null;
    family: "ancient" | "pre-awakening" | "awakening" | "classic" | "essence";
    definitionFile: string | null;
};

export type ChronicleDatEntry = {
    pattern: string;
    schemaName: string;
    introducedVersion: string;
};

export type XmlFileEntry = {
    name: string;
    path: string;
    rangeFrom: number | null;
    rangeTo: number | null;
};

export type ClientDatPaths = {
    skillgrp: string | null;
    skillName: string | null;
    tier2: Record<string, string>;
};

export const ipc = {
    readConfig: () => invoke<AppConfig>("read_config"),
    writeConfig: (cfg: AppConfig) => invoke<void>("write_config", { cfg }),
    readUiPrefs: () => invoke<Record<string, unknown>>("read_ui_prefs"),
    writeUiPrefs: (prefs: Record<string, unknown>) => invoke<void>("write_ui_prefs", { prefs }),
    readXml: (path: string) => invoke<string>("read_xml", { path }),
    writeXml: (path: string, content: string) => invoke<void>("write_xml", { path, content }),
    listXmlFiles: (folder: string, recursive = false) =>
        invoke<XmlFileEntry[]>("list_xml_files", { folder, recursive }),
    loadWorldSpawns: (dataRoot: string) => invoke<WorldSpawns>("load_world_spawns", { dataRoot }),
    probeL2Protocol: (clientRoot: string) => invoke<number>("probe_l2_protocol", { clientRoot }),
    listChronicles: () => invoke<ChronicleInfo[]>("list_chronicles"),
    inferChronicle: (protocol: number) => invoke<ChronicleInfo>("infer_chronicle", { protocol }),
    chronicleDats: (chronicleId: string) => invoke<ChronicleDatEntry[]>("chronicle_dats", { chronicleId }),
    readServerProtocols: (dataRoot: string) => invoke<number[]>("read_server_protocols", { dataRoot }),
    discoverClientDats: (clientRoot: string) => invoke<ClientDatPaths>("discover_client_dats", { clientRoot }),
    hasRadarMap: (clientRoot: string) => invoke<boolean>("has_radar_map", { clientRoot }),
    importSkillNames: (path: string) => invoke<SkillNameSummary>("import_skill_names", { path }),
    readSkillnameSummary: () => invoke<SkillNameSummary | null>("read_skillname_summary"),
    lookupSkillnameRows: (skillIds: number[]) =>
        invoke<Record<number, SkillnameRow[]>>("lookup_skillname_rows", { skillIds }),
    applySkillNameEdits: (skillId: number, updates: ClientFieldUpdate[]) =>
        invoke<number>("apply_skillname_edits", { skillId, updates }),
    saveSkillname: (targetPath: string) => invoke<DatSaveResult>("save_skillname", { targetPath }),
    pendingSkillnameIds: () => invoke<number[]>("pending_skillname_ids"),
    setSkillToLevel: (skillId: number, toLevel: number) =>
        invoke<SetToLevelResult>("set_skill_to_level", { skillId, toLevel }),
    importGenericDat: (key: string, path: string, indexField?: string) =>
        invoke<GenericDatSummary>("import_generic_dat", { key, path, indexField }),
    readGenericDatSummary: (key: string) => invoke<GenericDatSummary | null>("read_generic_dat_summary", { key }),
    lookupGenericRows: (key: string, skillIds: number[]) =>
        invoke<Record<number, Record<string, unknown>[]>>("lookup_generic_rows", { key, skillIds }),
    distinctGenericDatValues: (key: string, field: string) =>
        invoke<unknown[]>("distinct_generic_dat_values", { key, field }),
    dumpGenericDatRows: (key: string) => invoke<Record<string, unknown>[]>("dump_generic_dat_rows", { key }),
    applyGenericDatEdits: (key: string, locator: Record<string, unknown>, fields: Record<string, unknown>) =>
        invoke<number>("apply_generic_dat_edits", { key, locator, fields }),
    deleteGenericDatRow: (key: string, locator: Record<string, unknown>) =>
        invoke<number>("delete_generic_dat_row", { key, locator }),
    addGenericDatRow: (key: string, templateLocator: Record<string, unknown>, overrides: Record<string, unknown>) =>
        invoke<number | null>("add_generic_dat_row", { key, templateLocator, overrides }),
    pendingGenericDatIds: (key: string) => invoke<number[]>("pending_generic_dat_ids", { key }),
    saveGenericDat: (key: string, targetPath: string) => invoke<DatSaveResult>("save_generic_dat", { key, targetPath }),
    pruneLegacyDatCaches: (presentKeys: string[]) => invoke<number>("prune_legacy_dat_caches", { presentKeys }),
    importSkillgrp: (path: string) => invoke<SkillgrpSummary>("import_skillgrp", { path }),
    readSkillgrpSummary: () => invoke<SkillgrpSummary | null>("read_skillgrp_summary"),
    lookupSkillRows: (skillIds: number[]) =>
        invoke<Record<number, ClientSkillRow[]>>("lookup_skill_rows", { skillIds }),
    applySkillEdits: (skillId: number, updates: ClientFieldUpdate[]) =>
        invoke<number>("apply_skill_edits", { skillId, updates }),
    addSkillRow: (skillId: number, level: number) =>
        invoke<number | null>("add_skill_row", { skillId, level }),
    addSkillnameRow: (skillId: number, level: number, name: string) =>
        invoke<number | null>("add_skillname_row", { skillId, level, name }),
    presentSkillIds: () => invoke<number[]>("present_skill_ids"),
    presentSkillnameIds: () => invoke<number[]>("present_skillname_ids"),
    pendingSkillIds: () => invoke<number[]>("pending_skill_ids"),
    saveSkillgrp: (targetPath: string) => invoke<DatSaveResult>("save_skillgrp", { targetPath }),
    loadDat: (path: string) => invoke<LoadedDat>("load_dat", { path }),
    saveDat: (path: string, record: unknown, meta?: DatMeta) =>
        invoke<DatSaveResult>("save_dat", { path, record, meta }),
    saveZoneEdits: (edits: Array<{ filePath: string; zoneName: string; points: Array<[number, number]> }>) =>
        invoke<number>("save_zone_edits", { edits }),
    saveSpawnEdits: (
        edits: Array<{ filePath: string; npcId: number; oldX: number; oldY: number; newX: number; newY: number }>
    ) => invoke<number>("save_spawn_edits", { edits }),
    loadNpcXml: (filePath: string, npcId: number) =>
        invoke<string>("load_npc_xml", { filePath, npcId }),
    saveNpcXml: (filePath: string, npcId: number, npcXml: string) =>
        invoke<number>("save_npc_xml", { filePath, npcId, npcXml }),
    dumpPackage: (path: string, sampleSize?: number) =>
        invoke<PackageSummary>("dump_package", { path, sampleSize }),
    listPackageExports: (path: string, classFilter?: string, limit?: number) =>
        invoke<PackageExportEntry[]>("list_package_exports", { path, classFilter, limit }),
    buildPackageIndex: (clientRoot: string) =>
        invoke<PackageIndexSummary>("build_package_index", { clientRoot }),
    resolveNpcModel: (clientRoot: string, meshName: string) =>
        invoke<ResolvedNpcModel>("resolve_npc_model", { clientRoot, meshName }),
    loadSkeletalMesh: (clientRoot: string, meshName: string) =>
        invoke<MeshData>("load_skeletal_mesh", { clientRoot, meshName }),
    dumpMeshPayload: (clientRoot: string, meshName: string, nbytes?: number, offsetAfterProps?: number) =>
        invoke<MeshHexDump>("dump_mesh_payload", { clientRoot, meshName, nbytes, offsetAfterProps })
};

export type MeshHexDump = {
    exportName: string;
    payloadStart: number;
    serialOffset: number;
    serialSize: number;
    bytesDumped: number;
    hex: string;
    ascii: string;
    u32Grid: string;
    f32Grid: string;
};

export type MeshData = {
    exportName: string;
    bounds: { min: [number, number, number]; max: [number, number, number]; center: [number, number, number]; radius: number };
    positions: number[];
    triangleWedges: number[];
    triangleMaterials: number[];
    wedgeUvs: number[];
    wedgeVertexIndices: number[];
    wedgeMaterials: number[];
    materials: Array<{ flags: number; textureIndex: number }>;
    bones: Array<{
        name: string;
        flags: number;
        orientation: [number, number, number, number];
        position: [number, number, number];
        length: number;
        size: [number, number, number];
        numChildren: number;
        parentIndex: number;
    }>;
    influences: Array<{ vertexIndex: number; boneIndex: number; weight: number }>;
    serialEnd: number;
    cursorEnd: number;
    decoder: string;
    decoderConfidence: "verified" | "tentative" | "unknown";
    l2WalkerError: string | null;
    textures: Array<{ package: string; name: string }>;
    debugInfo: {
        softSectionMaterials: number[];
        rigidSectionMaterials: number[];
        propertyMaterialRefs: number[];
        textureImportCount: number;
    };
};

export type PackageIndexSummary = {
    root: string;
    packageCount: number;
    sample: string[];
};

export type ResolveStatus = "ok" | "packageNotFound" | "packageOpenFailed" | "exportNotFound" | "badMeshName";

export type ResolvedNpcModel = {
    meshName: string;
    packageStem: string;
    packagePath: string | null;
    exportPath: string;
    export: PackageExportEntry | null;
    packageVersion: number | null;
    packageLicenseeVersion: number | null;
    status: ResolveStatus;
    detail: string;
};

export type PackageExportEntry = {
    classIndex: number;
    superIndex: number;
    packageIndex: number;
    objectNameIndex: number;
    objectFlags: number;
    serialSize: number;
    serialOffset: number;
    objectName: string;
    className: string;
    fullName: string;
};

export type PackageImportEntry = {
    classPackageIndex: number;
    classNameIndex: number;
    packageIndex: number;
    objectNameIndex: number;
    classPackage: string;
    className: string;
    objectName: string;
    fullName: string;
};

export type PackageSummary = {
    path: string;
    cipherCode: number;
    version: number;
    licenseeVersion: number;
    nameCount: number;
    importCount: number;
    exportCount: number;
    exportsSample: PackageExportEntry[];
    importsSample: PackageImportEntry[];
    exportClassHistogram: Array<[string, number]>;
};

export type SkillnameRow = {
    skill_id: number;
    skill_level: number;
    skill_sublevel?: number;
    name?: string;
    desc?: string;
    desc_param?: string;
    enchant_name?: string;
    enchant_name_param?: string;
    enchant_desc?: string;
    enchant_desc_param?: string;
};

export type GenericDatSummary = {
    key: string;
    importedAt: string;
    source: string;
    rowCount: number;
    schemaName: string;
    schemaVariant: string;
    indexField: string;
};

export type NpcInfo = {
    id: number;
    name: string;
    type: string;
    level: number;
    filePath: string;
};

export type SpawnPoint = {
    npcId: number;
    x: number;
    y: number;
    count: number;
    respawn: string;
    filePath: string;
    inlineCoords: boolean;
};

export type WorldSpawns = {
    npcs: NpcInfo[];
    spawns: SpawnPoint[];
};

export type SetToLevelResult = {
    skillgrpDelta: number;
    skillnameDelta: number;
};

export type SkillNameSummary = {
    version: number;
    importedAt: string;
    source: string;
    rowCount: number;
    meta: DatMeta;
};

export type LoadedDat = {
    fileName: string;
    cipherCode: number;
    schemaName: string;
    schemaVariant: string;
    data: Record<string, unknown>;
};

export type DatMeta = {
    fileName: string;
    cipherCode: number;
    schemaName: string;
    schemaVariant: string;
    format: string | null;
};

export type DatSaveResult = {
    bytesWritten: number;
    plaintextSize: number;
    newNamesAdded: number;
};

export type SkillgrpSummary = {
    version: number;
    importedAt: string;
    source: string;
    rowCount: number;
    meta: DatMeta;
};

export type ClientFieldUpdate = {
    level: number;
    sublevel?: number;
    fields: Record<string, string | number>;
};

export type ClientSkillRow = {
    skill_id: number;
    skill_level: number;
    skill_sublevel?: number;
    icon?: string | number;
    icon_panel?: string | number;
    icon_type?: number;
    operate_type?: number;
    is_magic?: number;
    mp_consume?: number;
    hp_consume?: number;
    cast_range?: number;
    cast_style?: number;
    hit_time?: number;
    cool_time?: number;
    reuse_delay?: number;
    effect_point?: number;
    debuff?: number;
    enchant_skill_level?: number;
    abnormal_time?: number;
    target_type?: number;
    affect_scope?: number;
    [k: string]: unknown;
};
