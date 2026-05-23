import { skillsPlugin } from "./skills";
import type { EditorPlugin } from "./types";

export const PLUGINS: ReadonlyArray<EditorPlugin> = [skillsPlugin as unknown as EditorPlugin] as const;

export function pickPlugin(doc: XMLDocument): EditorPlugin | null {
    for (const p of PLUGINS) {
        if (p.matches(doc)) return p;
    }
    return null;
}
