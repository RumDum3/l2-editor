# Lineage II Editor

A desktop editor for Lineage II server and client data. Built with Tauri, Rust, and React.

> Early development. Expect rough edges and breaking changes.

## What it does

- **World view.** Browse the radar map, see server zones, NPC spawns, and hunting areas overlaid in their actual world positions.
- **Geometry editing.** Drag spawn points, hunting-zone markers, and zone polygon vertices directly on the map.
- **Skill editor.** Round-trip edits to `Skillgrp` / `SkillName` / related skill-tree dats with safe re-encryption.
- **Generic dat editor.** Import any supported `.dat`, query rows, apply locator-based edits, save back.
- **Tier-2 dat support.** Hunting zones, class trees, skill enchant tables, and friends.
- **Texture extraction.** Decrypts and decodes `.utx` textures (DXT/P8/RGBA) for the map view and inspection.

## Compatibility

Tested against a single client + server pair so far. Other chronicles and forks will likely need minor adjustments before they parse cleanly.

| | Tested | Status |
|---|---|---|
| **Client** | Superion, protocol revision **502** | Working |
| **Server pack** | L2J Mobius **Superion** | Working |

If you try a different chronicle or server pack and want it supported, open an issue with a sample dat and the protocol revision.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind, Leaflet.
- **Backend:** Rust, Tauri 2, rusqlite (cache), quick-xml, rayon.
- **Cipher / format core:** [`dat_engine`](./dat_engine) - a standalone Rust crate handling Lineage 2's Lineage2Ver1xx/4xx/6xx/8xx encryption and the schema-driven dat format.

## Getting started

Prereqs: a recent Rust toolchain, Node 20+, and `pnpm`.

```bash
pnpm install
pnpm tauri dev      # run in dev mode
pnpm tauri build    # produce a release binary
```

Point the app at your L2 client and server data folders in Settings. Open the **World** tab to start exploring.

## Credits

Built on top of years of community reverse-engineering. Special thanks to:

- **[MobiusDevelopment/l2clientdat](https://github.com/MobiusDevelopment/l2clientdat)** for the original reference implementation of the Lineage 2 client dat ciphers and schema definitions. The Rust port in `dat_engine` is a direct descendant of that work.
- The wider L2J / L2J Mobius community for the server-side data formats this editor operates on.

## Contributing

Contributions are welcome. A few notes to keep things smooth:

- **Discuss large changes first.** Open an issue before sweeping refactors so we can agree on direction.
- **Style.** TypeScript is formatted by Biome (`pnpm check`), Rust by `cargo fmt`. Both run cleanly before you push.
- **Tests / verification.** No formal test suite yet; please describe how you verified your change in the PR.
- **Comments.** Prefer self-explanatory code. Keep surviving comments rare and to a single line.
- **Conventional-ish commits** are appreciated but not enforced (`feat: ...`, `fix: ...`, `world: ...`).

To get up and running for development:

```bash
git clone https://github.com/<your-fork>/lineage2_editor.git
cd lineage2_editor
pnpm install
pnpm tauri dev
```

Found a bug or want a feature? Open an issue with reproduction steps or a clear use case.

## License

Released under the **[GNU General Public License v3.0](./LICENSE)**.

This choice reflects the project's heritage: `dat_engine` is a Rust port of work originally published by the [MobiusDevelopment](https://github.com/MobiusDevelopment/l2clientdat) team, and the wider L2J / L2J Mobius server ecosystem also distributes under GPL-3.0. Contributing means agreeing that your contribution is offered under GPL-3.0.
