import { useEditor } from "../state/EditorContext";

export function EditorPane() {
    const { loaded, selectedIndex, mutate, revision } = useEditor();
    if (!loaded || selectedIndex === null) return <EmptyState />;

    const entry = loaded.index[selectedIndex];
    const ent = loaded.files[entry.fileIndex].entities[entry.entityIndex];
    const Editor = loaded.plugin.Editor;

    // biome-ignore lint/suspicious/noExplicitAny: type-erased shell
    return <Editor entity={ent as any} mutate={mutate} revision={revision} />;
}

function EmptyState() {
    return (
        <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-faint)]">
            Pick an entity from the grid to begin.
        </div>
    );
}
