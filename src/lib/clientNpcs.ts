import { ipc } from "./ipc";

export interface ClientNpc {
    id: number;
    name: string;
    nick: string;
}

function num(row: Record<string, unknown>, key: string): number {
    const v = row[key];
    return typeof v === "number" ? v : Number(v) || 0;
}

function str(row: Record<string, unknown>, key: string): string {
    const v = row[key];
    return typeof v === "string" ? v : "";
}

export async function loadClientNpcs(): Promise<Map<number, ClientNpc>> {
    let rows: Record<string, unknown>[];
    try {
        rows = await ipc.dumpGenericDatRows("npc_name");
    } catch {
        return new Map();
    }
    const out = new Map<number, ClientNpc>();
    for (const r of rows) {
        const id = num(r, "id");
        if (!id) continue;
        out.set(id, { id, name: str(r, "name"), nick: str(r, "nick") });
    }
    return out;
}
