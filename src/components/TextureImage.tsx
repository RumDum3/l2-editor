import { useTexture } from "../lib/useTexture";

type Props = {
    file: string;
    className?: string;
    size?: number;
};

export function TextureImage({ file, className, size = 32 }: Props) {
    const entry = useTexture(file);
    const tail = file.split(".").pop() ?? "";

    if (entry.status === "loaded" && entry.url) {
        return (
            <img
                src={entry.url}
                alt={file}
                draggable={false}
                className={className}
                style={{ width: size, height: size, objectFit: "contain" }}
            />
        );
    }

    return (
        <div
            className={`flex items-center justify-center rounded border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface-2)] to-black/40 ${className ?? ""}`}
            style={{ width: size, height: size }}
            title={file}
        >
            <span className="mono truncate px-1 text-[8px] text-[var(--color-text-faint)]">{tail || "—"}</span>
        </div>
    );
}
