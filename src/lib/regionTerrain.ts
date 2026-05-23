import { invoke } from "@tauri-apps/api/core";

export async function listMapRegions(clientRoot: string): Promise<Array<[number, number]>> {
    if (!clientRoot) return [];
    return invoke<Array<[number, number]>>("list_map_regions", { clientRoot });
}

export async function fetchRegionTile(clientRoot: string, x: number, y: number): Promise<string | null> {
    if (!clientRoot) return null;
    const png = await invoke<number[] | null>("read_region_terrain_texture", { clientRoot, x, y });
    if (!png || png.length === 0) return null;
    const bytes = new Uint8Array(png);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:image/png;base64,${btoa(bin)}`;
}
