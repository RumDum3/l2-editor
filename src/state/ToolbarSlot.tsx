import { createContext, useContext } from "react";
import type { ReactNode } from "react";

type Setter = (node: ReactNode | null) => void;

const ToolbarSlotContext = createContext<Setter>(() => {});

export const ToolbarSlotProvider = ToolbarSlotContext.Provider;

export function useSetToolbarSlot(): Setter {
    return useContext(ToolbarSlotContext);
}
