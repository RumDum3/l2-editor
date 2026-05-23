import { PLUGINS } from "../editors/registry";
import { useEditor } from "../state/EditorContext";

export function Sidebar({
    view,
    onShowClasses,
    onShowExperience,
    onShowWorld,
    onShowEditor
}: {
    view: "editor" | "classes" | "experience" | "world";
    onShowClasses: () => void;
    onShowExperience: () => void;
    onShowWorld: () => void;
    onShowEditor: () => void;
}) {
    const { loaded, selectCategory } = useEditor();
    const categories = PLUGINS.filter((p) => !!p.dataPath);

    const itemCls = (active: boolean) =>
        `flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--color-surface-2)] ${
            active ? "bg-[var(--color-surface-2)] text-[var(--color-accent)]" : ""
        }`;

    return (
        <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
            <SectionHeader>Categories</SectionHeader>
            <div className="flex-1 overflow-y-auto py-1">
                <button
                    type="button"
                    onClick={onShowClasses}
                    className={itemCls(view === "classes")}
                    title="Classes — hierarchy, skill trees, templates (stats/players/)"
                >
                    Classes
                </button>
                <button
                    type="button"
                    onClick={onShowExperience}
                    className={itemCls(view === "experience")}
                    title="Experience — XP curve, death XP loss, karma decay (stats/players/)"
                >
                    Experience
                </button>
                <button type="button" onClick={onShowWorld} className={itemCls(view === "world")} title="World">
                    World
                </button>
                {categories.map((p) => {
                    const active = view === "editor" && loaded?.plugin.id === p.id;
                    return (
                        <button
                            type="button"
                            key={p.id}
                            onClick={() => {
                                onShowEditor();
                                if (loaded?.plugin.id !== p.id) selectCategory(p.id);
                            }}
                            className={itemCls(active)}
                            title={p.dataPath}
                        >
                            {p.icon && <span className="text-[14px] leading-none">{p.icon}</span>}
                            <span>{p.label}</span>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <div className="border-b border-[var(--color-border)]/60 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
            {children}
        </div>
    );
}
