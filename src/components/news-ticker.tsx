"use client";

import { useEffect, useRef, useState } from "react";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AlertTriangle, Info, X } from "lucide-react";

export interface Notice {
    id: string;
    content: string;
    isActive: boolean;
    type: 'info' | 'warning' | 'urgent';
    priority: number;
}

export function NewsTicker() {
    const [notices, setNotices] = useState<Notice[]>([]);
    const [isVisible, setIsVisible] = useState(true);
    const [isClient, setIsClient] = useState(false);
    const trackRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setIsClient(true);
        const q = query(
            collection(db, "notices"),
            where("isActive", "==", true),
            orderBy("priority", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedNotices = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Notice));
            setNotices(fetchedNotices);
        });

        return () => unsubscribe();
    }, []);

    if (!isClient || !isVisible || notices.length === 0) return null;

    // Duplicate notices for seamless loop
    const displayNotices = [...notices, ...notices];
    const speed = Math.max(25, notices.length * 12);

    return (
        <div className="bg-navy text-white relative z-50 h-9 sm:h-10 flex items-center overflow-hidden">
            {/* Label Badge */}
            <div
                className="absolute left-0 top-0 bottom-0 z-20 flex items-center px-2 sm:px-4 shrink-0 gap-1.5"
                style={{ background: "linear-gradient(to right, #0a1628 80%, transparent)" }}
            >
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-widest text-gold whitespace-nowrap animate-pulse">
                    Latest Updates
                </span>
                {/* Fade gradient so text doesn't clip under label */}
                <div className="w-6 h-full" />
            </div>

            {/* Scrolling track */}
            <div className="flex-1 overflow-hidden relative pl-[130px] sm:pl-[155px] pr-10">
                <div
                    ref={trackRef}
                    className="flex items-center gap-10 whitespace-nowrap"
                    style={{
                        animation: `ticker-scroll ${speed}s linear infinite`,
                    }}
                >
                    {displayNotices.map((notice, idx) => (
                        <div key={`${notice.id}-${idx}`} className="flex items-center gap-1.5 shrink-0">
                            {notice.type === 'urgent' && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                            {notice.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
                            {notice.type === 'info' && <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                            <span className="text-xs sm:text-sm font-medium">{notice.content}</span>
                            <span className="text-white/30 mx-2">•</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Close Button */}
            <button
                onClick={() => setIsVisible(false)}
                className="absolute right-0 top-0 bottom-0 z-20 px-2 sm:px-3 flex items-center justify-center bg-navy hover:bg-navy/80 text-white/60 hover:text-white transition-colors border-l border-white/10"
                aria-label="Close ticker"
            >
                <X className="w-3.5 h-3.5" />
            </button>

            <style jsx>{`
                @keyframes ticker-scroll {
                    0%   { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
            `}</style>
        </div>
    );
}
