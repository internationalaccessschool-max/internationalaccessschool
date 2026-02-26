"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Info, Megaphone, X } from "lucide-react";

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

    useEffect(() => {
        setIsClient(true);
        // Only fetch active notices
        const q = query(
            collection(db, "notices"),
            where("isActive", "==", true),
            orderBy("priority", "desc") // High priority first
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

    // Determine style based on the highest priority notice type (simplified for now to just use the first one or a default)
    // Actually, for a ticker, we might want to rotate them. 
    // Let's make a ticker that scrolls all of them.

    return (
        <div className="bg-navy text-white relative z-50 overflow-hidden h-10 flex items-center">
            <div className="absolute left-0 top-0 bottom-0 bg-navy z-10 px-4 flex items-center gap-2 border-r border-white/10 shadow-lg">
                <span className="text-xs font-bold uppercase tracking-wider text-gold animate-pulse">Latest Updates</span>
            </div>

            <div className="flex-1 overflow-hidden flex items-center">
                <motion.div
                    className="flex items-center gap-12 whitespace-nowrap pl-4"
                    animate={{ x: ["100%", "-100%"] }}
                    transition={{
                        repeat: Infinity,
                        ease: "linear",
                        duration: Math.max(20, notices.length * 10) // adjust speed based on length
                    }}
                >
                    {notices.map((notice) => (
                        <div key={notice.id} className="flex items-center gap-2">
                            {notice.type === 'urgent' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                            {notice.type === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                            {notice.type === 'info' && <Info className="w-4 h-4 text-blue-400" />}
                            <span className="text-sm font-medium">{notice.content}</span>
                        </div>
                    ))}
                </motion.div>
            </div>

            <button
                onClick={() => setIsVisible(false)}
                className="absolute right-0 top-0 bottom-0 bg-navy z-10 px-3 flex items-center justify-center hover:bg-navy-light text-white/70 hover:text-white transition-colors border-l border-white/10"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
