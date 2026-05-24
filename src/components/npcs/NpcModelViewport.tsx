import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { MeshData } from "../../lib/ipc";

/**
 * Phase-2 viewport: renders the decoded packed positions as a point cloud.
 * Triangles + materials land in phase 3; until then, the dot-silhouette is
 * enough to confirm the whole decryption → parse → unpack pipeline lines up.
 *
 * L2 mesh coordinates are Unreal-style (z-up, right-handed). Three.js is
 * y-up; we mount the mesh under a -90° X rotation so its Z axis becomes
 * three.js's Y (up), and frame the camera against the cloud's actual extents
 * rather than the (sometimes oversized) declared bbox.
 */
export function NpcModelViewport({ mesh }: { mesh: MeshData }) {
    // Compute the actual extents of the point cloud — the declared bbox can
    // be larger than the geometry occupies, which throws off camera framing.
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
        // Mesh-space center → three.js-space center via the rotation we apply
        // to the group below. (-π/2 around X swaps Y↔−Z, Z→Y.)
        const worldCenter: [number, number, number] = [cx, cz, -cy];
        return { center: worldCenter, radius };
    }, [mesh.positions]);

    const camDistance = cloudInfo.radius * 2.2;
    return (
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
                <PointCloud positions={mesh.positions} />
                <BoundsBox min={mesh.bounds.min} max={mesh.bounds.max} />
            </group>
        </Canvas>
    );
}

function PointCloud({ positions }: { positions: number[] }) {
    const geomRef = useRef<THREE.BufferGeometry>(null);
    const { posBuffer, colorBuffer } = useMemo(() => {
        const posBuffer = new Float32Array(positions);
        // Color points by mesh-Z (height) so the silhouette pops even without
        // triangles. Cool blue at the bottom → hot pink at the top.
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
