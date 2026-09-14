"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { MessageThread } from "@/components/messages/message-thread";
import { Loader2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationRow {
    id: string;
    studentUid: string;
    studentName: string;
    admissionNumber: string;
    className: string;
    section: string;
    lastMessageText?: string;
    unreadForStaff?: boolean;
    lastMessageAt?: { toMillis?: () => number } | null;
}

export default function AdminMessagesPage() {
    const { user, role } = useAuth();
    const [conversations, setConversations] = useState<ConversationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [classFilter, setClassFilter] = useState("all");
    const [selectedUid, setSelectedUid] = useState<string | null>(null);

    useEffect(() => {
        const q = query(collection(db, "conversations"), orderBy("lastMessageAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationRow));
            setConversations(rows);
            setSelectedUid((prev) => prev ?? rows[0]?.studentUid ?? null);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const classOptions = useMemo(() => {
        const set = new Set(conversations.map((c) => `${c.className} – ${c.section}`).filter(Boolean));
        return Array.from(set).sort();
    }, [conversations]);

    const filtered = useMemo(() => {
        if (classFilter === "all") return conversations;
        return conversations.filter((c) => `${c.className} – ${c.section}` === classFilter);
    }, [conversations, classFilter]);

    const selected = filtered.find((c) => c.studentUid === selectedUid) || null;

    if (loading || !user) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-navy" />
            </div>
        );
    }

    const currentRole = role === "supervisor" ? "supervisor" : "admin";

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
                        <MessageCircle className="w-6 h-6" />
                        Messages
                    </h1>
                    <p className="text-gray-500">Every parent ↔ class teacher conversation across the school.</p>
                </div>
                <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
                >
                    <option value="all">All Classes</option>
                    {classOptions.map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            </div>

            <div className="grid md:grid-cols-[300px_1fr] gap-4 h-[65vh]">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-y-auto">
                    {filtered.length === 0 ? (
                        <p className="p-4 text-sm text-gray-400 text-center">No conversations yet.</p>
                    ) : (
                        filtered.map((c) => (
                            <button
                                key={c.studentUid}
                                onClick={() => setSelectedUid(c.studentUid)}
                                className={cn(
                                    "w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors",
                                    selectedUid === c.studentUid && "bg-navy/5"
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-navy text-sm truncate">
                                        {c.studentName || "Student"}
                                    </span>
                                    {c.unreadForStaff && (
                                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                    )}
                                </div>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                    Class {c.className} – {c.section}
                                </p>
                                <p className="text-xs text-gray-400 truncate mt-0.5">
                                    {c.lastMessageText || "No messages yet"}
                                </p>
                            </button>
                        ))
                    )}
                </div>

                <div className="min-h-0">
                    {selected ? (
                        <MessageThread
                            conversation={{
                                studentUid: selected.studentUid,
                                admissionNumber: selected.admissionNumber,
                                studentName: selected.studentName,
                                className: selected.className,
                                section: selected.section,
                            }}
                            currentRole={currentRole}
                            currentUid={user.uid}
                            currentName={user.displayName || (currentRole === "supervisor" ? "Supervisor" : "Admin Office")}
                        />
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
                            Select a conversation to view messages
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
