#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKETS = new Set(["added", "changed", "fixed", "removed"]);

async function main() {
    const [bucketArg, ...rest] = process.argv.slice(2);
    const text = rest.join(" ").trim();
    const bucket = bucketArg?.toLowerCase();
    if (!bucket || !BUCKETS.has(bucket) || !text) {
        console.error("usage: pnpm note <added|changed|fixed|removed> <message>");
        console.error('       pnpm note fixed "world: tile click no longer flickers"');
        process.exit(1);
    }
    const heading = bucket[0].toUpperCase() + bucket.slice(1);
    const path = join(ROOT, "CHANGELOG.md");
    const orig = await readFile(path, "utf8");

    const unreleasedMatch = orig.match(/^##\s*\[Unreleased\]\s*$/m);
    if (!unreleasedMatch || unreleasedMatch.index == null) {
        throw new Error("CHANGELOG.md missing [Unreleased] section");
    }
    const sectionStart = unreleasedMatch.index + unreleasedMatch[0].length;
    const nextHeader = orig.slice(sectionStart).search(/^##\s/m);
    const sectionEnd = nextHeader === -1 ? orig.length : sectionStart + nextHeader;
    const section = orig.slice(sectionStart, sectionEnd);

    const bucketRe = new RegExp(`(^### ${heading}\\s*\\n)([\\s\\S]*?)(?=^### |$)`, "m");
    const match = section.match(bucketRe);
    let newSection;
    if (!match) {
        newSection = `${section.trimEnd()}\n\n### ${heading}\n- ${text}\n`;
    } else {
        const body = match[2]
            .split("\n")
            .filter((l) => l.trim() && l.trim() !== "-")
            .concat(`- ${text}`)
            .join("\n");
        newSection = section.replace(bucketRe, `$1${body}\n\n`);
    }
    const updated = `${orig.slice(0, sectionStart)}${newSection}${orig.slice(sectionEnd)}`;
    await writeFile(path, updated);
    console.log(`[note] added to [Unreleased] / ${heading}:\n  - ${text}`);
}

main().catch((e) => {
    console.error("[note] failed:", e?.message ?? e);
    process.exit(1);
});
