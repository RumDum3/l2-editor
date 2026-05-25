#!/usr/bin/env node
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
    const args = new Set(process.argv.slice(2));
    const doBuild = args.has("--build");

    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
    const version = pkg.version;
    if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
        console.error(`[zip] bad version in package.json: ${version}`);
        process.exit(1);
    }

    const exeSrc = join(ROOT, "target", "release", "l2_editor.exe");
    const exeOk = await stat(exeSrc).then((s) => s.isFile()).catch(() => false);
    if (!exeOk && !doBuild) {
        console.error(`[zip] no built binary at ${exeSrc}. Pass --build to run pnpm tauri build first.`);
        process.exit(1);
    }
    if (doBuild) {
        console.log("[zip] pnpm tauri build (takes a few minutes)...");
        execSync("pnpm tauri build", { stdio: "inherit", cwd: ROOT });
    }

    const stageDir = join(ROOT, "release-portable", `L2 Editor ${version}`);
    await rm(stageDir, { recursive: true, force: true });
    await mkdir(stageDir, { recursive: true });

    await copyFile(exeSrc, join(stageDir, "l2_editor.exe"));
    await copyFile(join(ROOT, "LICENSE"), join(stageDir, "LICENSE"));
    await writePortableReadme(stageDir, version);

    const zipPath = join(ROOT, "release-portable", `L2_Editor_${version}_portable.zip`);
    await rm(zipPath, { force: true });
    await makeZip(stageDir, zipPath);

    const hash = await sha256(zipPath);
    const size = (await stat(zipPath)).size;
    const mb = (size / 1024 / 1024).toFixed(2);

    console.log(`
[zip] done.

  Stage:   ${stageDir}
  Zip:     ${zipPath}
  Size:    ${mb} MB
  SHA-256: ${hash}
`);
}

async function writePortableReadme(dir, version) {
    const heading = `L2 Editor ${version} (portable)`;
    const text = `${heading}
${"=".repeat(heading.length)}

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
  binary is unsigned. Click "More info" then "Run anyway".

  On first launch, open Settings and point the editor at:
    - your L2 client folder (containing system\\L2.exe)
    - your server data folder (data\\)

Settings, caches, and texture extracts live under:
  %APPDATA%\\L2Editor\\

License
-------
  GNU General Public License v3.0. See LICENSE for the full text.
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
    console.error("[zip] failed:", e?.message ?? e);
    process.exit(1);
});
