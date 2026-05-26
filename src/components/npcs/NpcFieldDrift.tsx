import { compareValue, type Drift } from "../../lib/drift";
import { ipc } from "../../lib/ipc";
import { logger } from "../../lib/logger";
import { useSettings } from "../../state/SettingsContext";
import { DriftBadge } from "../Drift";

export interface NpcFieldDriftSpec {
    label: string;
    serverValue: unknown;
    clientValue: unknown;
    datKey: "npc_name" | "npc_grp";
    datField: string;
    locator: Record<string, unknown>;
    clientSource?: string;
    eq?: (a: unknown, b: unknown) => boolean;
    format?: (v: unknown) => string;
}

export function NpcFieldDrift({
    spec,
    npcId,
    onPushed,
    loading = false
}: {
    spec: NpcFieldDriftSpec;
    npcId: number;
    onPushed?: () => void;
    loading?: boolean;
}) {
    const { refreshPendingTier2Edits } = useSettings();
    if (loading) return null;
    const field = compareValue({
        label: spec.label,
        server: spec.serverValue,
        client: spec.clientValue,
        eq: spec.eq,
        format: spec.format
    });
    if (!field) return null;
    const drift: Drift = {
        subject: `#${npcId}`,
        clientSource: spec.clientSource ?? `${spec.datKey}.${spec.datField}`,
        fields: [field]
    };
    const push = async () => {
        try {
            await ipc.applyGenericDatEdits(spec.datKey, spec.locator, {
                [spec.datField]: spec.serverValue ?? ""
            });
            await refreshPendingTier2Edits(spec.datKey);
            onPushed?.();
            logger.info("npc-drift", `queued ${spec.datKey}.${spec.datField} update for #${npcId}`);
        } catch (e) {
            logger.warn("npc-drift", `push failed`, {
                npcId,
                dat: spec.datKey,
                field: spec.datField,
                err: String(e)
            });
        }
    };
    return (
        <div className="mt-0.5 flex items-center gap-1.5 pl-3 text-[10px]">
            <DriftBadge drift={drift} />
            <button
                type="button"
                onClick={push}
                className="rounded border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-1 py-[1px] text-[8px] font-semibold uppercase tracking-[0.15em] text-[var(--color-warning)] hover:bg-[var(--color-warning)]/20"
                title={`Push the server XML value to ${spec.datKey}.dat (Save flushes to disk)`}
            >
                push
            </button>
        </div>
    );
}
