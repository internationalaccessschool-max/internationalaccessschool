"use client";

import { useEffect, useRef, useState } from "react";
import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export type SenderRole = "parent" | "teacher" | "admin" | "supervisor";

export interface ConversationMeta {
    studentUid: string;
    admissionNumber?: string;
    studentName?: string;
    className?: string;
    section?: string;
}

interface Message {
    id: string;
    text: string;
    senderRole: SenderRole;
    senderName: string;
    senderUid: string;
    createdAt?: { toMillis?: () => number } | null;
}

const ROLE_LABEL: Record<SenderRole, string> = {
    parent: "Parent",
    teacher: "Class Teacher",
    admin: "Admin",
    supervisor: "Supervisor",
};

interface MessageThreadProps {
    conversation: ConversationMeta;
    currentRole: SenderRole;
    currentUid: string;
    currentName: string;
    /** Called after the thread mounts / a message is read, to clear unread badges. */
    onOpened?: () => void;
}

export function MessageThread({ conversation, currentRole, currentUid, currentName, onOpened }: MessageThreadProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const openedRef = useRef(false);

    useEffect(() => {
        if (!conversation.studentUid) return;

        const q = query(
            collection(db, "conversations", conversation.studentUid, "messages"),
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
            setLoading(false);
        });

        return () => unsubscribe();
    }, [conversation.studentUid]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    // Mark this thread read for the current side exactly once per mount.
    useEffect(() => {
        if (!conversation.studentUid || openedRef.current) return;
        openedRef.current = true;

        const field = currentRole === "parent" ? "unreadForParent" : "unreadForStaff";
        setDoc(doc(db, "conversations", conversation.studentUid), { [field]: false }, { merge: true }).catch(() => {});
        onOpened?.();
    }, [conversation.studentUid, currentRole, onOpened]);

    const handleSend = async () => {
        const trimmed = text.trim();
        if (!trimmed || sending || !conversation.studentUid) return;

        setSending(true);
        setText("");

        try {
            await addDoc(collection(db, "conversations", conversation.studentUid, "messages"), {
                text: trimmed,
                senderRole: currentRole,
                senderName: currentName,
                senderUid: currentUid,
                createdAt: serverTimestamp(),
            });

            await setDoc(
                doc(db, "conversations", conversation.studentUid),
                {
                    studentUid: conversation.studentUid,
                    admissionNumber: conversation.admissionNumber || "",
                    studentName: conversation.studentName || "",
                    className: conversation.className || "",
                    section: conversation.section || "",
                    lastMessageText: trimmed,
                    lastMessageAt: serverTimestamp(),
                    lastSenderRole: currentRole,
                    lastSenderName: currentName,
                    unreadForParent: currentRole !== "parent",
                    unreadForStaff: currentRole === "parent",
                    createdAt: serverTimestamp(),
                },
                { merge: true }
            );

            // Best-effort push notification — never blocks sending the message.
            authFetch("/api/notifications/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    studentUid: conversation.studentUid,
                    admissionNumber: conversation.admissionNumber,
                    studentName: conversation.studentName,
                    className: conversation.className,
                    section: conversation.section,
                    senderRole: currentRole,
                    senderName: currentName,
                    text: trimmed,
                }),
            }).catch(() => {});
        } catch (error) {
            console.error("Error sending message:", error);
            setText(trimmed);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[55vh]">
                {loading ? (
                    <div className="h-full flex items-center justify-center text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-gray-400 text-center px-6">
                        No messages yet. Say hello — this conversation is shared with the class teacher and school office.
                    </div>
                ) : (
                    messages.map((m) => {
                        const mine = m.senderUid === currentUid;
                        return (
                            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                                <div
                                    className={cn(
                                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                                        mine ? "bg-navy text-white rounded-br-sm" : "bg-gray-100 text-navy rounded-bl-sm"
                                    )}
                                >
                                    {!mine && (
                                        <div className="text-[11px] font-bold text-gold/90 mb-0.5">
                                            {m.senderName || ROLE_LABEL[m.senderRole]} · {ROLE_LABEL[m.senderRole]}
                                        </div>
                                    )}
                                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                                    <div className={cn("text-[10px] mt-1", mine ? "text-white/50" : "text-gray-400")}>
                                        {m.createdAt?.toMillis
                                            ? new Date(m.createdAt.toMillis()).toLocaleString(undefined, {
                                                  month: "short",
                                                  day: "numeric",
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                              })
                                            : "Sending…"}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            <div className="border-t border-gray-100 p-3 flex items-end gap-2 shrink-0">
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    rows={1}
                    placeholder="Type a message…"
                    className="flex-1 resize-none px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy max-h-32"
                />
                <button
                    onClick={handleSend}
                    disabled={sending || !text.trim()}
                    className="shrink-0 p-2.5 bg-navy text-white rounded-xl hover:bg-navy-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Send message"
                >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}
