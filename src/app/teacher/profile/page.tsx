"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { User, Mail, Phone, BookOpen, GraduationCap, Calendar } from "lucide-react";

export default function TeacherProfilePage() {
    const [userData, setUserData] = useState<any>(null);
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists() && userDoc.data().role === "teacher") {
                    setUserData(userDoc.data());
                } else {
                    router.push("/login");
                }
            } else {
                router.push("/login");
            }
        });
        return () => unsubscribe();
    }, [router]);

    const infoItems = [
        { icon: Mail, label: "Email", value: userData?.email || "—" },
        { icon: Phone, label: "Phone", value: userData?.phone || "—" },
        { icon: BookOpen, label: "Subject", value: userData?.subject || "Mathematics" },
        { icon: GraduationCap, label: "Qualification", value: userData?.qualification || "B.Ed, M.Sc" },
        { icon: Calendar, label: "Joined", value: userData?.joinedDate || "Jan 2023" },
    ];

    return (
        <div className="space-y-6">
            {/* Header Banner */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }}
                />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Teacher Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">My Profile</h1>
                    <p className="text-white/40 text-sm mt-2">Your personal and professional information.</p>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Avatar Card */}
                <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-2xl bg-navy/10 flex items-center justify-center mb-4">
                        <span className="text-3xl font-bold text-navy/40">
                            {(userData?.firstName || "T").charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <h2 className="font-bold text-navy text-lg">
                        {userData ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim() : "Teacher"}
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">{userData?.subject || "Subject Teacher"}</p>
                    <span className="mt-3 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold">
                        Active
                    </span>
                    <button className="mt-4 w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-navy hover:bg-gray-50 transition-colors">
                        Edit Profile
                    </button>
                </div>

                {/* Info Card */}
                <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h2 className="font-bold text-navy text-lg mb-5">Personal Information</h2>
                    <div className="space-y-4">
                        {infoItems.map((item) => (
                            <div key={item.label} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50">
                                <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center border border-gray-100 shrink-0">
                                    <item.icon className="w-4 h-4 text-navy/50" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400">{item.label}</p>
                                    <p className="text-sm font-semibold text-navy">{item.value}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
