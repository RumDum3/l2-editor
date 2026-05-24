import "leaflet/dist/leaflet.css";
import { CRS, type LatLngBoundsExpression, type LeafletMouseEvent, type PathOptions } from "leaflet";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageOverlay, MapContainer, Polygon, Rectangle, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { listTextures, loadTexture, subscribeTexture, type TextureEntry } from "../../lib/textureCache";
import { setJsonPref, setStringSet, toggleStringSetMember, useJsonPref, useStringSet } from "../../lib/uiPrefs";
import { mapToWorld, REGION_SIZE, regionOf, WORLD, WORLD_H, WORLD_W, worldToMap } from "../../lib/worldCoords";
import { loadZones, type Zone, zoneColor, zoneTypeInfo } from "../../lib/zones";
import { useSettings } from "../../state/SettingsContext";
import { useSetToolbarSlot } from "../../state/ToolbarSlot";
import { EditActions } from "../EditActions";

const RADAR_PACKAGE = "L2_RadarMap";
const TILE = 200;
const COLS = 5;
const LAYOUT_KEY = "worldRadarLayout";
const ZONE_TYPES_KEY = "worldZoneTypes";
const ZONE_PANEL_KEY = "worldZonePanelCollapsed";

const NUMBERED = /^radarmap_(\d+)$/i;

const FIX_NUMBERS = new Set([5, 10]);
const OCEAN_TILE = "radarmap_20";

type Pos = { x: number; y: number };
type Layout = Record<string, Pos>;
type RGB = [number, number, number];
const EMPTY_LAYOUT: Layout = {};

export function WorldWorkspace({ active }: { active: boolean }) {
    const { config } = useSettings();
    const clientRoot = config?.clientRoot ?? "";
    const dataRoot = config?.dataRoot ?? "";

    const [activated, setActivated] = useState(active);
    useEffect(() => {
        if (active && !activated) setActivated(true);
    }, [active, activated]);

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
                <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-text-faint)]">world</span>
            </div>
            <div className="relative min-h-0 flex-1">
                {!clientRoot ? (
                    <Placeholder>Set the L2 client folder in Settings to load the world map.</Placeholder>
                ) : !activated ? (
                    <Placeholder>Loading…</Placeholder>
                ) : (
                    <RadarMapView active={active} clientRoot={clientRoot} dataRoot={dataRoot} />
                )}
            </div>
        </div>
    );
}

function RadarMapView({ active, clientRoot, dataRoot }: { active: boolean; clientRoot: string; dataRoot: string }) {
    const [tiles, setTiles] = useState<string[]>([]);
    const saved = useJsonPref<Layout>(LAYOUT_KEY, EMPTY_LAYOUT);
    const oceanColor = useOceanColor(clientRoot);

    const [zones, setZones] = useState<Zone[]>([]);
    const enabledTypes = useStringSet(ZONE_TYPES_KEY);
    useEffect(() => {
        if (!dataRoot || zones.length > 0) return;
        let cancelled = false;
        loadZones(dataRoot).then((z) => !cancelled && setZones(z));
        return () => {
            cancelled = true;
        };
    }, [dataRoot, zones.length]);

    const [selected, setSelected] = useState<{ rx: number; ry: number } | null>(null);

    const zoneTypes = useMemo(() => {
        const counts = new Map<string, number>();
        for (const z of zones) counts.set(z.type, (counts.get(z.type) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [zones]);

    useEffect(() => {
        let cancelled = false;
        listTextures(RADAR_PACKAGE, clientRoot).then((names) => {
            if (cancelled) return;
            setTiles(names.filter((n) => NUMBERED.test(n)).sort((a, b) => num(a) - num(b)));
        });
        return () => {
            cancelled = true;
        };
    }, [clientRoot]);

    const [reloading, setReloading] = useState(false);
    const reloadAll = useCallback(async () => {
        if (!dataRoot) return;
        setReloading(true);
        try {
            const z = await loadZones(dataRoot);
            setZones(z);
        } finally {
            setReloading(false);
        }
    }, [dataRoot]);

    const setToolbarSlot = useSetToolbarSlot();
    useEffect(() => {
        if (!active) return;
        setToolbarSlot(
            <EditActions
                onUndo={() => {}}
                onRedo={() => {}}
                canUndo={false}
                canRedo={false}
                onSave={() => {}}
                saveDisabled
                saveTitle="World view has no editable state yet"
                onReload={reloadAll}
                reloadDisabled={reloading}
            />
        );
        return () => setToolbarSlot(null);
    }, [active, setToolbarSlot, reloadAll, reloading]);

    const placed = useMemo(() => {
        if (tiles.length === 0) return null;
        const layout = gridFill(tiles, saved);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of Object.values(layout)) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + TILE);
            maxY = Math.max(maxY, p.y + TILE);
        }
        const w = maxX - minX;
        const h = maxY - minY;
        const items = tiles.map((name) => {
            const p = layout[name];
            const lng = p.x - minX;
            const top = p.y - minY;
            const bounds: LatLngBoundsExpression = [
                [h - top - TILE, lng],
                [h - top, lng + TILE]
            ];
            return { name, bounds };
        });
        const total: LatLngBoundsExpression = [
            [0, 0],
            [h, w]
        ];
        return { items, total, w, h };
    }, [tiles, saved]);

    const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

    const [settledTiles, setSettledTiles] = useState<Set<string>>(() => new Set());
    useEffect(() => {
        setSettledTiles(new Set());
    }, [clientRoot, tiles]);
    const handleTileReady = useCallback((name: string) => {
        setSettledTiles((prev) => {
            if (prev.has(name)) return prev;
            const next = new Set(prev);
            next.add(name);
            return next;
        });
    }, []);
    const totalTiles = placed?.items.length ?? 0;
    const tilesReady = totalTiles > 0 && settledTiles.size >= totalTiles;

    if (!placed) {
        return <Placeholder>Loading world map…</Placeholder>;
    }

    return (
        <div className="absolute inset-0">
            <MapContainer
                crs={CRS.Simple}
                bounds={placed.total}
                minZoom={-14}
                maxZoom={6}
                zoomSnap={0.25}
                maxBoundsViscosity={1}
                attributionControl={false}
                className="absolute inset-0"
                style={{ background: "var(--color-bg)" }}
            >
                <FitView active={active} bounds={placed.total} viewKey={JSON.stringify(placed.total)} />
                {placed.items.map((it) => (
                    <TileOverlay
                        key={it.name}
                        name={it.name}
                        bounds={it.bounds}
                        clientRoot={clientRoot}
                        oceanColor={oceanColor}
                        pngEdits={true}
                        onReady={handleTileReady}
                    />
                ))}
                <RegionGrid w={placed.w} h={placed.h} onSelect={(rx, ry) => setSelected({ rx, ry })} />
                <ZoneLayer zones={zones} enabled={enabledTypes} w={placed.w} h={placed.h} />
                <CursorTracker w={placed.w} h={placed.h} onMove={setCursor} />
            </MapContainer>
            {cursor && (
                <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] rounded bg-black/70 px-2 py-1 font-mono text-[11px] text-white/90">
                    X {cursor.x} · Y {cursor.y} · region {regionOf(cursor.x, cursor.y).rx}_
                    {regionOf(cursor.x, cursor.y).ry}
                </div>
            )}
            <ZonePanel types={zoneTypes} enabled={enabledTypes} />
            {selected && (
                <TileInfoModal
                    rx={selected.rx}
                    ry={selected.ry}
                    placed={placed}
                    clientRoot={clientRoot}
                    onClose={() => setSelected(null)}
                />
            )}
            <div
                className={`absolute inset-0 z-[1500] flex flex-col items-center justify-center gap-3 bg-[var(--color-bg)] transition-opacity duration-300 ${
                    tilesReady ? "pointer-events-none opacity-0" : "opacity-100"
                }`}
            >
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent-2)]" />
                <div className="font-mono text-[12px] text-[var(--color-text-faint)]">
                    Loading map textures… {settledTiles.size} / {totalTiles}
                </div>
            </div>
        </div>
    );
}

function ZonePanel({ types, enabled }: { types: Array<[string, number]>; enabled: ReadonlySet<string> }) {
    const collapsed = useJsonPref<boolean>(ZONE_PANEL_KEY, false);
    return (
        <div className="absolute right-2 top-2 z-[1000] flex max-h-[calc(100%-1rem)] w-52 flex-col rounded border border-[var(--color-border)] bg-black/85 text-[10px] text-white/85 shadow">
            <button
                type="button"
                onClick={() => setJsonPref(ZONE_PANEL_KEY, !collapsed)}
                className="flex items-center justify-between px-2 py-1.5 hover:bg-white/5"
            >
                <span className="uppercase tracking-[0.2em] text-[var(--color-text-faint)]">zone types</span>
                <span className="text-[var(--color-text-faint)]">{collapsed ? "▸" : "▾"}</span>
            </button>
            {!collapsed && (
                <>
                    <div className="flex justify-end gap-1 border-t border-white/10 px-2 py-1">
                        <button
                            type="button"
                            className="rounded bg-white/10 px-1.5 hover:bg-white/20"
                            onClick={() =>
                                setStringSet(
                                    ZONE_TYPES_KEY,
                                    types.map(([t]) => t)
                                )
                            }
                        >
                            all
                        </button>
                        <button
                            type="button"
                            className="rounded bg-white/10 px-1.5 hover:bg-white/20"
                            onClick={() => setStringSet(ZONE_TYPES_KEY, [])}
                        >
                            none
                        </button>
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-auto px-2 py-1.5">
                        {types.length === 0 ? (
                            <span className="text-[var(--color-text-faint)]">loading…</span>
                        ) : (
                            types.map(([t, n]) => (
                                <label
                                    key={t}
                                    title={zoneTypeInfo(t)}
                                    className="flex items-center gap-1.5 leading-tight"
                                >
                                    <input
                                        type="checkbox"
                                        checked={enabled.has(t)}
                                        onChange={() => toggleStringSetMember(ZONE_TYPES_KEY, t)}
                                        className="accent-[var(--color-accent-2)]"
                                    />
                                    <span className="mono flex-1 truncate">{t || "(none)"}</span>
                                    <span className="text-[var(--color-text-faint)]">{n}</span>
                                </label>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function CursorTracker({
    w,
    h,
    onMove
}: {
    w: number;
    h: number;
    onMove: (p: { x: number; y: number } | null) => void;
}) {
    useMapEvents({
        mousemove(e) {
            onMove(mapToWorld(e.latlng.lat, e.latlng.lng, w, h));
        },
        mouseout() {
            onMove(null);
        }
    });
    return null;
}

const GRID_STYLE: PathOptions = {
    color: "#ffffff",
    weight: 1,
    opacity: 0.18,
    fill: true,
    fillColor: "#ffffff",
    fillOpacity: 0
};
const HOVER_STYLE: PathOptions = {
    color: "#7dd3fc",
    weight: 2,
    opacity: 1,
    fill: true,
    fillColor: "#7dd3fc",
    fillOpacity: 0.3
};

function setRectStyle(e: LeafletMouseEvent, style: PathOptions) {
    (e.target as unknown as { setStyle(o: PathOptions): void }).setStyle(style);
}

function ZoneLayer({ zones, enabled, w, h }: { zones: Zone[]; enabled: ReadonlySet<string>; w: number; h: number }) {
    return (
        <>
            {zones.map((z, i) => {
                if (!enabled.has(z.type)) return null;
                const pts: Array<[number, number]> =
                    z.points.length === 2
                        ? [z.points[0], [z.points[1][0], z.points[0][1]], z.points[1], [z.points[0][0], z.points[1][1]]]
                        : z.points;
                const positions = pts.map(([x, y]) => {
                    const m = worldToMap(x, y, w, h);
                    return [m.lat, m.lng] as [number, number];
                });
                const col = zoneColor(z.type);
                return (
                    <Polygon
                        key={`${z.name}:${i}`}
                        positions={positions}
                        pathOptions={{
                            color: col,
                            weight: 1,
                            opacity: 0.9,
                            fillColor: col,
                            fillOpacity: 0.15
                        }}
                    >
                        <Tooltip sticky>
                            {z.name} · {z.type}
                        </Tooltip>
                    </Polygon>
                );
            })}
        </>
    );
}

function RegionGrid({ w, h, onSelect }: { w: number; h: number; onSelect: (rx: number, ry: number) => void }) {
    const cells = useMemo(() => {
        const cols = Math.round(WORLD_W / REGION_SIZE);
        const rows = Math.round(WORLD_H / REGION_SIZE);
        const rx0 = Math.round(WORLD.xMin / REGION_SIZE) + 20;
        const ry0 = Math.round(WORLD.yMin / REGION_SIZE) + 18;
        const out: { key: string; rx: number; ry: number; bounds: LatLngBoundsExpression }[] = [];
        for (let cx = 0; cx < cols; cx++) {
            for (let cy = 0; cy < rows; cy++) {
                const x0 = WORLD.xMin + cx * REGION_SIZE;
                const y0 = WORLD.yMin + cy * REGION_SIZE;
                const a = worldToMap(x0, y0, w, h);
                const b = worldToMap(x0 + REGION_SIZE, y0 + REGION_SIZE, w, h);
                out.push({
                    key: `${rx0 + cx}_${ry0 + cy}`,
                    rx: rx0 + cx,
                    ry: ry0 + cy,
                    bounds: [
                        [a.lat, a.lng],
                        [b.lat, b.lng]
                    ]
                });
            }
        }
        return out;
    }, [w, h]);

    return (
        <>
            {cells.map((c) => (
                <Rectangle
                    key={c.key}
                    bounds={c.bounds}
                    pathOptions={GRID_STYLE}
                    eventHandlers={{
                        mouseover: (e) => setRectStyle(e, HOVER_STYLE),
                        mouseout: (e) => setRectStyle(e, GRID_STYLE),
                        click: () => onSelect(c.rx, c.ry)
                    }}
                />
            ))}
        </>
    );
}

function TileOverlay({
    name,
    bounds,
    clientRoot,
    oceanColor,
    pngEdits,
    onReady
}: {
    name: string;
    bounds: LatLngBoundsExpression;
    clientRoot: string;
    oceanColor: RGB | null;
    pngEdits: boolean;
    onReady?: (name: string) => void;
}) {
    const { url: raw, settled } = useTextureUrl(`${RADAR_PACKAGE}.${name}`, clientRoot);
    useEffect(() => {
        if (settled) onReady?.(name);
    }, [settled, name, onReady]);

    const needsFix = pngEdits && FIX_NUMBERS.has(num(name));
    const [fixed, setFixed] = useState<string | null>(null);
    useEffect(() => {
        if (!needsFix || !raw || !oceanColor) {
            setFixed(null);
            return;
        }
        let cancelled = false;
        recolorBlackToOcean(raw, oceanColor).then((u) => !cancelled && setFixed(u));
        return () => {
            cancelled = true;
        };
    }, [needsFix, raw, oceanColor]);

    const url = needsFix ? fixed : raw;
    if (!url) return null;
    return <ImageOverlay url={url} bounds={bounds} />;
}

function FitView({ active, bounds, viewKey }: { active: boolean; bounds: LatLngBoundsExpression; viewKey: string }) {
    const map = useMap();
    useEffect(() => {
        if (!active) return;
        const apply = () => {
            map.invalidateSize();
            const coverZoom = map.getBoundsZoom(bounds, true);
            map.setMinZoom(coverZoom);
            map.setMaxBounds(bounds);
            map.fitBounds(bounds, { animate: false });
            if (map.getZoom() < coverZoom) map.setZoom(coverZoom);
        };
        const id = setTimeout(apply, 0);
        window.addEventListener("resize", apply);
        return () => {
            clearTimeout(id);
            window.removeEventListener("resize", apply);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewKey, map]);
    return null;
}

function useTextureUrl(ref: string, clientRoot: string): { url: string | null; settled: boolean } {
    const [state, setState] = useState<{ url: string | null; settled: boolean }>({ url: null, settled: false });
    useEffect(() => {
        let cancelled = false;
        setState({ url: null, settled: false });
        const handle = (e: TextureEntry) => {
            if (cancelled || e.status === "loading") return;
            setState({ url: e.status === "loaded" ? e.url : null, settled: true });
        };
        const unsub = subscribeTexture(ref, handle);
        loadTexture(ref, clientRoot)
            .then(handle)
            .catch(() => !cancelled && setState({ url: null, settled: true }));
        return () => {
            cancelled = true;
            unsub();
        };
    }, [ref, clientRoot]);
    return state;
}

function useOceanColor(clientRoot: string): RGB | null {
    const { url } = useTextureUrl(`${RADAR_PACKAGE}.${OCEAN_TILE}`, clientRoot);
    const [color, setColor] = useState<RGB | null>(null);
    useEffect(() => {
        if (!url) {
            setColor(null);
            return;
        }
        let cancelled = false;
        loadImg(url)
            .then((img) => {
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                const ctx = canvasOf(img, w, h);
                if (!ctx) return;
                const s = Math.min(64, w, h);
                const d = ctx.getImageData(w - s, h - s, s, s).data;
                let r = 0;
                let g = 0;
                let b = 0;
                const n = d.length / 4;
                for (let i = 0; i < d.length; i += 4) {
                    r += d[i];
                    g += d[i + 1];
                    b += d[i + 2];
                }
                if (!cancelled) setColor([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [url]);
    return color;
}

const recolorCache = new Map<string, string>();

async function recolorBlackToOcean(url: string, ocean: RGB): Promise<string> {
    const key = `${url}|${ocean.join(",")}`;
    const cached = recolorCache.get(key);
    if (cached) return cached;
    const img = await loadImg(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const ctx = canvasOf(img, w, h);
    if (!ctx) return url;
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const T = 32;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i] < T && d[i + 1] < T && d[i + 2] < T) {
            d[i] = ocean[0];
            d[i + 1] = ocean[1];
            d[i + 2] = ocean[2];
        }
    }
    ctx.putImageData(id, 0, 0);
    const out = ctx.canvas.toDataURL("image/png");
    recolorCache.set(key, out);
    return out;
}

function canvasOf(img: HTMLImageElement, w: number, h: number): CanvasRenderingContext2D | null {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (ctx) ctx.drawImage(img, 0, 0);
    return ctx;
}

function loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function num(name: string): number {
    const m = name.match(NUMBERED);
    return m ? parseInt(m[1], 10) : 0;
}

function gridFill(tiles: string[], saved: Layout): Layout {
    const out: Layout = {};
    tiles.forEach((name, i) => {
        out[name] = saved[name] ?? { x: (i % COLS) * TILE, y: Math.floor(i / COLS) * TILE };
    });
    return out;
}

interface PlacedTiles {
    items: Array<{ name: string; bounds: LatLngBoundsExpression }>;
    w: number;
    h: number;
}

function TileInfoModal({
    rx,
    ry,
    placed,
    clientRoot,
    onClose
}: {
    rx: number;
    ry: number;
    placed: PlacedTiles;
    clientRoot: string;
    onClose: () => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const regionInfo = useMemo(() => {
        const x0 = (rx - 20) * REGION_SIZE;
        const y0 = (ry - 18) * REGION_SIZE;
        const tl = worldToMap(x0, y0, placed.w, placed.h);
        const br = worldToMap(x0 + REGION_SIZE, y0 + REGION_SIZE, placed.w, placed.h);
        const regionLatMin = Math.min(tl.lat, br.lat);
        const regionLatMax = Math.max(tl.lat, br.lat);
        const regionLngMin = Math.min(tl.lng, br.lng);
        const regionLngMax = Math.max(tl.lng, br.lng);
        const overlaps = placed.items.filter((it) => {
            const b = it.bounds as [[number, number], [number, number]];
            const latMin = Math.min(b[0][0], b[1][0]);
            const latMax = Math.max(b[0][0], b[1][0]);
            const lngMin = Math.min(b[0][1], b[1][1]);
            const lngMax = Math.max(b[0][1], b[1][1]);
            return latMin < regionLatMax && latMax > regionLatMin && lngMin < regionLngMax && lngMax > regionLngMin;
        });
        if (overlaps.length === 0) return null;
        return { regionLatMin, regionLatMax, regionLngMin, regionLngMax, tiles: overlaps };
    }, [rx, ry, placed]);

    return (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
            <div
                className="flex max-h-[85vh] w-[640px] max-w-full flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] px-5 py-3">
                    <div className="font-mono text-base text-[var(--color-text)]">
                        Region {rx}_{ry}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded px-2 text-lg leading-none text-[var(--color-text-faint)] hover:bg-white/10"
                    >
                        ×
                    </button>
                </header>
                <div className="flex shrink-0 items-center justify-center border-b border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
                    {regionInfo ? (
                        <div
                            className="overflow-hidden border border-[var(--color-border)]"
                            style={{
                                aspectRatio: `${regionInfo.regionLngMax - regionInfo.regionLngMin} / ${
                                    regionInfo.regionLatMax - regionInfo.regionLatMin
                                }`,
                                width: "100%",
                                maxWidth: "100%",
                                maxHeight: "480px"
                            }}
                        >
                            <RegionCrop info={regionInfo} clientRoot={clientRoot} />
                        </div>
                    ) : (
                        <div className="text-[11px] text-[var(--color-text-faint)]">no tile covers this region</div>
                    )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[12px] text-[var(--color-text)]">
                    {/* room for zones / spawns / hunting / notes — added later */}
                </div>
            </div>
        </div>
    );
}

interface RegionInfo {
    regionLatMin: number;
    regionLatMax: number;
    regionLngMin: number;
    regionLngMax: number;
    tiles: Array<{ name: string; bounds: LatLngBoundsExpression }>;
}

function RegionCrop({ info, clientRoot }: { info: RegionInfo; clientRoot: string }) {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setUrl(null);
        setError(false);
        composeRegion(info, clientRoot)
            .then((dataUrl) => {
                if (cancelled) return;
                if (dataUrl) setUrl(dataUrl);
                else setError(true);
            })
            .catch(() => {
                if (!cancelled) setError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [info, clientRoot]);

    if (!url) {
        return (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-[var(--color-text-faint)]">
                {error ? "tile image unavailable" : "loading tile…"}
            </div>
        );
    }
    return (
        <img
            src={url}
            alt="region tile"
            className="block h-full w-full object-contain"
            style={{ imageRendering: "pixelated" }}
        />
    );
}

async function composeRegion(info: RegionInfo, clientRoot: string): Promise<string | null> {
    const regionW = info.regionLngMax - info.regionLngMin;
    const regionH = info.regionLatMax - info.regionLatMin;
    if (regionW <= 0 || regionH <= 0) return null;

    let dpi = 0;
    const loaded: Array<{
        img: HTMLImageElement;
        tLngMin: number;
        tLngMax: number;
        tLatMin: number;
        tLatMax: number;
    }> = [];
    for (const it of info.tiles) {
        try {
            const entry = await loadTexture(`${RADAR_PACKAGE}.${it.name}`, clientRoot);
            if (entry.status !== "loaded" || !entry.url) continue;
            const img = await loadImg(entry.url);
            const b = it.bounds as [[number, number], [number, number]];
            const tLatMin = Math.min(b[0][0], b[1][0]);
            const tLatMax = Math.max(b[0][0], b[1][0]);
            const tLngMin = Math.min(b[0][1], b[1][1]);
            const tLngMax = Math.max(b[0][1], b[1][1]);
            loaded.push({ img, tLngMin, tLngMax, tLatMin, tLatMax });
            dpi = Math.max(dpi, img.naturalWidth / (tLngMax - tLngMin));
        } catch {}
    }
    if (loaded.length === 0 || dpi <= 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(regionW * dpi));
    canvas.height = Math.max(1, Math.round(regionH * dpi));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;

    let drew = false;
    for (const t of loaded) {
        const iLngMin = Math.max(t.tLngMin, info.regionLngMin);
        const iLngMax = Math.min(t.tLngMax, info.regionLngMax);
        const iLatMin = Math.max(t.tLatMin, info.regionLatMin);
        const iLatMax = Math.min(t.tLatMax, info.regionLatMax);
        if (iLngMin >= iLngMax || iLatMin >= iLatMax) continue;
        const tW = t.tLngMax - t.tLngMin;
        const tH = t.tLatMax - t.tLatMin;
        const sx = ((iLngMin - t.tLngMin) / tW) * t.img.naturalWidth;
        const sw = ((iLngMax - iLngMin) / tW) * t.img.naturalWidth;
        const sy = ((t.tLatMax - iLatMax) / tH) * t.img.naturalHeight;
        const sh = ((iLatMax - iLatMin) / tH) * t.img.naturalHeight;
        const dx = ((iLngMin - info.regionLngMin) / regionW) * canvas.width;
        const dw = ((iLngMax - iLngMin) / regionW) * canvas.width;
        const dy = ((info.regionLatMax - iLatMax) / regionH) * canvas.height;
        const dh = ((iLatMax - iLatMin) / regionH) * canvas.height;
        ctx.drawImage(t.img, sx, sy, sw, sh, dx, dy, dw, dh);
        drew = true;
    }
    if (!drew) return null;
    return canvas.toDataURL("image/png");
}

function Placeholder({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-full items-center justify-center p-8 text-[12px] text-[var(--color-text-faint)]">
            {children}
        </div>
    );
}
