"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AlertTriangle, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface Timestamp {
    toMillis?: () => number;
}

interface Notice {
    id: string;
    content: string;
    isActive: boolean;
    type: "info" | "warning" | "urgent";
    priority: number;
    createdAt?: Timestamp | null;
    updatedAt?: Timestamp | null;
}

const SEEN_KEY = "ias_seen_notices";

function loadSeen(): Record<string, number> {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(SEEN_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveSeen(seen: Record<string, number>) {
    try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    } catch {
        // Ignore storage failures (private mode / quota) — worst case the popup re-shows.
    }
}

// A notice is "new" if its content has never been seen, or was updated
// (edited by admin) since it was last dismissed.
function versionOf(notice: Notice): number {
    return notice.updatedAt?.toMillis?.() ?? notice.createdAt?.toMillis?.() ?? 0;
}

const STYLES = {
    urgent: { icon: AlertTriangle, badge: "bg-red-50 text-red-600 border-red-100", bar: "bg-red-500", label: "Urgent" },
    warning: { icon: AlertTriangle, badge: "bg-amber-50 text-amber-600 border-amber-100", bar: "bg-amber-500", label: "Important" },
    info: { icon: Info, badge: "bg-blue-50 text-blue-600 border-blue-100", bar: "bg-blue-500", label: "Notice" },
} as const;

/**
 * Shows a one-time popup for every active school notice the student/parent
 * hasn't dismissed yet. Reads the same `notices` collection as the public
 * NewsTicker, so nothing here needs its own Firestore index.
 */
export function NoticePopup() {
    const [queue, setQueue] = useState<Notice[]>([]);

    useEffect(() => {
        const q = query(
            collection(db, "notices"),
            where("isActive", "==", true),
            orderBy("priority", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Notice));
            const seen = loadSeen();

            const unseen = fetched.filter((n) => {
                const seenAt = seen[n.id];
                return seenAt === undefined || seenAt < versionOf(n);
            });

            setQueue(unseen);
        });

        return () => unsubscribe();
    }, []);

    const current = queue[0];

    const dismiss = (notice: Notice) => {
        const seen = loadSeen();
        seen[notice.id] = versionOf(notice) || Date.now();
        saveSeen(seen);
        setQueue((prev) => prev.filter((n) => n.id !== notice.id));
    };

    const dismissAll = () => {
        const seen = loadSeen();
        queue.forEach((n) => {
            seen[n.id] = versionOf(n) || Date.now();
        });
        saveSeen(seen);
        setQueue([]);
    };

    if (!current) return null;

    const s = STYLES[current.type] || STYLES.info;
    const Icon = s.icon;
    const remaining = queue.length - 1;

    return (
        <AnimatePresence>
            <motion.div
                key="notice-popup-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            >
                <motion.div
                    key={current.id}
                    initial={{ opacity: 0, scale: 0.92, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -8 }}
                    transition={{ type: "spring", damping: 22, stiffness: 300 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
                    role="alertdialog"
                    aria-live="assertive"
                >
                    <div className={`h-1.5 ${s.bar}`} />
                    <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div className={`w-10 h-10 rounded-xl border ${s.badge} flex items-center justify-center shrink-0`}>
                                <Icon className="w-5 h-5" />
                            </div>
                            <button
                                onClick={() => dismiss(current)}
                                className="p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
                                aria-label="Dismiss notice"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="mt-3">
                            <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${s.badge}`}>
                                {s.label}
                            </span>
                            <p className="mt-2 text-sm text-navy font-medium leading-relaxed whitespace-pre-wrap">
                                {current.content}
                            </p>
                        </div>

                        <div className="mt-5 flex items-center justify-end gap-2">
                            {remaining > 0 && (
                                <button
                                    onClick={dismissAll}
                                    className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                                >
                                    Dismiss all ({remaining} more)
                                </button>
                            )}
                            <button
                                onClick={() => dismiss(current)}
                                className="px-4 py-2 bg-navy text-white text-xs font-bold rounded-lg hover:bg-navy-light transition-colors"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
