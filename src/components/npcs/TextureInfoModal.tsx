import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { ArrowUp, Download, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ipc, type TextureInfo } from "../../lib/ipc";
import { logger } from "../../lib/logger";
import { loadTexture } from "../../lib/textureCache";

export interface TextureRef {
    package: string;
    name: string;
    role?: "primary" | "secondary";
}

interface RowState {
    ref: TextureRef;
    info: TextureInfo | null;
    pngUrl: string | null;
    pngBytes: number | null;
    loading: boolean;
    error: string | null;
}

export function TextureInfoModal({
    open,
    onClose,
    textures,
    clientRoot,
    npcId,
    title
}: {
    open: boolean;
    onClose: () => void;
    textures: TextureRef[];
    clientRoot: string;
    npcId: number;
    title?: string;
}) {
    const [rows, setRows] = useState<RowState[]>([]);
    const [refreshTick, setRefreshTick] = useState(0);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setRows(
            textures.map((ref) => ({
                ref,
                info: null,
                pngUrl: null,
                pngBytes: null,
                loading: true,
                error: null
            }))
        );
        textures.forEach((ref, idx) => {
            const file = `${ref.package}.${ref.name}`;
            Promise.all([
                ipc
                    .textureInfo(clientRoot, ref.package, ref.name)
                    .then((info) => {
                        console.log(`[texture-info] ${file} →`, info);
                        return info;
                    })
                    .catch((e) => {
                        console.warn(`[texture-info] ${file} errored:`, e);
                        return null;
                    }),
                loadTexture(file, clientRoot)
            ]).then(([info, entry]) => {
                if (cancelled) return;
                const pngBytes = entry.url ? estimateDataUrlBytes(entry.url) : null;
                setRows((prev) => {
                    const next = prev.slice();
                    next[idx] = {
                        ref,
                        info,
                        pngUrl: entry.url,
                        pngBytes,
                        loading: false,
                        error: entry.status === "error" ? entry.error ?? "decode failed" : entry.status === "missing" ? "not found in .utx" : null
                    };
                    return next;
                });
            });
        });
        return () => {
            cancelled = true;
        };
    }, [open, textures, clientRoot, refreshTick]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
            onClick={onClose}
        >
            <div
                className="flex max-h-[88vh] w-[760px] max-w-full flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex shrink-0 items-baseline gap-3 border-b border-[var(--color-border)] px-4 py-3">
                    <h2 className="text-sm font-semibold tracking-wide text-[var(--color-text)]">
                        {title ?? "Texture details"}
                    </h2>
                    <span className="font-mono text-[10px] text-[var(--color-text-faint)]">
                        #{npcId} · {textures.length} texture{textures.length === 1 ? "" : "s"}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="ml-auto rounded p-1 text-[var(--color-text-faint)] hover:bg-white/5 hover:text-[var(--color-text)]"
                    >
                        <X size={14} aria-hidden />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {rows.length === 0 && (
                        <div className="text-[11px] text-[var(--color-text-faint)]">
                            This NPC has no texture references in NpcGrp.dat.
                        </div>
                    )}
                    <div className="flex flex-col gap-3">
                        {rows.map((r, i) => (
                            <TextureRow
                                key={`${r.ref.package}.${r.ref.name}-${i}`}
                                row={r}
                                clientRoot={clientRoot}
                                onApplied={() => setRefreshTick((t) => t + 1)}
                            />
                        ))}
                    </div>
                </div>

                <div className="shrink-0 border-t border-[var(--color-border)] px-4 py-2 text-[10px] text-[var(--color-text-faint)]">
                    UE2 packed format (DXT1/DXT3/DXT5/P8/RGBA) is the on-disk encoding inside the .utx;
                    rendered preview is the decoded RGBA8 PNG.
                </div>
            </div>
        </div>
    );
}

function TextureRow({
    row,
    clientRoot,
    onApplied
}: {
    row: RowState;
    clientRoot: string;
    onApplied: () => void;
}) {
    return (
        <div className="flex gap-4 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--color-border)] bg-black/40">
                {row.pngUrl ? (
                    <img
                        src={row.pngUrl}
                        alt={`${row.ref.package}.${row.ref.name}`}
                        className="h-full w-full object-contain"
                        style={{ imageRendering: "pixelated" }}
                    />
                ) : row.loading ? (
                    <span className="text-[10px] text-[var(--color-text-faint)]">loading…</span>
                ) : (
                    <span className="px-2 text-center text-[10px] text-[var(--color-warning)]">
                        {row.error ?? "no preview"}
                    </span>
                )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[12px] text-[var(--color-text)]">
                        {row.ref.package}.{row.ref.name}
                    </span>
                    {row.info && row.info.resolvedName && row.info.resolvedName !== row.ref.name && (
                        <span
                            className="font-mono text-[10px] text-[var(--color-text-faint)]"
                            title="The actual export name inside the .utx — the NpcGrp ref points to the base name, the engine resolves to this variant."
                        >
                            → {row.info.resolvedName}
                        </span>
                    )}
                    {row.ref.role && (
                        <span
                            className={`shrink-0 rounded border px-1.5 py-[1px] text-[9px] uppercase tracking-[0.15em] ${
                                row.ref.role === "primary"
                                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                                    : "border-[var(--color-text-faint)]/40 bg-[var(--color-text-faint)]/10 text-[var(--color-text-faint)]"
                            }`}
                        >
                            {row.ref.role}
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                    <KV k="resolution" v={row.info ? `${row.info.width} × ${row.info.height}` : row.loading ? "…" : "?"} />
                    <KV k="format" v={row.info?.format ?? (row.loading ? "…" : "?")} />
                    <KV k="mip levels" v={row.info ? String(row.info.mipCount) : row.loading ? "…" : "?"} />
                    <KV
                        k="raw mip0"
                        v={row.info ? formatBytes(row.info.mip0Size) : row.loading ? "…" : "?"}
                    />
                    <KV
                        k="png size"
                        v={row.pngBytes != null ? formatBytes(row.pngBytes) : row.loading ? "…" : "?"}
                    />
                    {row.info && (
                        <KV
                            k="compression"
                            v={formatRatio(row.info.mip0Size, row.info.width * row.info.height * 4)}
                            title="ratio of on-disk mip0 bytes to the 32bpp RGBA8 size at the same resolution"
                        />
                    )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                    <ExportPngButton row={row} />
                    <ReplaceFromPngButton row={row} clientRoot={clientRoot} onApplied={onApplied} />
                    <UpscaleButton row={row} clientRoot={clientRoot} onApplied={onApplied} />
                </div>
            </div>
        </div>
    );
}

function ExportPngButton({ row }: { row: RowState }) {
    const [busy, setBusy] = useState(false);
    const disabled = busy || !row.pngUrl;
    const name = row.info?.resolvedName || row.ref.name;
    const onClick = async () => {
        if (!row.pngUrl) return;
        setBusy(true);
        try {
            const target = await saveDialog({
                title: "Export texture as PNG",
                defaultPath: `${row.ref.package}.${name}.png`,
                filters: [{ name: "PNG", extensions: ["png"] }]
            });
            if (!target || typeof target !== "string") return;
            const bytes = base64DataUrlToBytes(row.pngUrl);
            await ipc.writeBinaryFile(target, Array.from(bytes));
            logger.info("texture-export", `wrote ${target}`, { bytes: bytes.length });
        } catch (e) {
            logger.warn("texture-export", "failed", { err: String(e) });
        } finally {
            setBusy(false);
        }
    };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-text)] disabled:opacity-40"
            title="Save the decoded RGBA8 PNG to disk for external editing or upscaling."
        >
            <Download size={10} aria-hidden /> {busy ? "saving…" : "export png"}
        </button>
    );
}

function ReplaceFromPngButton({
    row,
    clientRoot,
    onApplied
}: {
    row: RowState;
    clientRoot: string;
    onApplied: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const onClick = async () => {
        setBusy(true);
        try {
            const picked = await openDialog({
                title: `Replace ${row.ref.package}.${row.ref.name} (must match ${row.info?.width}×${row.info?.height})`,
                multiple: false,
                filters: [{ name: "PNG", extensions: ["png"] }]
            });
            if (!picked || typeof picked !== "string") return;
            const result = await ipc.replaceTextureWithPng(
                clientRoot,
                row.ref.package,
                row.ref.name,
                picked
            );
            logger.info("texture-replace", `replaced ${row.ref.package}.${row.ref.name}`, {
                bytesWritten: result.bytesWritten,
                mips: result.mipsReplaced,
                backup: result.backupPath ?? "(none)"
            });
            onApplied();
        } catch (e) {
            const msg = String(e);
            logger.warn("texture-replace", "failed", { err: msg });
            alert(`Replace failed: ${msg}`);
        } finally {
            setBusy(false);
        }
    };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={busy || !row.info}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-text)] disabled:opacity-40"
            title="Replace the texture pixels from a PNG file. The PNG dimensions must match the texture's existing resolution (same-size replace only). A .bak of the .utx is created."
        >
            <Upload size={10} aria-hidden /> {busy ? "writing…" : "replace from png"}
        </button>
    );
}

function UpscaleButton({
    row,
    clientRoot,
    onApplied
}: {
    row: RowState;
    clientRoot: string;
    onApplied: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const onClick = async () => {
        if (!row.info) return;
        const ok = window.confirm(
            `Upscale-pass ${row.ref.package}.${row.ref.name}? This runs a 2× Lanczos3 → 1× Lanczos3 round-trip ` +
                `to sharpen the existing pixels in place (same-size write, format ${row.info.format}). ` +
                `A .bak of the .utx is created.`
        );
        if (!ok) return;
        setBusy(true);
        try {
            const result = await ipc.upscaleTexture(clientRoot, row.ref.package, row.ref.name, 2);
            logger.info("texture-upscale", `re-encoded ${row.ref.package}.${row.ref.name}`, {
                bytesWritten: result.bytesWritten,
                mips: result.mipsReplaced,
                backup: result.backupPath ?? "(none)"
            });
            onApplied();
        } catch (e) {
            const msg = String(e);
            logger.warn("texture-upscale", "failed", { err: msg });
            alert(`Upscale failed: ${msg}`);
        } finally {
            setBusy(false);
        }
    };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={busy || !row.info}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-faint)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-text)] disabled:opacity-40"
            title="Run a 2× sharpening pass (Lanczos3 up then Lanczos3 down). Stays at original resolution. True higher-resolution upscale needs the offset-shifting path which is not yet implemented."
        >
            <ArrowUp size={10} aria-hidden /> {busy ? "running…" : "sharpen 2× pass"}
        </button>
    );
}

function base64DataUrlToBytes(url: string): Uint8Array {
    const comma = url.indexOf(",");
    const b64 = comma >= 0 ? url.slice(comma + 1) : url;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function KV({ k, v, title }: { k: string; v: string; title?: string }) {
    return (
        <div className="flex items-baseline gap-2" title={title}>
            <span className="w-24 shrink-0 text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
                {k}
            </span>
            <span className="mono text-[var(--color-text)]">{v}</span>
        </div>
    );
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRatio(have: number, vs: number): string {
    if (vs <= 0) return "?";
    const r = have / vs;
    return `${(r * 100).toFixed(1)}% of RGBA8`;
}

function estimateDataUrlBytes(url: string): number {
    const comma = url.indexOf(",");
    if (comma < 0) return 0;
    const b64 = url.slice(comma + 1);
    const pad = (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
    return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}
