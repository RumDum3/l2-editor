import { useEffect, useState } from "react";
import { subscribeTextureStats, type TextureStats } from "../lib/textureCache";

const empty: TextureStats = { loaded: 0, loading: 0, missing: 0, error: 0, total: 0 };

export function TextureProgress() {
    const [stats, setStats] = useState<TextureStats>(empty);

    useEffect(() => {
        return subscribeTextureStats(setStats);
    }, []);

    const inFlight = stats.loading;
    const settled = stats.loaded + stats.missing + stats.error;
    const total = stats.total;

    if (total === 0 || inFlight === 0) return null;

    const pct = total > 0 ? Math.min(100, Math.round((settled / total) * 100)) : 0;

    return (
        <div className="ml-3 flex items-center gap-2" title="Texture extraction in progress">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">Textures</span>
            <div className="h-1 w-32 overflow-hidden rounded bg-[var(--color-surface-2)]">
                <div
                    className="h-full bg-gradient-to-r from-[var(--color-accent-2)] to-[var(--color-accent)] transition-[width] duration-200"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="mono text-[10px] text-[var(--color-text-faint)]">
                {settled.toLocaleString()} / {total.toLocaleString()}
            </span>
        </div>
    );
}
