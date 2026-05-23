import { toggleStringSetMember, useStringSetMember } from "../../lib/uiPrefs";

const KEY = "classes.expandedTreeBlocks";

export function toggleTreeBlock(blockKey: string): void {
    toggleStringSetMember(KEY, blockKey);
}

export function useTreeBlockOpen(blockKey: string): boolean {
    return useStringSetMember(KEY, blockKey);
}
