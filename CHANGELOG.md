# Changelog

All notable changes to L2 Editor are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Add entries to the `[Unreleased]` section as you work. When cutting a release, `pnpm release <version>` moves them into a dated section automatically.

## [Unreleased]

### Added
-

### Changed
-

### Fixed
-

### Removed
-

## [0.2.0] - 2026-05-25

### Added
- NPCs workspace: new top-level category. Browses every NPC under `data/stats/npcs/`, deduped by name+level+type with variant-id chips when multiple ids share a name.
- Full structured NPC XML editor with tabs for Identity, Stats, Status, AI, Skills, Drops, Fake Player, Parameters, Equipment, Rewards, Collision, Misc, Spawns, and Model. Every field individually editable; enums (race, sex, npc.type, weapon type, ai type, attribute element, mpReward type/affects) surfaced as dropdowns; unknown sections shown as "click to add" stubs.
- NPC skills tab uses the shared skill catalog with click-to-inspect modal and a jump arrow that opens the skill in the Skills workspace.
- NPC spawn point editor: drag single-point NPC spawns on the world map; undo/redo + writeback to the source `data/spawns/` XML.
- Client tier-2 dat support: NpcName, NpcGrp, NpcString, NPCTeleporter. NpcName auto-syncs server↔client when names diverge.
- `model_engine` Rust crate (sibling to `dat_engine`): UE2 package parser (decrypts L2 `.ukx`/`.utx`/`.usx` via dat_engine's cipher), L2 v133 SkeletalMesh decoder for packed-position vertices, per-NPC mesh resolver via `NpcGrp.dat`, package file index cached per client root.
- Model tab in the NPC editor: live three.js point-cloud render of the decoded mesh with bounding box, color-by-height shading, orbit camera, and auto-frame to the actual cloud extents. Includes a dev probe for byte-level package inspection (hex / u32 / f32 views).
- Chronicle support: 42 chronicles from Prelude through Orc Village, selectable manually in Settings or auto-inferred from the L2 protocol probe. Each chronicle carries an ordinal + family (ancient / pre-awakening / awakening / classic / essence).
- Schema-driven tier-2 dat availability: at runtime the app reads `dat_engine/data/structure/<chronicle>.xml` to learn which dats exist in the current chronicle. "Client dats by chronicle" panel in Settings shows available / loaded / missing per dat.
- Shared drift component family (`DriftBadge` inline pill, `DriftMarker` bare `!`, `DriftBanner` panel) backed by a structured `Drift` type that names exactly which field disagrees and what the server vs client values are. Used across NPCs, Classes, Skills, and SkillName.

### Changed
- Sidebar and Dashboard: added NPCs category alongside Classes / Experience / World.
- All client folder lookups (Animations, StaticMeshes, Textures, SysTextures, system, L2.exe) are case-insensitive.
- The World category is grayed out when `L2_RadarMap.utx` is missing from the client; the rest of the editor still works without a world map.
- The L2 protocol probe only runs for chronicles Ertheia or newer. Older builds (HighFive, Gracia, Interlude, etc.) don't support `-L2ProtocolVersion` and would just time out.
- Skill lint's "unknown value" checks for enums and effect/condition handlers are gated to Helios+ chronicles. The catalog is L2J Mobius Superion-era; on older chronicles those checks would generate false positives for legacy idioms (e.g. `AURA`, `CON`, `Stun`).
- Drift detection equality now normalizes whitespace, NBSP/zero-width characters, and Unicode (NFC), so values that look identical no longer trigger false drift.
- Per-chronicle tier-2 dat availability is now derived from dat_engine's structure XMLs instead of hardcoded `minChronicle` annotations; adding a chronicle is a data change, not a code edit.

### Fixed
- Drift indicators previously said only "client out of sync" with no detail; they now name the field, both values, and the source dat.
- Auto-import discovery loop silently skips dats not present in the user's client instead of logging misleading errors.

## [0.1.0] - 2026-05-24

### Added
- Initial public release.
- World map view with radarmap tile stitching driven by `MinimapRegion.dat`.
- Zone polygon overlay with per-type color and filter panel.
- Region tile click opens a two-column info modal: cropped tile image left, Zones / NPCs tabs right.
- Zone editor: click Edit in the modal to drag polygon vertices on the live map, with real-time polygon redraw, undo/redo, and writeback to the source XML file.
- Skill, SkillName, and tier-2 dat editors (round-trip with safe re-encryption).
- Generic dat editor for any supported `.dat`.
- L2 client texture extraction (`.utx` decryption + DXT/P8/RGBA decode).
- Portable Windows binary distribution.
