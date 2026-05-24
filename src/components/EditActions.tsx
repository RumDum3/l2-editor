import { Circle, Save } from "lucide-react";

const BTN =
    "rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:border-[var(--color-accent-2)] disabled:opacity-40";

export function EditActions({
    dirty = false,
    dirtyCount,
    dirtyTitle,
    saving = false,
    saveDisabled = false,
    saveLabel = "Save",
    saveTitle,
    onSave,
    onReload,
    reloadDisabled = false,
    onUndo,
    onRedo,
    canUndo = false,
    canRedo = false
}: {
    dirty?: boolean;
    dirtyCount?: number;
    dirtyTitle?: string;
    saving?: boolean;
    saveDisabled?: boolean;
    saveLabel?: string;
    saveTitle?: string;
    onSave: () => void;
    onReload?: () => void;
    reloadDisabled?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}) {
    const showDot = dirty || (dirtyCount != null && dirtyCount > 0);
    return (
        <div className="flex items-center gap-2">
            {onUndo && (
                <button
                    type="button"
                    onClick={onUndo}
                    disabled={!canUndo}
                    title="Undo (Ctrl+Z)"
                    className={`${BTN} disabled:opacity-30`}
                >
                    Undo
                </button>
            )}
            {onRedo && (
                <button
                    type="button"
                    onClick={onRedo}
                    disabled={!canRedo}
                    title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                    className={`${BTN} disabled:opacity-30`}
                >
                    Redo
                </button>
            )}
            {showDot && (
                <span
                    className="flex items-center gap-1 text-[var(--color-accent)]"
                    title={dirtyTitle ?? "Unsaved changes"}
                >
                    <Circle size={8} fill="currentColor" aria-hidden />
                    {dirtyCount != null && dirtyCount > 0 && (
                        <span className="text-[11px]">
                            {dirtyCount} file{dirtyCount === 1 ? "" : "s"}
                        </span>
                    )}
                </span>
            )}
            {onReload && (
                <button
                    type="button"
                    onClick={onReload}
                    disabled={reloadDisabled}
                    title="Reload from disk (discards unsaved changes)"
                    className={BTN}
                >
                    Reload
                </button>
            )}
            <button
                type="button"
                onClick={onSave}
                disabled={saveDisabled}
                title={saveTitle}
                className={`inline-flex items-center gap-1 ${BTN} ${
                    !saveDisabled
                        ? "border-[var(--color-accent-2)] text-[var(--color-accent)] shadow-[0_0_0_1px_var(--color-accent-2)]"
                        : ""
                }`}
            >
                <Save size={13} aria-hidden /> {saving ? "Saving…" : saveLabel}
            </button>
        </div>
    );
}
