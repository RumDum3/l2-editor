import { useCallback, useEffect, useRef, useState } from "react";

export function useUndoHotkeys(active: boolean, undo: () => void, redo: () => void): void {
    useEffect(() => {
        if (!active) return;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            const tag = t?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable === true) return;
            if (!(e.ctrlKey || e.metaKey)) return;
            const k = e.key.toLowerCase();
            if (k === "z" && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if ((k === "z" && e.shiftKey) || k === "y") {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [active, undo, redo]);
}

const DEPTH = 100;

type XmlSnap = { kind: "xml"; path: string; xml: string };
type OpSnap = { kind: "op"; undo: () => void; redo: () => void };
type Snap = XmlSnap | OpSnap;

export type FileUndo = {
    snapshot: (path: string) => void;
    pushOp: (op: { undo: () => void; redo: () => void }) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;

    rev: number;
    reset: () => void;
};

export function useFileUndo(opts: {
    serialize: (path: string) => string | null;
    restore: (path: string, xml: string) => void;
}): FileUndo {
    const undoRef = useRef<Snap[]>([]);
    const redoRef = useRef<Snap[]>([]);
    const optsRef = useRef(opts);
    optsRef.current = opts;
    const [counts, setCounts] = useState({ u: 0, r: 0, rev: 0 });
    const sync = () => setCounts((p) => ({ ...p, u: undoRef.current.length, r: redoRef.current.length }));
    const bumpRev = () => setCounts((p) => ({ u: undoRef.current.length, r: redoRef.current.length, rev: p.rev + 1 }));

    const snapshot = useCallback((path: string) => {
        const xml = optsRef.current.serialize(path);
        if (xml == null) return;
        undoRef.current.push({ kind: "xml", path, xml });
        if (undoRef.current.length > DEPTH) undoRef.current.shift();
        redoRef.current = [];
        sync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pushOp = useCallback((op: { undo: () => void; redo: () => void }) => {
        undoRef.current.push({ kind: "op", undo: op.undo, redo: op.redo });
        if (undoRef.current.length > DEPTH) undoRef.current.shift();
        redoRef.current = [];
        sync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const undo = useCallback(() => {
        const entry = undoRef.current.pop();
        if (!entry) return;
        if (entry.kind === "op") {
            redoRef.current.push(entry);
            entry.undo();
            bumpRev();
            return;
        }
        const cur = optsRef.current.serialize(entry.path);
        if (cur != null) redoRef.current.push({ kind: "xml", path: entry.path, xml: cur });
        optsRef.current.restore(entry.path, entry.xml);
        bumpRev();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const redo = useCallback(() => {
        const entry = redoRef.current.pop();
        if (!entry) return;
        if (entry.kind === "op") {
            undoRef.current.push(entry);
            entry.redo();
            bumpRev();
            return;
        }
        const cur = optsRef.current.serialize(entry.path);
        if (cur != null) undoRef.current.push({ kind: "xml", path: entry.path, xml: cur });
        optsRef.current.restore(entry.path, entry.xml);
        bumpRev();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const reset = useCallback(() => {
        undoRef.current = [];
        redoRef.current = [];
        sync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        snapshot,
        pushOp,
        undo,
        redo,
        canUndo: counts.u > 0,
        canRedo: counts.r > 0,
        rev: counts.rev,
        reset
    };
}
