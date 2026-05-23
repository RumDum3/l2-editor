import { useEffect, useState } from "react";
import { useSettings } from "../state/SettingsContext";
import { getTextureFromCache, loadTexture, subscribeTexture, type TextureEntry } from "./textureCache";

const empty: TextureEntry = { status: "missing", url: null };

export function useTexture(file: string | null | undefined): TextureEntry {
    const { config } = useSettings();
    const root = config?.clientRoot ?? "";
    const [entry, setEntry] = useState<TextureEntry>(() => (file ? (getTextureFromCache(file) ?? empty) : empty));

    useEffect(() => {
        if (!file) {
            setEntry(empty);
            return;
        }
        const cached = getTextureFromCache(file);
        if (cached) setEntry(cached);

        const unsub = subscribeTexture(file, setEntry);
        loadTexture(file, root).catch(() => {});
        return unsub;
    }, [file, root]);

    return entry;
}
