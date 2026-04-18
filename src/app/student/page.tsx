"use client";

import {
    GraduationCap, Clock,
    FileText, AlertCircle, ArrowRight
} from "lucide-react";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchStudentProfile } from "@/lib/utils/studentProfile";
import { StaggerContainer, StaggerItem } from "@/components/ui/fade-in";

export default function StudentDashboard() {
    const { user, role, loading: authLoading } = useAuth();
    const [userData, setUserData] = useState<any>(null);
    const [studentData, setStudentData] = useState<any>(null);
    const router = useRouter();
    const [pendingHomework, setPendingHomework] = useState(0);
    const [overdueHomework, setOverdueHomework] = useState(0);
    const [totalHomework, setTotalHomework] = useState(0);
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;
        if (!user || (role !== "student" && role !== "parent")) {
            router.push("/student/login");
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            try {
                // Use shared utility — smart path: studentLookup → direct path → fallback
                const { profile, className, section } = await fetchStudentProfile(user.uid);

                if (profile) {
                    setUserData({ ...profile, role: "student", uid: user.uid, className, section });
                    setStudentData({ ...profile, className, section });

                    // Fetch homework for this student's class and section
                    try {
                        const hwSnap = await getDocs(
                            query(
                                collection(db, "homework"),
                                where("className", "==", className),
                                where("section", "==", section)
                            )
                        );

                        const homeworks = hwSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                        setTotalHomework(homeworks.length);

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        let pendingCount = 0;
                        let overdueCount = 0;
                        const actList: any[] = [];

                        homeworks.forEach((hw: any) => {
                            if (hw.dueDate) {
                                const due = new Date(hw.dueDate + "T00:00:00");
                                if (due >= today) {
                                    pendingCount++;
                                } else {
                                    overdueCount++;
                                }
                            } else {
                                pendingCount++;
                            }

                            const dueDateStr = hw.dueDate
                                ? new Date(hw.dueDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                                : "No deadline";
                            const isOverdue = hw.dueDate && new Date(hw.dueDate + "T00:00:00") < today;
                            actList.push({
                                icon: isOverdue ? AlertCircle : FileText,
                                title: `${hw.title || "Assignment"} — ${hw.subject || ""}`,
                                time: isOverdue ? `Overdue (Due: ${dueDateStr})` : `Due: ${dueDateStr}`,
                                color: isOverdue ? "text-red-500" : "text-amber-500",
                            });
                        });

                        setPendingHomework(pendingCount);
                        setOverdueHomework(overdueCount);
                        setRecentActivity(actList.slice(0, 5));
                    } catch (e) {
                        console.error("Error fetching student homework:", e);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch student profile:", err);
            }

            setLoading(false);
        };

        fetchData();
    }, [user, role, authLoading, router]);

    const stats = [
        {
            title: "Class",
            value: loading ? "..." : studentData ? `${(studentData.className || "?").replace("Class ", "")}-${studentData.section || "?"}` : "—",
            desc: "Your class & section",
            icon: GraduationCap,
            iconBg: "bg-blue-100",
            iconColor: "text-blue-600",
        },
        {
            title: "Pending Homework",
            value: loading ? "..." : pendingHomework.toString(),
            desc: "Due soon",
            icon: Clock,
            iconBg: "bg-amber-100",
            iconColor: "text-amber-600",
        },
        {
            title: "Overdue",
            value: loading ? "..." : overdueHomework.toString(),
            desc: "Past due date",
            icon: AlertCircle,
            iconBg: overdueHomework > 0 ? "bg-red-100" : "bg-emerald-100",
            iconColor: overdueHomework > 0 ? "text-red-600" : "text-emerald-600",
        },
    ];

    return (
        <div className="space-y-6">
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{
                        backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)`
                    }}
                />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Student Portal</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">
                            Welcome back, {userData?.name || "Student"}!
                        </h1>
                        <p className="text-white/40 text-sm mt-2">
                            Track your progress and stay updated with your classes.
                        </p>
                    </div>
                    <div>
                        <Link
                            href="/student/profile"
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all backdrop-blur-sm border border-white/10"
                        >
                            View Full Profile
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </div>

            <StaggerContainer>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {stats.map((stat, i) => (
                        <StaggerItem key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 group hover:shadow-md transition-all">
                            <div className="flex items-center justify-between mb-4">
                                <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center`}>
                                    <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-navy">{stat.value}</div>
                            <div className="text-xs text-gray-400 mt-1">{stat.title} — {stat.desc}</div>
                        </StaggerItem>
                    ))}
                </div>
            </StaggerContainer>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-bold text-navy text-lg">My Assignments</h2>
                    <Link href="/student/homework" className="text-xs font-medium text-gold hover:text-gold-light transition-colors">View All</Link>
                </div>
                <div className="space-y-4">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <div className="w-8 h-8 border-4 border-navy/20 border-t-navy rounded-full animate-spin" />
                        </div>
                    ) : recentActivity.length === 0 ? (
                        <div className="text-center py-10">
                            <div className="text-5xl mb-4">🎉</div>
                            <p className="text-sm font-bold text-navy">No homework right now!</p>
                            <p className="text-xs text-gray-400 mt-1">You&apos;re all caught up.</p>
                        </div>
                    ) : (
                        recentActivity.map((item, i) => (
                            <div key={i} className="flex items-center gap-4 p-3 rounded-xl hover:bg-off-white transition-colors">
                                <div className={`w-10 h-10 rounded-xl bg-off-white flex items-center justify-center shrink-0`}>
                                    <item.icon className={`w-5 h-5 ${item.color}`} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-navy">{item.title}</p>
                                    <p className="text-xs text-gray-400 mt-1">{item.time}</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
