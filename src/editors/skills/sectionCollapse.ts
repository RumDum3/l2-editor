import { toggleStringSetMember, useStringSetMember } from "../../lib/uiPrefs";

const KEY = "skillEditor.expandedSections";

export function toggleSectionCollapsed(sectionKey: string): void {
    toggleStringSetMember(KEY, sectionKey);
}

export function useSectionCollapsed(sectionKey: string): boolean {
    return !useStringSetMember(KEY, sectionKey);
}
