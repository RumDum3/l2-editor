import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ipc, type MeshData } from "../../lib/ipc";
import { logger } from "../../lib/logger";
import {
    bytesFromArrayBuffer,
    bytesFromString,
    exportMeshAsGlb,
    exportMeshAsObj
} from "../../lib/meshExport";
import { loadTexture } from "../../lib/textureCache";

type RenderMode = "auto" | "mesh" | "points" | "wireframe";

export function NpcModelViewport({
    mesh,
    clientRoot,
    textureOverrides = []
}: {
    mesh: MeshData;
    clientRoot: string;
    textureOverrides?: string[];
}) {
    const resolvedTextures = useMemo(() => {
        if (textureOverrides.length > 0) {
            return textureOverrides
                .map((s) => {
                    const dot = s.indexOf(".");
                    if (dot < 0) return null;
                    return { package: s.slice(0, dot), name: s.slice(dot + 1) };
                })
                .filter((x): x is { package: string; name: string } => x !== null);
        }
        return mesh.textures;
    }, [textureOverrides, mesh.textures]);
    const hasTriangles = mesh.triangleWedges.length >= 3;
    const [mode, setMode] = useState<RenderMode>("auto");
    const [textureEnabled, setTextureEnabled] = useState<boolean>(true);
    const effectiveMode: RenderMode =
        mode === "auto" ? (hasTriangles ? "mesh" : "points") : mode;
    const availableModes: RenderMode[] = hasTriangles ? ["mesh", "wireframe", "points"] : ["points"];
    const cloudInfo = useMemo(() => {
        const p = mesh.positions;
        if (p.length === 0) {
            return { center: [0, 0, 0] as [number, number, number], radius: 1 };
        }
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < p.length; i += 3) {
            const x = p[i], y = p[i + 1], z = p[i + 2];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;
        const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
        const radius = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz) / 2, 1);
        const worldCenter: [number, number, number] = [cx, cz, -cy];
        return { center: worldCenter, radius };
    }, [mesh.positions]);

    const [textures, setTextures] = useState<(THREE.Texture | null)[]>([]);
    const [texStatus, setTexStatus] = useState<string>("none");
    const refsKey = resolvedTextures.map((r) => `${r.package}.${r.name}`).join("|");
    useEffect(() => {
        let cancelled = false;
        setTextures([]);
        if (resolvedTextures.length === 0) {
            setTexStatus("no refs");
            return;
        }
        if (!clientRoot) {
            setTexStatus("no clientRoot");
            return;
        }
        setTexStatus(`loading ${resolvedTextures.length} texture(s)…`);
        const result: (THREE.Texture | null)[] = new Array(resolvedTextures.length).fill(null);
        let remaining = resolvedTextures.length;
        const finalize = () => {
            if (cancelled) return;
            const okCount = result.filter((t) => t !== null).length;
            const first = resolvedTextures[0];
            const firstFile = `${first.package}.${first.name}`;
            const img0 = result[0]?.image as { width?: number; height?: number } | undefined;
            const dims = img0?.width && img0?.height ? ` (${img0.width}x${img0.height})` : "";
            setTexStatus(
                okCount === resolvedTextures.length
                    ? `ok ${okCount}/${resolvedTextures.length}: ${firstFile}${dims}`
                    : `${okCount}/${resolvedTextures.length} loaded`
            );
            setTextures(result);
        };
        resolvedTextures.forEach((ref, idx) => {
            const file = `${ref.package}.${ref.name}`;
            loadTexture(file, clientRoot).then((entry) => {
                if (cancelled) return;
                if (!entry.url) {
                    remaining -= 1;
                    if (remaining === 0) finalize();
                    return;
                }
                const loader = new THREE.TextureLoader();
                loader.load(
                    entry.url,
                    (t) => {
                        if (cancelled) {
                            t.dispose();
                            return;
                        }
                        t.colorSpace = THREE.SRGBColorSpace;
                        t.wrapS = THREE.RepeatWrapping;
                        t.wrapT = THREE.RepeatWrapping;
                        t.flipY = false;
                        t.needsUpdate = true;
                        result[idx] = t;
                        remaining -= 1;
                        if (remaining === 0) finalize();
                    },
                    undefined,
                    () => {
                        remaining -= 1;
                        if (remaining === 0) finalize();
                    }
                );
            });
        });
        return () => {
            cancelled = true;
        };
    }, [refsKey, clientRoot]);

    const [exportBusy, setExportBusy] = useState<"glb" | "obj" | null>(null);
    const safeName = (mesh.exportName || "mesh").replace(/[^A-Za-z0-9_.-]+/g, "_");
    const exportAs = async (format: "glb" | "obj") => {
        if (exportBusy) return;
        const filters =
            format === "glb"
                ? [{ name: "glTF Binary", extensions: ["glb"] }]
                : [{ name: "Wavefront OBJ", extensions: ["obj"] }];
        const target = await saveDialog({
            defaultPath: `${safeName}.${format}`,
            filters
        });
        if (!target) return;
        setExportBusy(format);
        try {
            if (format === "glb") {
                const buf = await exportMeshAsGlb(mesh, textures[0] ?? null);
                await ipc.writeBinaryFile(target as string, bytesFromArrayBuffer(buf));
                logger.info("mesh-export", `wrote glb`, { path: target, bytes: buf.byteLength });
            } else {
                const text = exportMeshAsObj(mesh);
                await ipc.writeBinaryFile(target as string, bytesFromString(text));
                logger.info("mesh-export", `wrote obj`, { path: target, bytes: text.length });
            }
        } catch (e) {
            logger.warn("mesh-export", `failed`, { format, err: String(e) });
            console.error(`[mesh-export ${format}]`, e);
        } finally {
            setExportBusy(null);
        }
    };

    const camDistance = cloudInfo.radius * 2.2;
    return (
        <>
        <div className="pointer-events-auto absolute right-2 top-2 z-10 flex gap-1 text-[10px]">
            {availableModes.length > 1 && (
                <div className="flex gap-0.5 rounded border border-[var(--color-border)] bg-black/60 p-0.5">
                    {availableModes.map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setMode(m)}
                            className={`rounded px-1.5 py-0.5 ${
                                effectiveMode === m
                                    ? "bg-[var(--color-accent-2)]/30 text-[var(--color-accent)]"
                                    : "text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                            }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            )}
            {resolvedTextures.length > 0 && (
                <button
                    type="button"
                    onClick={() => setTextureEnabled((v) => !v)}
                    className={`rounded border border-[var(--color-border)] bg-black/60 px-1.5 py-1 ${
                        textureEnabled
                            ? "text-[var(--color-accent)]"
                            : "text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                    }`}
                    title={texStatus}
                >
                    texture {textureEnabled ? "on" : "off"}
                </button>
            )}
            <div className="flex gap-0.5 rounded border border-[var(--color-border)] bg-black/60 p-0.5">
                <button
                    type="button"
                    onClick={() => void exportAs("glb")}
                    disabled={!!exportBusy}
                    title="Export the mesh as glTF binary (.glb) — opens cleanly in Blender via File > Import > glTF 2.0"
                    className={`rounded px-1.5 py-0.5 ${
                        exportBusy === "glb"
                            ? "text-[var(--color-accent)]"
                            : "text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                    } ${exportBusy ? "opacity-60" : ""}`}
                >
                    {exportBusy === "glb" ? "exporting…" : "glb"}
                </button>
                <button
                    type="button"
                    onClick={() => void exportAs("obj")}
                    disabled={!!exportBusy}
                    title="Export the mesh as Wavefront .obj (vertices + UVs only, no skeleton or material)"
                    className={`rounded px-1.5 py-0.5 ${
                        exportBusy === "obj"
                            ? "text-[var(--color-accent)]"
                            : "text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                    } ${exportBusy ? "opacity-60" : ""}`}
                >
                    {exportBusy === "obj" ? "exporting…" : "obj"}
                </button>
            </div>
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-[var(--color-text-faint)]">
            tex: {texStatus}
        </div>
        <Canvas
            dpr={[1, 2]}
            style={{ background: "black" }}
            gl={{ antialias: true, preserveDrawingBuffer: false }}
        >
            <color attach="background" args={["#0a0a0c"]} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[10, 20, 10]} intensity={0.5} />
            <PerspectiveCamera
                makeDefault
                fov={35}
                position={[
                    cloudInfo.center[0] + camDistance,
                    cloudInfo.center[1] + camDistance * 0.3,
                    cloudInfo.center[2] + camDistance
                ]}
            />
            <OrbitControls target={cloudInfo.center} enableDamping makeDefault />
            <gridHelper args={[cloudInfo.radius * 4, 20, "#222", "#181818"]} position={[0, 0, 0]} />
            <axesHelper args={[cloudInfo.radius * 0.5]} />
            <group rotation={[-Math.PI / 2, 0, 0]}>
                {effectiveMode === "points" && <PointCloud positions={mesh.positions} />}
                {(effectiveMode === "mesh" || effectiveMode === "wireframe") && (
                    <SolidMesh
                        positions={mesh.positions}
                        indices={mesh.triangleWedges}
                        uvs={mesh.wedgeUvs}
                        sections={mesh.sections}
                        wireframe={effectiveMode === "wireframe"}
                        textures={textureEnabled ? textures : []}
                    />
                )}
                <BoundsBox min={mesh.bounds.min} max={mesh.bounds.max} />
            </group>
        </Canvas>
        </>
    );
}

type SectionInfo = MeshData["sections"][number];

function SolidMesh({
    positions,
    indices,
    uvs,
    sections,
    wireframe,
    textures
}: {
    positions: number[];
    indices: number[];
    uvs: number[];
    sections: SectionInfo[];
    wireframe: boolean;
    textures: (THREE.Texture | null)[];
}) {
    const geometry = useMemo(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
        const expectedUvs = (positions.length / 3) * 2;
        if (uvs.length > 0 && uvs.length === expectedUvs) {
            g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
        }
        const indexBuf =
            indices.length > 0 && Math.max(...indices) < 65535
                ? new Uint16Array(indices)
                : new Uint32Array(indices);
        g.setIndex(new THREE.BufferAttribute(indexBuf, 1));
        g.computeVertexNormals();
        g.computeBoundingSphere();
        return g;
    }, [positions, indices, uvs]);

    const usableSections = useMemo(() => {
        if (!sections || sections.length === 0) return [] as SectionInfo[];
        return sections.filter((s) => s.indexCount > 0 && s.firstIndex + s.indexCount <= indices.length);
    }, [sections, indices.length]);

    useMemo(() => {
        console.log(
            `[mesh-render] sections raw=${sections?.length ?? 0}, usable=${usableSections.length}, indices=${indices.length}, textures=${textures.length}, wireframe=${wireframe}`
        );
        if (sections && sections.length > 0) {
            for (const s of sections) {
                console.log(
                    `  [${s.kind}] first=${s.firstIndex} count=${s.indexCount} mat=${s.materialIndex} → tex[${s.textureIndex}]`
                );
            }
        }
    }, [sections, usableSections.length, indices.length, textures.length, wireframe]);

    const useMulti = !wireframe && textures.length > 0 && usableSections.length > 0;
    const useSingle = !wireframe && textures.length > 0 && !useMulti;

    if (useMulti) {
        return (
            <group>
                {usableSections.map((s, i) => (
                    <SectionMesh
                        key={`s${i}:${s.firstIndex}:${s.indexCount}`}
                        geometry={geometry}
                        section={s}
                        texture={textures[s.textureIndex] ?? textures[0] ?? null}
                    />
                ))}
            </group>
        );
    }

    if (useSingle) {
        const tex = textures.find((t) => t !== null) ?? null;
        return (
            <mesh geometry={geometry} key={`single-${tex?.uuid ?? "none"}`}>
                {tex ? (
                    <meshBasicMaterial
                        map={tex}
                        side={THREE.DoubleSide}
                        transparent
                        alphaTest={0.5}
                    />
                ) : (
                    <meshStandardMaterial
                        color="#cbd5e1"
                        flatShading
                        side={THREE.DoubleSide}
                        metalness={0.05}
                        roughness={0.65}
                    />
                )}
            </mesh>
        );
    }

    return (
        <mesh geometry={geometry} key={wireframe ? "wf" : "plain"}>
            <meshStandardMaterial
                color={wireframe ? "#7dd3fc" : "#cbd5e1"}
                wireframe={wireframe}
                flatShading={!wireframe}
                side={THREE.DoubleSide}
                metalness={0.05}
                roughness={0.65}
            />
        </mesh>
    );
}

function SectionMesh({
    geometry,
    section,
    texture
}: {
    geometry: THREE.BufferGeometry;
    section: SectionInfo;
    texture: THREE.Texture | null;
}) {
    const sliced = useMemo(() => {
        const g = geometry.clone();
        g.clearGroups();
        g.setDrawRange(section.firstIndex, section.indexCount);
        return g;
    }, [geometry, section.firstIndex, section.indexCount]);
    return (
        <mesh geometry={sliced} key={`tex-${texture?.uuid ?? "none"}`}>
            {texture ? (
                <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
            ) : (
                <meshStandardMaterial
                    color="#cbd5e1"
                    flatShading
                    side={THREE.DoubleSide}
                    metalness={0.05}
                    roughness={0.65}
                />
            )}
        </mesh>
    );
}

function PointCloud({ positions }: { positions: number[] }) {
    const geomRef = useRef<THREE.BufferGeometry>(null);
    const { posBuffer, colorBuffer } = useMemo(() => {
        const posBuffer = new Float32Array(positions);
        let minZ = Infinity, maxZ = -Infinity;
        for (let i = 2; i < posBuffer.length; i += 3) {
            const z = posBuffer[i];
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        const zSpan = Math.max(maxZ - minZ, 1e-6);
        const colorBuffer = new Float32Array((posBuffer.length / 3) * 3);
        const lo = new THREE.Color("#3b82f6");
        const hi = new THREE.Color("#f472b6");
        const tmp = new THREE.Color();
        for (let i = 0; i < posBuffer.length; i += 3) {
            const t = (posBuffer[i + 2] - minZ) / zSpan;
            tmp.copy(lo).lerp(hi, t);
            const j = i;
            colorBuffer[j] = tmp.r;
            colorBuffer[j + 1] = tmp.g;
            colorBuffer[j + 2] = tmp.b;
        }
        return { posBuffer, colorBuffer };
    }, [positions]);

    useEffect(() => {
        if (geomRef.current) geomRef.current.computeBoundingSphere();
    }, [posBuffer]);
    return (
        <points>
            <bufferGeometry ref={geomRef}>
                <bufferAttribute attach="attributes-position" args={[posBuffer, 3]} />
                <bufferAttribute attach="attributes-color" args={[colorBuffer, 3]} />
            </bufferGeometry>
            <pointsMaterial size={1.2} sizeAttenuation vertexColors />
        </points>
    );
}

function BoundsBox({ min, max }: { min: [number, number, number]; max: [number, number, number] }) {
    const geom = useMemo(() => {
        const w = max[0] - min[0];
        const h = max[1] - min[1];
        const d = max[2] - min[2];
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
        return new THREE.EdgesGeometry(g);
    }, [min, max]);
    return (
        <lineSegments geometry={geom}>
            <lineBasicMaterial color="#333" transparent opacity={0.6} />
        </lineSegments>
    );
}
