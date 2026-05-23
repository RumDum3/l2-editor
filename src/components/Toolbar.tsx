import { ArrowLeft } from "lucide-react";
import { type ReactNode, useState } from "react";
import { TIER2_DATS } from "../lib/tier2Dats";
import { useEditor } from "../state/EditorContext";
import { useSettings } from "../state/SettingsContext";
import { EditActions } from "./EditActions";
import { TextureProgress } from "./TextureProgress";

export function Toolbar({
    onOpenSettings,
    onToggleLogs,
    logsOpen,
    view,
    editActions,
    onBackToClasses
}: {
    onOpenSettings: () => void;
    onToggleLogs: () => void;
    logsOpen: boolean;
    view: "editor" | "classes" | "experience" | "world";
    editActions?: ReactNode;
    onBackToClasses?: () => void;
}) {
    const {
        loaded,
        selectedIndex,
        mode,
        dirty,
        save,
        enterDetail,
        exitDetail,
        refreshFolder,
        undo,
        redo,
        canUndo,
        canRedo
    } = useEditor();
    const { pendingClientEdits, pendingSkillNameEdits, pendingTier2Edits, syncToClient } = useSettings();
    const [syncing, setSyncing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const logsBtn = (
        <button
            type="button"
            onClick={onToggleLogs}
            className={`rounded border px-2 py-1 text-xs hover:border-[var(--color-accent-2)] ${
                logsOpen
                    ? "border-[var(--color-accent-2)] bg-[var(--color-surface-2)] text-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
            }`}
        >
            Logs
        </button>
    );
    const settingsBtn = (
        <button
            type="button"
            onClick={onOpenSettings}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:border-[var(--color-accent-2)]"
        >
            Settings
        </button>
    );

    if (view !== "editor") {
        return (
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
                <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">{view}</span>
                <div className="ml-auto flex items-center gap-2">
                    {editActions}
                    {logsBtn}
                    {settingsBtn}
                </div>
            </div>
        );
    }

    const cloneSelected = () => {
        if (!loaded || selectedIndex === null) return;
        const entry = loaded.index[selectedIndex];
        const ent = loaded.files[entry.fileIndex].entities[entry.entityIndex];
        const el = loaded.plugin.elementOf(ent);
        const clone = el.cloneNode(true) as Element;
        const idAttr = loaded.plugin.idAttr;
        let newId: number | null = null;
        if (idAttr) {
            const maxId = loaded.index.reduce(
                (m, e) => (typeof e.summary.id === "number" ? Math.max(m, e.summary.id) : m),
                0
            );
            newId = maxId + 1;
            clone.setAttribute(idAttr, String(newId));
        }
        el.after(clone);
        refreshFolder();
        if (newId !== null) {
            const idx = loaded.index.findIndex((e) => String(e.summary.id) === String(newId));
            if (idx >= 0) enterDetail(idx);
        }
    };

    const deleteSelected = () => {
        if (!loaded || selectedIndex === null) return;
        const entry = loaded.index[selectedIndex];
        const ent = loaded.files[entry.fileIndex].entities[entry.entityIndex];
        loaded.plugin.elementOf(ent).remove();
        refreshFolder();
        setConfirmDelete(false);
    };
    const pendingUnion = new Set<number>([
        ...pendingClientEdits,
        ...pendingSkillNameEdits,
        ...[...pendingTier2Edits.values()].flatMap((s) => [...s])
    ]);
    const pendingCount = pendingUnion.size;
    const tier2Labels = [...pendingTier2Edits.entries()]
        .filter(([, ids]) => ids.size > 0)
        .map(([key]) => TIER2_DATS.find((e) => e.key === key)?.label ?? key);
    const clientTargets =
        pendingCount === 0
            ? []
            : [
                  pendingClientEdits.size > 0 ? "Skillgrp" : null,
                  pendingSkillNameEdits.size > 0 ? "SkillName" : null,
                  ...tier2Labels
              ].filter((s): s is string => !!s);

    const onSave = async () => {
        if (syncing) return;
        setSyncing(true);
        try {
            if (loaded && dirty) await save();
            if (pendingCount > 0) await syncToClient();
        } finally {
            setSyncing(false);
        }
    };
    const saveDisabled = syncing || (!dirty && pendingCount === 0);

    let detail: { fileName: string; id: string | number; label: string } | null = null;
    if (mode === "detail" && loaded && selectedIndex !== null) {
        const entry = loaded.index[selectedIndex];
        const file = loaded.files[entry.fileIndex];
        detail = { fileName: file.name.replace(/\.xml$/i, ""), id: entry.summary.id, label: entry.summary.label };
    }

    return (
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
            {onBackToClasses && (
                <button
                    type="button"
                    onClick={onBackToClasses}
                    className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:border-[var(--color-accent-2)]"
                    title="Back to the Classes workspace"
                >
                    <ArrowLeft size={13} aria-hidden /> Classes
                </button>
            )}
            {detail ? (
                <>
                    <button
                        type="button"
                        onClick={exitDetail}
                        className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:border-[var(--color-accent-2)]"
                        title="Back to grid (Esc)"
                    >
                        <ArrowLeft size={13} aria-hidden /> Back
                    </button>
                    <Breadcrumb folder={loaded?.folder ?? null} fileLabel={detail.fileName} />
                    <span className="text-[11px] text-[var(--color-text-faint)]">·</span>
                    <span className="mono text-[11px] text-[var(--color-accent-2)]">
                        #{typeof detail.id === "number" ? String(detail.id).padStart(5, "0") : detail.id}
                    </span>
                    <span className="truncate text-[11px] text-[var(--color-accent)]" title={detail.label}>
                        {detail.label}
                    </span>
                    <button
                        type="button"
                        onClick={cloneSelected}
                        title={`Duplicate this ${loaded?.plugin.label.replace(/s$/i, "").toLowerCase() ?? "entity"} with a fresh id`}
                        className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:border-[var(--color-accent-2)]"
                    >
                        Clone
                    </button>
                    {confirmDelete ? (
                        <button
                            type="button"
                            onClick={deleteSelected}
                            className="rounded border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-2 py-1 text-xs text-[var(--color-danger)]"
                        >
                            Confirm delete?
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setConfirmDelete(true);
                                window.setTimeout(() => setConfirmDelete(false), 3000);
                            }}
                            title="Delete this entity (click again to confirm)"
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text-faint)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                        >
                            Delete
                        </button>
                    )}
                </>
            ) : (
                <>
                    <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">
                        {loaded?.plugin.label.toLowerCase() ?? "xml"}
                    </span>
                    <Breadcrumb folder={loaded?.folder ?? null} fileLabel={null} />
                </>
            )}

            <TextureProgress />
            <ClientDataStatus />

            <div className="ml-auto flex items-center gap-2">
                <EditActions
                    onUndo={undo}
                    onRedo={redo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    dirty={dirty || pendingCount > 0}
                    dirtyTitle={`Unsaved: ${dirty ? "XML" : ""}${dirty && pendingCount > 0 ? " + " : ""}${pendingCount > 0 ? `${pendingCount} client skill${pendingCount === 1 ? "" : "s"}` : ""}`}
                    saving={syncing}
                    saveDisabled={saveDisabled}
                    saveLabel={pendingCount > 0 ? `Save (${pendingCount} client)` : "Save"}
                    saveTitle={
                        saveDisabled
                            ? "Nothing to save"
                            : `Write XML${pendingCount > 0 ? ` + flush ${pendingCount} client skill${pendingCount === 1 ? "" : "s"} to ${clientTargets.join(" + ")}` : ""}`
                    }
                    onSave={onSave}
                    onReload={refreshFolder}
                    reloadDisabled={!loaded}
                />
                {logsBtn}
                {settingsBtn}
            </div>
        </div>
    );
}

function Breadcrumb({ folder, fileLabel }: { folder: string | null; fileLabel: string | null }) {
    if (!folder) return <span className="ml-3 text-[11px] text-[var(--color-text-faint)]">No folder open.</span>;
    return (
        <div className="ml-3 flex min-w-0 items-center gap-2 text-[11px] text-[var(--color-text-faint)]">
            <span className="mono truncate max-w-[420px]" title={folder}>
                {basename(folder)}
            </span>
            {fileLabel && (
                <>
                    <span>·</span>
                    <span className="mono truncate" title={fileLabel}>
                        {fileLabel}
                    </span>
                </>
            )}
        </div>
    );
}

function basename(p: string): string {
    const m = p.match(/[^\\/]+$/);
    return m ? m[0] : p;
}

function ClientDataStatus() {
    const { skillgrp, skillNames } = useSettings();
    const labels: string[] = [];
    if (skillgrp.kind === "loading") labels.push("Skillgrp");
    if (skillNames.kind === "loading") labels.push("SkillName");
    if (labels.length === 0) return null;
    const what = labels.join(" + ");
    return (
        <div
            className="ml-3 flex items-center gap-2 text-[11px] text-[var(--color-text-faint)]"
            title={`Hydrating ${what} from disk — first read of the JSON cache (~1-3s)`}
        >
            <span
                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-text-faint)] border-t-[var(--color-accent-2)]"
                aria-hidden
            />
            <span>loading {what.toLowerCase()}…</span>
        </div>
    );
}
