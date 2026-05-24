# Changelog

All notable changes to L2 Editor are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Add entries to the `[Unreleased]` section as you work. When cutting a release, `pnpm release <version>` moves them into a dated section automatically.

## [Unreleased]

### Added
- release: pnpm release / pnpm note workflow



### Changed
-

### Fixed
-

### Removed
-

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
