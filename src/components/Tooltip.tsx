import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
    children: React.ReactNode;
    content: React.ReactNode;
    width?: number;
};

const MARGIN = 8;

export function Tooltip({ children, content, width = 320 }: Props) {
    const [show, setShow] = useState(false);
    const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
    const triggerRef = useRef<HTMLSpanElement>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!show || !triggerRef.current) return;
        const t = triggerRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const bubbleH = bubbleRef.current?.getBoundingClientRect().height ?? 80;
        const placeAbove = t.top > bubbleH + MARGIN + 8;
        const top = placeAbove ? t.top - bubbleH - MARGIN : t.bottom + MARGIN;
        const desiredLeft = t.left + t.width / 2 - width / 2;
        const left = Math.max(MARGIN, Math.min(vw - width - MARGIN, desiredLeft));
        const clampedTop = Math.max(MARGIN, Math.min(vh - bubbleH - MARGIN, top));
        setCoords({ left, top: clampedTop });
    }, [show, content, width]);

    useEffect(() => {
        if (!show) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setShow(false);
        };
        const onScrollOrResize = () => setShow(false);
        window.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onScrollOrResize, true);
        window.addEventListener("resize", onScrollOrResize);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onScrollOrResize, true);
            window.removeEventListener("resize", onScrollOrResize);
        };
    }, [show]);

    return (
        <>
            <span
                ref={triggerRef}
                className="inline-flex items-center"
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
                onFocus={() => setShow(true)}
                onBlur={() => setShow(false)}
            >
                {children}
            </span>
            {show &&
                createPortal(
                    <div
                        ref={bubbleRef}
                        role="tooltip"
                        className="pointer-events-none fixed z-[1000] rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-text)] shadow-xl"
                        style={{
                            left: coords?.left ?? -9999,
                            top: coords?.top ?? -9999,
                            width,
                            visibility: coords ? "visible" : "hidden"
                        }}
                    >
                        {content}
                    </div>,
                    document.body
                )}
        </>
    );
}

export function HelpIcon() {
    return (
        <span
            tabIndex={0}
            aria-label="Help"
            className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-faint)] transition hover:border-[var(--color-accent-2)] hover:text-[var(--color-accent-2)] focus:border-[var(--color-accent-2)] focus:text-[var(--color-accent-2)] focus:outline-none"
        >
            <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true" focusable="false">
                <path d="M8 3.2c-1.7 0-3 1.1-3.2 2.7a.8.8 0 0 0 1.6.2c.1-.7.7-1.3 1.6-1.3.9 0 1.6.6 1.6 1.4 0 .6-.4 1-1.2 1.5-.7.5-1.2 1-1.2 2v.6a.8.8 0 0 0 1.6 0v-.5c0-.4.2-.6.7-.9 1-.6 1.7-1.4 1.7-2.6 0-1.7-1.4-3-3.2-3.1Z" />
                <circle cx="8" cy="12.5" r="1" />
            </svg>
        </span>
    );
}
