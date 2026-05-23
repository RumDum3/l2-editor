const PLACEHOLDER_RE = /\$s?(\d+)|#(\d+)/g;
const BR_RE = /<\s*br\s*\/?\s*>/gi;
const FONT_RE = /<\s*\/?\s*font[^>]*>/gi;

export type SkillTextMode = "block" | "inline";

export function formatSkillText(raw: string, paramsRaw: string, mode: SkillTextMode = "block"): string {
    if (!raw) return "";
    const params = paramsRaw ? paramsRaw.split(";").map((s) => s.trim()) : [];

    let out = raw.replace(PLACEHOLDER_RE, (match, sNum, hNum) => {
        const idx = Number.parseInt(sNum ?? hNum, 10) - 1;
        if (idx < 0 || idx >= params.length) return match;
        return params[idx];
    });

    out = out.replace(/\\n/g, "\n").replace(/\\\\/g, "\\");

    out = out.replace(BR_RE, "\n").replace(FONT_RE, "");

    if (mode === "inline") {
        out = out.replace(/\s+/g, " ").trim();
    } else {
        out = out
            .split("\n")
            .map((line) => line.trim())
            .join("\n")
            .trim();
    }
    return out;
}
