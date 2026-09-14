"use client";

import { useEffect, useRef } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { resolveClassTeacherSection } from "@/lib/utils/classTeacher";

type Scope =
    | { kind: "parent"; studentUid: string }
    | { kind: "teacher" }
    | { kind: "staff-all" };

interface ConversationData {
    studentUid: string;
    studentName?: string;
    lastMessageText?: string;
    lastSenderName?: string;
    lastSenderRole?: string;
    unreadForParent?: boolean;
    unreadForStaff?: boolean;
}

function fireToast(title: string, body: string, href: string, router: ReturnType<typeof useRouter>) {
    toast(
        (t) => (
            <button
                onClick={() => {
                    toast.dismiss(t.id);
                    router.push(href);
                }}
                className="text-left"
            >
                <div className="font-semibold text-sm text-navy">{title}</div>
                <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{body}</div>
            </button>
        ),
        { icon: "💬", duration: 6000 }
    );
}

/**
 * Live "new message" toast — mounted once per panel layout. Skips the initial
 * snapshot (existing unread state) and only toasts for messages that arrive
 * during the current session.
 */
export function MessageToastWatcher({ scope }: { scope: Scope }) {
    const router = useRouter();
    const { user } = useAuth();
    const isFirstParent = useRef(true);
    const isFirstStaff = useRef(true);

    // Parent scope: watch this student's single conversation doc directly.
    useEffect(() => {
        if (scope.kind !== "parent" || !scope.studentUid) return;

        isFirstParent.current = true;
        const unsubscribe = onSnapshot(doc(db, "conversations", scope.studentUid), (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as ConversationData;

            if (isFirstParent.current) {
                isFirstParent.current = false;
                return;
            }

            if (data.unreadForParent && data.lastSenderRole !== "parent") {
                fireToast(
                    `New message from ${data.lastSenderName || "School"}`,
                    data.lastMessageText || "",
                    "/student/messages",
                    router
                );
            }
        });

        return () => unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope.kind, (scope as { studentUid?: string }).studentUid]);

    // Teacher / staff-all scope: watch conversations where unreadForStaff just became true.
    useEffect(() => {
        if (scope.kind === "parent") return;
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;

        const start = async () => {
            let q;

            if (scope.kind === "teacher") {
                if (!user) return;
                const section = await resolveClassTeacherSection(user.uid, user.email);
                if (cancelled || !section) return;
                q = query(
                    collection(db, "conversations"),
                    where("className", "==", section.cls),
                    where("section", "==", section.section),
                    where("unreadForStaff", "==", true)
                );
            } else {
                q = query(collection(db, "conversations"), where("unreadForStaff", "==", true));
            }

            isFirstStaff.current = true;
            unsubscribe = onSnapshot(q, (snapshot) => {
                if (isFirstStaff.current) {
                    isFirstStaff.current = false;
                    return;
                }

                snapshot.docChanges().forEach((change) => {
                    if (change.type !== "added") return;
                    const data = change.doc.data() as ConversationData;
                    if (data.lastSenderRole !== "parent") return;

                    const href = scope.kind === "teacher" ? "/teacher/messages" : "/admin/messages";
                    fireToast(
                        `New message — ${data.studentName || "Parent"}`,
                        data.lastMessageText || "",
                        href,
                        router
                    );
                });
            });
        };

        start();

        return () => {
            cancelled = true;
            unsubscribe?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope.kind, user?.uid]);

    return null;
}
