import { ipc } from "./ipc";

const templateCache = new Map<string, Record<string, unknown>>();

export async function getTemplateRow(datKey: string): Promise<Record<string, unknown> | null> {
    const cached = templateCache.get(datKey);
    if (cached) return cached;
    try {
        const rows = await ipc.dumpGenericDatRows(datKey);
        if (rows.length === 0) return null;
        templateCache.set(datKey, rows[0]);
        return rows[0];
    } catch {
        return null;
    }
}

export function invalidateTemplateCache(datKey?: string) {
    if (datKey) templateCache.delete(datKey);
    else templateCache.clear();
}

// Adds a row whose columns are copied from any existing row, with the given fields overridden.
// Used when a server entry has no matching client row at all ("implement in client dat").
export async function implementDatRow(
    datKey: string,
    indexField: string,
    overrides: Record<string, unknown>
): Promise<number | null> {
    const template = await getTemplateRow(datKey);
    if (!template) return null;
    const templateId = template[indexField];
    if (typeof templateId !== "number") return null;
    return ipc.addGenericDatRow(datKey, { [indexField]: templateId }, overrides);
}
