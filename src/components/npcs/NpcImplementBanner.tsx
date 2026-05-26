import { implementDatRow } from "../../lib/datImplement";
import { logger } from "../../lib/logger";
import { useSettings } from "../../state/SettingsContext";
import { ImplementBanner } from "../ImplementBanner";

export function NpcImplementBanner({
    datKey,
    datLabel,
    npcId,
    indexField,
    overrides,
    note,
    onImplemented
}: {
    datKey: "npc_name" | "npc_grp" | "npc_string" | "npc_teleporter";
    datLabel: string;
    npcId: number;
    indexField: string;
    overrides: Record<string, unknown>;
    note?: string;
    onImplemented?: () => void;
}) {
    const { refreshPendingTier2Edits } = useSettings();
    const run = async () => {
        try {
            const newId = await implementDatRow(datKey, indexField, { ...overrides, [indexField]: npcId });
            if (newId == null) {
                logger.warn("npc-implement", `no template row for ${datKey}`, { npcId });
                return { ok: false, error: `Could not implement: ${datLabel} has no template row to clone from.` };
            }
            await refreshPendingTier2Edits(datKey);
            onImplemented?.();
            logger.info("npc-implement", `queued ${datLabel} row for #${npcId}`);
            return { ok: true };
        } catch (e) {
            logger.warn("npc-implement", `implement failed`, { datKey, npcId, err: String(e) });
            return { ok: false, error: String(e) };
        }
    };
    return (
        <ImplementBanner
            label={`Not present in ${datLabel} — this NPC has no client-side row.`}
            note={note}
            onImplement={run}
        />
    );
}
