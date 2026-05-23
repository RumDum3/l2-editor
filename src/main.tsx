import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

const MIN_SPLASH_MS = 600;
const bootStart = (window as unknown as { __bootStart?: number }).__bootStart ?? performance.now();

const tearDownSplash = () => {
    const splash = document.getElementById("boot-splash");
    if (!splash) return;
    splash.style.transition = "opacity 250ms ease-out";
    splash.style.opacity = "0";
    setTimeout(() => splash.remove(), 270);
};

requestAnimationFrame(() => {
    const elapsed = performance.now() - bootStart;
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
    setTimeout(tearDownSplash, remaining);
});
