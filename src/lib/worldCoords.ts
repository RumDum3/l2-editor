export const REGION_SIZE = 32768;

export const WORLD = {
    xMin: -294912,
    xMax: 294912,
    yMin: -262144,
    yMax: 294912
} as const;

export const WORLD_W = WORLD.xMax - WORLD.xMin;
export const WORLD_H = WORLD.yMax - WORLD.yMin;

export function mapToWorld(lat: number, lng: number, w: number, h: number): { x: number; y: number } {
    return {
        x: Math.round(WORLD.xMin + (lng / w) * WORLD_W),
        y: Math.round(WORLD.yMax - (lat / h) * WORLD_H)
    };
}

export function worldToMap(x: number, y: number, w: number, h: number): { lat: number; lng: number } {
    return {
        lng: ((x - WORLD.xMin) / WORLD_W) * w,
        lat: ((WORLD.yMax - y) / WORLD_H) * h
    };
}

export function regionOf(x: number, y: number): { rx: number; ry: number } {
    return {
        rx: Math.floor(x / REGION_SIZE) + 20,
        ry: Math.floor(y / REGION_SIZE) + 18
    };
}
