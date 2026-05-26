import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { MeshData } from "./ipc";

function buildExportableMesh(mesh: MeshData, texture: THREE.Texture | null): THREE.Mesh {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(mesh.positions), 3));
    if (mesh.wedgeUvs.length === (mesh.positions.length / 3) * 2) {
        geom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(mesh.wedgeUvs), 2));
    }
    if (mesh.triangleWedges.length >= 3) {
        const useShort = mesh.triangleWedges.every((i) => i < 65535) && mesh.triangleWedges.length > 0;
        const idx = useShort ? new Uint16Array(mesh.triangleWedges) : new Uint32Array(mesh.triangleWedges);
        geom.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    geom.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.DoubleSide,
        metalness: 0.05,
        roughness: 0.7,
        color: 0xffffff
    });
    const out = new THREE.Mesh(geom, material);
    out.name = mesh.exportName.replace(/[^A-Za-z0-9_.-]+/g, "_") || "mesh";
    return out;
}

export async function exportMeshAsGlb(mesh: MeshData, texture: THREE.Texture | null): Promise<ArrayBuffer> {
    const obj = buildExportableMesh(mesh, texture);
    const exporter = new GLTFExporter();
    return await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
            obj,
            (result) => {
                if (result instanceof ArrayBuffer) resolve(result);
                else reject(new Error("GLTFExporter returned JSON instead of binary"));
            },
            (err) => reject(err),
            { binary: true, embedImages: true }
        );
    });
}

export function exportMeshAsObj(mesh: MeshData): string {
    const lines: string[] = [];
    lines.push(`# Exported from L2 Editor`);
    lines.push(`# ${mesh.exportName}`);
    lines.push(`# verts: ${mesh.positions.length / 3}, tris: ${mesh.triangleWedges.length / 3}`);
    lines.push(`o ${mesh.exportName.replace(/[^A-Za-z0-9_.-]+/g, "_") || "mesh"}`);
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
        lines.push(`v ${p[i].toFixed(6)} ${p[i + 1].toFixed(6)} ${p[i + 2].toFixed(6)}`);
    }
    const uvs = mesh.wedgeUvs;
    const hasUvs = uvs.length === (p.length / 3) * 2;
    if (hasUvs) {
        for (let i = 0; i < uvs.length; i += 2) {
            lines.push(`vt ${uvs[i].toFixed(6)} ${(1 - uvs[i + 1]).toFixed(6)}`);
        }
    }
    const idx = mesh.triangleWedges;
    for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i] + 1;
        const b = idx[i + 1] + 1;
        const c = idx[i + 2] + 1;
        if (hasUvs) lines.push(`f ${a}/${a} ${b}/${b} ${c}/${c}`);
        else lines.push(`f ${a} ${b} ${c}`);
    }
    return lines.join("\n") + "\n";
}

export function bytesFromArrayBuffer(buf: ArrayBuffer): number[] {
    const view = new Uint8Array(buf);
    const out: number[] = new Array(view.length);
    for (let i = 0; i < view.length; i++) out[i] = view[i];
    return out;
}

export function bytesFromString(s: string): number[] {
    const view = new TextEncoder().encode(s);
    const out: number[] = new Array(view.length);
    for (let i = 0; i < view.length; i++) out[i] = view[i];
    return out;
}
