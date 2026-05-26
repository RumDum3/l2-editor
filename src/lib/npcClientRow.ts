import { useEffect, useState } from "react";
import { ipc } from "./ipc";
import { logger } from "./logger";

export interface NpcClientRow {
    npcName: Record<string, unknown> | null;
    npcGrp: Record<string, unknown> | null;
}

const EMPTY: NpcClientRow = { npcName: null, npcGrp: null };

export interface NpcClientRowState extends NpcClientRow {
    loading: boolean;
    refetch: () => void;
}

export function useNpcClientRow(npcId: number | null): NpcClientRowState {
    const [state, setState] = useState<NpcClientRow>(EMPTY);
    const [loading, setLoading] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!npcId) {
            setState(EMPTY);
            return;
        }
        let cancelled = false;
        setLoading(true);
        const fetchOne = (key: string) =>
            ipc
                .lookupGenericRows(key, [npcId])
                .then((rows) => rows[npcId]?.[0] ?? null)
                .catch((e) => {
                    logger.debug("npc-drift", `lookup ${key} failed`, { id: npcId, err: String(e) });
                    return null;
                });
        Promise.all([fetchOne("npc_name"), fetchOne("npc_grp")]).then(([npcName, npcGrp]) => {
            if (cancelled) return;
            setState({ npcName, npcGrp });
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [npcId, tick]);

    return {
        npcName: state.npcName,
        npcGrp: state.npcGrp,
        loading,
        refetch: () => setTick((t) => t + 1)
    };
}
