"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PWAInstallTriggerProps {
    appName: string;      // e.g. "IAS Student Portal"
    themeColor?: string;  // e.g. "#3b82f6"
    icon?: string;        // emoji or text
}

function PWAInstallInner({ appName, themeColor = "#1e3a5f", icon = "📲" }: PWAInstallTriggerProps) {
    const searchParams = useSearchParams();
    const autoInstall = searchParams.get("install") === "true";

    const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showBanner, setShowBanner] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        // Already installed as standalone → hide banner
        if (window.matchMedia("(display-mode: standalone)").matches) {
            setDone(true);
            return;
        }

        // iOS check — no beforeinstallprompt on iOS
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        if (isIOS && autoInstall) {
            toast.success(
                `To install ${appName}: tap the Share icon (□↑) in Safari, then tap "Add to Home Screen"`,
                { duration: 8000, icon: "📲" }
            );
            return;
        }

        const handler = (e: Event) => {
            e.preventDefault();
            const ev = e as BeforeInstallPromptEvent;
            setPrompt(ev);

            if (autoInstall) {
                // Auto-trigger after a small delay so the page fully renders
                setTimeout(async () => {
                    await ev.prompt();
                    const choice = await ev.userChoice;
                    if (choice.outcome === "accepted") setDone(true);
                    setPrompt(null);
                }, 600);
            } else {
                setShowBanner(true);
            }
        };

        window.addEventListener("beforeinstallprompt", handler);
        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, [autoInstall, appName]);

    const handleInstallClick = async () => {
        if (!prompt) {
            toast.success(`Tap the Share button in Safari → "Add to Home Screen"`, { duration: 6000 });
            return;
        }
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === "accepted") {
            setDone(true);
            setShowBanner(false);
        }
        setPrompt(null);
    };

    if (done || !showBanner) return null;

    return (
        <div className="fixed bottom-6 left-4 right-4 z-[9999] flex justify-center pointer-events-none">
            <div
                className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 flex items-center gap-3 max-w-sm w-full pointer-events-auto animate-fade-in"
                style={{ boxShadow: `0 8px 32px ${themeColor}22` }}
            >
                <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                    style={{ background: `${themeColor}15` }}
                >
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">Install {appName}</p>
                    <p className="text-xs text-gray-500">Add to home screen — works offline</p>
                </div>
                <button
                    onClick={handleInstallClick}
                    className="px-4 py-2 rounded-xl text-white text-xs font-bold flex-shrink-0 hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: themeColor }}
                >
                    Install
                </button>
                <button
                    onClick={() => setShowBanner(false)}
                    className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0 text-lg leading-none"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

// Wrap in Suspense because useSearchParams needs it
export function PWAInstallTrigger(props: PWAInstallTriggerProps) {
    return (
        <Suspense fallback={null}>
            <PWAInstallInner {...props} />
        </Suspense>
    );
}
