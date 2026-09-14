"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { resolveClassTeacherSection } from "@/lib/utils/classTeacher";
import { MessageThread } from "@/components/messages/message-thread";
import { Loader2, MessageCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationRow {
    id: string;
    studentUid: string;
    studentName: string;
    admissionNumber: string;
    className: string;
    section: string;
    lastMessageText?: string;
    lastSenderRole?: string;
    unreadForStaff?: boolean;
    lastMessageAt?: { toMillis?: () => number } | null;
}

export default function TeacherMessagesPage() {
    const { user } = useAuth();
    const [section, setSection] = useState<{ cls: string; section: string } | null | undefined>(undefined);
    const [conversations, setConversations] = useState<ConversationRow[]>([]);
    const [selectedUid, setSelectedUid] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        resolveClassTeacherSection(user.uid, user.email).then(setSection);
    }, [user]);

    useEffect(() => {
        if (!section) return;

        const q = query(
            collection(db, "conversations"),
            where("className", "==", section.cls),
            where("section", "==", section.section),
            orderBy("lastMessageAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationRow));
            setConversations(rows);
            setSelectedUid((prev) => prev ?? rows[0]?.studentUid ?? null);
        });

        return () => unsubscribe();
    }, [section]);

    if (section === undefined || !user) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-navy" />
            </div>
        );
    }

    if (section === null) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h2 className="text-lg font-bold text-navy">Not a Class Teacher</h2>
                <p className="text-gray-500 text-sm mt-1">
                    You are not currently assigned as a Class Teacher for any section, so there are no
                    parent conversations to manage here.
                </p>
            </div>
        );
    }

    const selected = conversations.find((c) => c.studentUid === selectedUid) || null;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
                    <MessageCircle className="w-6 h-6" />
                    Messages
                </h1>
                <p className="text-gray-500">
                    Parent conversations for Class {section.cls} – {section.section}
                </p>
            </div>

            <div className="grid md:grid-cols-[280px_1fr] gap-4 h-[65vh]">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-y-auto">
                    {conversations.length === 0 ? (
                        <p className="p-4 text-sm text-gray-400 text-center">No conversations yet.</p>
                    ) : (
                        conversations.map((c) => (
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
                            currentRole="teacher"
                            currentUid={user.uid}
                            currentName={user.displayName || "Class Teacher"}
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
