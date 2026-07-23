import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const PREVIEW_REFRESH_KEY = "guttahutte:preview-sw-cleared:v1";

function isLovablePreview(): boolean {
  const host = window.location.hostname;
  return host.endsWith(".lovable.app") && host.includes("preview--");
}

async function clearPreviewServiceWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !isLovablePreview()) return false;

  const wasControlled = Boolean(navigator.serviceWorker.controller);
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => /(?:workbox|guttahutte|trip-|vite-pwa|precache)/i.test(name))
        .map((name) => caches.delete(name)),
    );
  }

  // A worker that controlled this navigation remains active until the next
  // navigation. Reload once, with a session guard to prevent a loop.
  if (wasControlled && sessionStorage.getItem(PREVIEW_REFRESH_KEY) !== "1") {
    sessionStorage.setItem(PREVIEW_REFRESH_KEY, "1");
    window.location.reload();
    return true;
  }

  sessionStorage.removeItem(PREVIEW_REFRESH_KEY);
  return false;
}

async function registerProductionServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD || isLovablePreview() || !("serviceWorker" in navigator)) return;
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({ immediate: true });
}

// Restore theme preference
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") {
  document.documentElement.classList.add("dark");
} else if (savedTheme === "light") {
  document.documentElement.classList.remove("dark");
}

async function start(): Promise<void> {
  try {
    if (await clearPreviewServiceWorker()) return;
  } catch (error) {
    console.warn("[PWA] Could not clear preview worker", error);
  }

  createRoot(document.getElementById("root")!).render(<App />);
  void registerProductionServiceWorker();
}

void start();
