export function joinPath(root: string, ...parts: string[]): string {
    const sep = root.includes("\\") ? "\\" : "/";
    return [root.replace(/[\\/]+$/, ""), ...parts].join(sep);
}

export function relUnder(base: string, full: string): string {
    const norm = (s: string) => s.replace(/\\/g, "/").replace(/\/+$/, "");
    const b = norm(base);
    const f = norm(full);
    return f.startsWith(b) ? f.slice(b.length).replace(/^\/+/, "") : full;
}

export const STATS_PLAYERS = ["stats", "players"] as const;
export const STATS_SKILLS = ["stats", "skills"] as const;

export const CLASS_LIST_FILE = "classList.xml";
export const SKILL_TREES_DIR = "skillTrees";
export const TEMPLATES_DIR = "templates";
export const EXPERIENCE_FILE = "experience.xml";
export const EXPERIENCE_LOSS_FILE = "experienceLoss.xml";
export const KARMA_LOSS_FILE = "karmaLoss.xml";

export const statsPlayersDir = (root: string) => joinPath(root, ...STATS_PLAYERS);
export const statsSkillsDir = (root: string) => joinPath(root, ...STATS_SKILLS);
export const classListPath = (root: string) => joinPath(root, ...STATS_PLAYERS, CLASS_LIST_FILE);
export const skillTreesDir = (root: string) => joinPath(root, ...STATS_PLAYERS, SKILL_TREES_DIR);
export const templatesDir = (root: string) => joinPath(root, ...STATS_PLAYERS, TEMPLATES_DIR);
