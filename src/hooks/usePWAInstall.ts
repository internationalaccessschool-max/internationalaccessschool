"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";

// Define the BeforeInstallPromptEvent interface
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed',
    platform: string
  }>;
  prompt(): Promise<void>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if the device is iOS
    const checkIsIOS = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent);
    };

    // Check if the app is already installed (standalone mode for iOS)
    const checkIsStandalone = () => {
      return ('standalone' in window.navigator) && (window.navigator as any).standalone === true;
    };

    const isDeviceIOS = checkIsIOS();
    const isAlreadyInstalled = checkIsStandalone();

    setIsIOS(isDeviceIOS);

    // If it's iOS and not installed, we can show the install button
    // which will guide the user to add it manually via the Share menu
    if (isDeviceIOS && !isAlreadyInstalled) {
      setIsInstallable(true);
    }

    const handler = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const install = async () => {
    if (isIOS) {
      // Show instructions for iOS users
      toast.success(
        "To install, tap the Share icon at the bottom of Safari and select 'Add to Home Screen'.",
        { duration: 6000 }
      );
      // Optional: Give UI feedback or hide button
      // setIsInstallable(false); // Maybe don't hide it until they actually install and we load in standalone mode
      return;
    }

    if (!deferredPrompt) return;
    
    // Show the install prompt for Android/Desktop
    await deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  return { isInstallable, install };
}
