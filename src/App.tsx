import { memo, type ReactNode, useCallback, useEffect, useState } from "react";
import { CardGrid } from "./components/CardGrid";
import { ClassesWorkspace } from "./components/classes/ClassesWorkspace";
import { Dashboard } from "./components/Dashboard";
import { EditorPane } from "./components/EditorPane";
import { ExperienceWorkspace } from "./components/experience/ExperienceWorkspace";
import { WorldWorkspace } from "./components/world/WorldWorkspace";
import { NpcsWorkspace } from "./components/npcs/NpcsWorkspace";

const ClassesWorkspaceMemo = memo(ClassesWorkspace);
const ExperienceWorkspaceMemo = memo(ExperienceWorkspace);
const WorldWorkspaceMemo = memo(WorldWorkspace);
const NpcsWorkspaceMemo = memo(NpcsWorkspace);
import { FirstRunWizard } from "./components/FirstRunWizard";
import { LogsPanel } from "./components/LogsPanel";
import { ProtocolMismatchModal } from "./components/ProtocolMismatchModal";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { EditorProvider, useEditor } from "./state/EditorContext";
import { SettingsProvider, useSettings } from "./state/SettingsContext";
import { ToolbarSlotProvider } from "./state/ToolbarSlot";

function Inner() {
    const { mode, loaded, loading, error, exitDetail, openEntityById, undo, redo, save, dirty } = useEditor();
    const { probe, serverProtocols, config, loaded: configLoaded } = useSettings();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [view, setView] = useState<"editor" | "classes" | "experience" | "world" | "npcs">("editor");
    const [cameFromClasses, setCameFromClasses] = useState(false);
    const [toolbarExtra, setToolbarExtra] = useState<ReactNode>(null);
    const [wizardOpen, setWizardOpen] = useState(false);
    useEffect(() => {
        if (configLoaded && !config?.dataRoot) setWizardOpen(true);
    }, [configLoaded, config?.dataRoot]);

    const [mismatchOpen, setMismatchOpen] = useState(false);
    const [dismissedKey, setDismissedKey] = useState<string | null>(null);

    useEffect(() => {
        if (wizardOpen) return;
        if (probe.kind !== "done" || serverProtocols.kind !== "done") {
            setMismatchOpen(false);
            return;
        }
        const allowed = serverProtocols.protocols;
        if (allowed.includes(probe.protocol)) {
            setMismatchOpen(false);
            return;
        }
        const key = `${probe.protocol}/${[...allowed].sort((a, b) => a - b).join(",")}`;
        if (dismissedKey === key) {
            setMismatchOpen(false);
            return;
        }
        setMismatchOpen(true);
    }, [probe, serverProtocols, dismissedKey, wizardOpen]);

    const currentMismatchKey = (): string | null => {
        if (probe.kind !== "done" || serverProtocols.kind !== "done") return null;
        if (serverProtocols.protocols.includes(probe.protocol)) return null;
        return `${probe.protocol}/${[...serverProtocols.protocols].sort((a, b) => a - b).join(",")}`;
    };

    const dismissMismatch = () => {
        const key = currentMismatchKey();
        if (key) setDismissedKey(key);
        setMismatchOpen(false);
    };

    const closeWizard = () => {
        const key = currentMismatchKey();
        if (key) setDismissedKey(key);
        setWizardOpen(false);
    };

    useEffect(() => {
        if (mode !== "detail") return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !settingsOpen) exitDetail();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [mode, settingsOpen, exitDetail]);

    useEffect(() => {
        if (view !== "editor") return;
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            const inEditable =
                tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable === true;
            if (inEditable) return;

            const mod = e.ctrlKey || e.metaKey;
            if (!mod) return;
            const k = e.key.toLowerCase();
            if (k === "z" && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if ((k === "z" && e.shiftKey) || k === "y") {
                e.preventDefault();
                redo();
            } else if (k === "s") {
                e.preventDefault();
                if (dirty) void save();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [view, undo, redo, save, dirty]);

    const openSkillInEditor = useCallback(
        async (skillId: number) => {
            setCameFromClasses(true);
            setView("editor");
            await openEntityById("skills", skillId);
        },
        [openEntityById]
    );
    const showEditor = useCallback(() => {
        setCameFromClasses(false);
        setView("editor");
    }, []);
    const showClasses = useCallback(() => setView("classes"), []);
    const showExperience = useCallback(() => setView("experience"), []);
    const showWorld = useCallback(() => setView("world"), []);
    const showNpcs = useCallback(() => setView("npcs"), []);

    const editorMain = (() => {
        if (loaded) return mode === "detail" ? <EditorPane /> : <CardGrid />;
        if (loading) return <CardGrid />;
        return (
            <Dashboard
                onOpenSettings={() => setSettingsOpen(true)}
                onShowClasses={showClasses}
                onShowExperience={showExperience}
                onShowWorld={showWorld}
                onShowNpcs={showNpcs}
            />
        );
    })();

    return (
        <ToolbarSlotProvider value={setToolbarExtra}>
            <div className="flex h-full flex-col">
                <Toolbar
                    onOpenSettings={() => setSettingsOpen(true)}
                    onToggleLogs={() => setLogsOpen((o) => !o)}
                    logsOpen={logsOpen}
                    view={view}
                    editActions={view === "editor" ? undefined : toolbarExtra}
                    onBackToClasses={view === "editor" && cameFromClasses ? showClasses : undefined}
                />
                <div className="flex flex-1 overflow-hidden">
                    <Sidebar
                        view={view}
                        onShowClasses={showClasses}
                        onShowExperience={showExperience}
                        onShowWorld={showWorld}
                        onShowNpcs={showNpcs}
                        onShowEditor={showEditor}
                    />
                    <main className="relative isolate flex-1 overflow-hidden bg-[var(--color-bg)]">
                        <div className={view === "editor" ? "h-full" : "hidden"}>{editorMain}</div>
                        <div className={view === "classes" ? "h-full" : "hidden"}>
                            <ClassesWorkspaceMemo active={view === "classes"} onOpenSkill={openSkillInEditor} />
                        </div>
                        <div className={view === "experience" ? "h-full" : "hidden"}>
                            <ExperienceWorkspaceMemo active={view === "experience"} />
                        </div>
                        <div className={view === "world" ? "h-full" : "hidden"}>
                            <WorldWorkspaceMemo active={view === "world"} />
                        </div>
                        <div className={view === "npcs" ? "h-full" : "hidden"}>
                            <NpcsWorkspaceMemo active={view === "npcs"} />
                        </div>
                    </main>
                </div>
                {error && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[11px] text-[var(--color-danger)]">
                        {error}
                    </div>
                )}
                <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
                {logsOpen && <LogsPanel onClose={() => setLogsOpen(false)} />}
                {probe.kind === "done" && serverProtocols.kind === "done" && (
                    <ProtocolMismatchModal
                        open={mismatchOpen}
                        onDismiss={dismissMismatch}
                        clientProtocol={probe.protocol}
                        serverProtocols={serverProtocols.protocols}
                        onOpenSettings={() => setSettingsOpen(true)}
                    />
                )}
                {wizardOpen && <FirstRunWizard onClose={closeWizard} />}
            </div>
        </ToolbarSlotProvider>
    );
}

export default function App() {
    return (
        <SettingsProvider>
            <EditorProvider>
                <Inner />
            </EditorProvider>
        </SettingsProvider>
    );
}
