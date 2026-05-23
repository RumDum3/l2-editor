import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import type { SkillBrief } from "../../classes/skillCatalog";
import { SkillInfoModal } from "./SkillInfoModal";

type InspectFn = (skillId: number) => void;

const InspectCtx = createContext<InspectFn>(() => {});

export function useInspectSkill(): InspectFn {
    return useContext(InspectCtx);
}

export function SkillInspectorProvider({
    catalog,
    onOpenSkill,
    children
}: {
    catalog: Map<number, SkillBrief> | null;
    onOpenSkill?: (skillId: number) => void;
    children: ReactNode;
}) {
    const [id, setId] = useState<number | null>(null);
    const inspect = useCallback<InspectFn>((sid) => setId(sid), []);
    return (
        <InspectCtx.Provider value={inspect}>
            {children}
            <SkillInfoModal
                id={id}
                catalog={catalog}
                onClose={() => setId(null)}
                onOpenInEditor={
                    onOpenSkill
                        ? (sid) => {
                              setId(null);
                              onOpenSkill(sid);
                          }
                        : undefined
                }
            />
        </InspectCtx.Provider>
    );
}
