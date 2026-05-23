import type { FC } from "react";

export type EntitySummary = {
    id: string | number;
    label: string;
};

export interface EditorPlugin<TEntity = unknown> {
    id: string;
    label: string;
    dataPath?: string;
    recursive?: boolean;
    icon?: string;
    matches: (doc: XMLDocument) => boolean;
    parse: (doc: XMLDocument) => TEntity[];
    parseEntity: (el: Element) => TEntity;
    afterEntityRestored?: (entity: TEntity) => void | Promise<void>;
    elementOf: (entity: TEntity) => Element;
    summarize: (entity: TEntity) => EntitySummary;
    idAttr?: string;
    newEntity?: (doc: XMLDocument, id: string | number) => Element;
    Editor: FC<{
        entity: TEntity;
        mutate: (fn: () => void) => void;
        revision: number;
    }>;
    Card?: FC<{
        entity: TEntity;
        onSelect: () => void;
    }>;
}
