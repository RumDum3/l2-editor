#!/usr/bin/env node
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
    const version = process.argv[2];
    if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
        console.error("usage: pnpm release <semver>   (e.g. pnpm release 0.2.0)");
        process.exit(1);
    }

    console.log(`[release] L2 Editor v${version}`);
    await bumpVersions(version);
    const notes = await rollChangelog(version);
    console.log("[release] running pnpm tauri build (this takes a few minutes)...");
    execSync("pnpm tauri build", { stdio: "inherit", cwd: ROOT });

    const stageDir = join(ROOT, "release-portable", `L2 Editor ${version}`);
    await rm(stageDir, { recursive: true, force: true });
    await mkdir(stageDir, { recursive: true });

    const exeSrc = join(ROOT, "target", "release", "l2_editor.exe");
    await copyFile(exeSrc, join(stageDir, "l2_editor.exe"));
    await copyFile(join(ROOT, "LICENSE"), join(stageDir, "LICENSE"));
    await writePortableReadme(stageDir, version);

    const zipPath = join(ROOT, "release-portable", `L2_Editor_${version}_portable.zip`);
    await rm(zipPath, { force: true });
    await makeZip(stageDir, zipPath);

    const hash = await sha256(zipPath);

    console.log(`
[release] done.

  Stage:     ${stageDir}
  Zip:       ${zipPath}
  SHA-256:   ${hash}
  Installer: ${join(ROOT, "target", "release", "bundle")}

  Patch notes for v${version}:
${notes
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n")}

  Next steps:
    git add -A
    git commit -m "release v${version}"
    git tag -a v${version} -m "v${version}"
    git push && git push --tags
    gh release create v${version} --notes-file <(echo "${notes.replace(/"/g, '\\"').slice(0, 200)}…") "${zipPath}"
`);
}

async function bumpVersions(version) {
    await patchJson(join(ROOT, "package.json"), (j) => {
        j.version = version;
    });
    await patchJson(join(ROOT, "src-tauri", "tauri.conf.json"), (j) => {
        j.version = version;
    });
    await patchToml(join(ROOT, "src-tauri", "Cargo.toml"), version);
}

async function patchJson(path, mutate) {
    const text = await readFile(path, "utf8");
    const data = JSON.parse(text);
    mutate(data);
    const indent = text.match(/^([ \t]+)"/m)?.[1] ?? "    ";
    await writeFile(path, `${JSON.stringify(data, null, indent)}\n`);
}

async function patchToml(path, version) {
    const text = await readFile(path, "utf8");
    const updated = text.replace(/^(\[package\][\s\S]*?\nversion\s*=\s*)"[^"]*"/m, `$1"${version}"`);
    if (text === updated) throw new Error(`could not patch version in ${path}`);
    await writeFile(path, updated);
}

async function rollChangelog(version) {
    const path = join(ROOT, "CHANGELOG.md");
    const text = await readFile(path, "utf8");
    const startMatch = text.match(/^##\s*\[Unreleased\]\s*$/m);
    if (!startMatch || startMatch.index == null) {
        throw new Error("CHANGELOG.md missing [Unreleased] section");
    }
    const sectionStart = startMatch.index + startMatch[0].length;
    const nextHeader = text.slice(sectionStart).search(/^##\s/m);
    const sectionEnd = nextHeader === -1 ? text.length : sectionStart + nextHeader;

    const raw = text.slice(sectionStart, sectionEnd).trim();
    const notes = stripEmptyBuckets(raw);
    if (!notes.trim()) {
        console.warn("[release] WARNING: [Unreleased] section is empty");
    }

    const today = new Date().toISOString().slice(0, 10);
    const emptyBuckets = "### Added\n-\n\n### Changed\n-\n\n### Fixed\n-\n\n### Removed\n-";
    const rolled =
        `${text.slice(0, sectionStart)}\n\n${emptyBuckets}\n\n## [${version}] - ${today}\n\n${notes || "- (no notes)"}\n\n${text.slice(sectionEnd).replace(/^\n*/, "")}`;
    await writeFile(path, rolled);
    return notes || "(no notes)";
}

function stripEmptyBuckets(section) {
    return section
        .split(/(?=^### )/m)
        .map((bucket) => {
            const lines = bucket.split("\n");
            const header = lines[0];
            const body = lines.slice(1).join("\n").trim();
            if (!header.startsWith("### ")) return bucket.trim();
            const items = body.split("\n").filter((l) => l.trim().startsWith("-") && l.trim() !== "-");
            return items.length ? `${header}\n${items.join("\n")}` : "";
        })
        .filter(Boolean)
        .join("\n\n");
}

async function writePortableReadme(dir, version) {
    const text = `L2 Editor ${version} (portable)
${"=".repeat(`L2 Editor ${version} (portable)`.length)}

*** BACK UP YOUR CLIENT AND SERVER FILES BEFORE USING THIS APP. ***

  L2 Editor writes back to your .dat and .xml files in place. It tries to
  be careful (atomic writes, .bak files next to saved dats), but bugs happen.
  Keep a known-good copy of your "system\\" and "data\\" folders before you
  point the editor at them.

Just run "l2_editor.exe". No installation required.

Tested against:
  Client      Superion, protocol revision 502
  Server      L2J Mobius Superion

Requirements
------------
  Windows 10 (1803+) or Windows 11. The WebView2 runtime is pre-installed
  on these versions. If you are on an older Windows, install WebView2 from
  https://developer.microsoft.com/microsoft-edge/webview2/

First-run notes
---------------
  Windows SmartScreen may warn "Windows protected your PC" because this
  binary is unsigned. Click "More info" then "Run anyway". The warning goes
  away as the download accumulates reputation, or sooner if the project
  ever code-signs releases.

  On first launch, open Settings and point the editor at:
    - your L2 client folder (containing system\\L2.exe)
    - your server data folder (data\\)

  Then open the World tab to start exploring.

Settings, caches, and texture extracts live under:
  %APPDATA%\\L2Editor\\

Uninstalling
------------
  Delete this folder. If you also want your settings and caches gone,
  delete the %APPDATA% folder above.

Source code, issues, contributing
---------------------------------
  https://github.com/<your-user>/l2_editor

License
-------
  Released under GNU General Public License v3.0. See the LICENSE file
  in this folder for the full text.
`;
    await writeFile(join(dir, "README.txt"), text);
}

async function makeZip(srcDir, zipPath) {
    if (platform() === "win32") {
        const ps = `Compress-Archive -Path '${srcDir}' -DestinationPath '${zipPath}' -Force`;
        execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "inherit" });
    } else {
        const parent = dirname(srcDir);
        const name = srcDir.slice(parent.length + 1);
        execSync(`cd "${parent}" && zip -r "${zipPath}" "${name}"`, { stdio: "inherit", shell: "/bin/bash" });
    }
}

async function sha256(path) {
    const buf = await readFile(path);
    return createHash("sha256").update(buf).digest("hex");
}

main().catch((e) => {
    console.error("[release] failed:", e?.message ?? e);
    process.exit(1);
});
