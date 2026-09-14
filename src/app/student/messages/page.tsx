"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { fetchStudentProfile } from "@/lib/utils/studentProfile";
import { MessageThread, ConversationMeta } from "@/components/messages/message-thread";
import { Loader2, MessageCircle } from "lucide-react";

export default function StudentMessagesPage() {
    const { user } = useAuth();
    const [conversation, setConversation] = useState<ConversationMeta | null>(null);
    const [teacherName, setTeacherName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const load = async () => {
            try {
                const { profile, className, section } = await fetchStudentProfile(user.uid);

                setConversation({
                    studentUid: user.uid,
                    admissionNumber: profile?.admissionNumber || "",
                    studentName: profile?.name || user.displayName || "",
                    className,
                    section,
                });

                if (className && section) {
                    const docId = `${className}-${section}`.replace(/ /g, "_");
                    const ctSnap = await getDoc(doc(db, "class_teachers", docId));
                    if (ctSnap.exists()) {
                        setTeacherName(ctSnap.data().teacherName || null);
                    }
                }
            } catch (error) {
                console.error("Error loading conversation:", error);
                setConversation({ studentUid: user.uid });
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [user]);

    if (loading || !conversation) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-navy" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
                    <MessageCircle className="w-6 h-6" />
                    Messages
                </h1>
                <p className="text-gray-500">
                    {teacherName
                        ? `Chat with your Class Teacher (${teacherName}) & School Office`
                        : "Chat with your Class Teacher & School Office"}
                </p>
            </div>

            <div className="h-[65vh]">
                <MessageThread
                    conversation={conversation}
                    currentRole="parent"
                    currentUid={user!.uid}
                    currentName={conversation.studentName ? `Parent of ${conversation.studentName}` : "Parent"}
                />
            </div>
        </div>
    );
}
