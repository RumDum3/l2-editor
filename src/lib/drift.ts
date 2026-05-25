export type DriftFieldKind = "mismatch" | "missingInClient" | "missingOnServer";

export type DriftField = {
    label: string;
    server: string | null;
    client: string | null;
    kind: DriftFieldKind;
    note?: string;
};

export type Drift = {
    subject?: string;
    clientSource?: string;
    fields: DriftField[];
};

export function compareValue(opts: {
    label: string;
    server: unknown;
    client: unknown;
    format?: (v: unknown) => string;
    eq?: (a: unknown, b: unknown) => boolean;
}): DriftField | null {
    const { label, server, client, format = defaultFormat, eq = defaultEq } = opts;
    const serverPresent = server !== undefined && server !== null && server !== "";
    const clientPresent = client !== undefined && client !== null && client !== "";
    if (!serverPresent && !clientPresent) return null;
    if (serverPresent && !clientPresent) {
        return { label, server: format(server), client: null, kind: "missingInClient" };
    }
    if (!serverPresent && clientPresent) {
        return { label, server: null, client: format(client), kind: "missingOnServer" };
    }
    if (eq(server, client)) return null;
    return { label, server: format(server), client: format(client), kind: "mismatch" };
}

function defaultFormat(v: unknown): string {
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4);
    if (typeof v === "string") return v;
    if (v == null) return "";
    return JSON.stringify(v);
}

function defaultEq(a: unknown, b: unknown): boolean {
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
    if (typeof a === "string" && typeof b === "string") {
        return normalizeString(a) === normalizeString(b);
    }
    return a === b;
}

function normalizeString(s: string): string {
    return s.replace(/[\s   　​]+/g, " ").trim().normalize("NFC");
}
