import { PLUGINS } from "../editors/registry";
import { useEditor } from "../state/EditorContext";
import { useSettings } from "../state/SettingsContext";

export function Dashboard({
    onOpenSettings,
    onShowClasses,
    onShowExperience,
    onShowWorld
}: {
    onOpenSettings: () => void;
    onShowClasses: () => void;
    onShowExperience: () => void;
    onShowWorld: () => void;
}) {
    const { config } = useSettings();
    const { selectCategory } = useEditor();
    const categories = PLUGINS.filter((p) => !!p.dataPath);

    if (!config?.dataRoot) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <h2 className="text-base text-[var(--color-text)]">Welcome.</h2>
                <p className="max-w-md text-[12px] text-[var(--color-text-faint)]">
                    Pick your L2J <span className="mono">data</span> folder to get started — that's where the categories
                    live (skills, items, NPCs, …).
                </p>
                <button
                    type="button"
                    onClick={onOpenSettings}
                    className="mt-1 rounded border border-[var(--color-accent-2)] bg-[var(--color-surface-2)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                >
                    Open Settings
                </button>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
                <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                    Pick a category to load
                </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                    <button
                        type="button"
                        onClick={onShowClasses}
                        className="flex h-32 flex-col items-start justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition hover:border-[var(--color-accent-2)] hover:bg-[var(--color-surface-2)]"
                    >
                        <div className="text-[14px] font-semibold text-[var(--color-text)]">Classes</div>
                        <span className="mono text-[10px] text-[var(--color-text-faint)]">stats/players</span>
                    </button>
                    <button
                        type="button"
                        onClick={onShowExperience}
                        className="flex h-32 flex-col items-start justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition hover:border-[var(--color-accent-2)] hover:bg-[var(--color-surface-2)]"
                    >
                        <div className="text-[14px] font-semibold text-[var(--color-text)]">Experience</div>
                        <span className="mono text-[10px] text-[var(--color-text-faint)]">stats/players</span>
                    </button>
                    <button
                        type="button"
                        onClick={onShowWorld}
                        className="flex h-32 flex-col items-start justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition hover:border-[var(--color-accent-2)] hover:bg-[var(--color-surface-2)]"
                    >
                        <div className="text-[14px] font-semibold text-[var(--color-text)]">World</div>
                        <span className="mono text-[10px] text-[var(--color-text-faint)]">—</span>
                    </button>
                    {categories.map((p) => (
                        <button
                            type="button"
                            key={p.id}
                            onClick={() => selectCategory(p.id)}
                            className="flex h-32 flex-col items-start justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition hover:border-[var(--color-accent-2)] hover:bg-[var(--color-surface-2)]"
                        >
                            <div>
                                {p.icon && (
                                    <div className="mono mb-1 text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                                        {p.icon}
                                    </div>
                                )}
                                <div className="text-[14px] font-semibold text-[var(--color-text)]">{p.label}</div>
                            </div>
                            {p.dataPath && (
                                <span className="mono text-[10px] text-[var(--color-text-faint)]">{p.dataPath}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
