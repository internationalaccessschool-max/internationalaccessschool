"use client";

import {
    Users, BookOpen, CalendarCheck, TrendingUp,
    Clock, FileText, CheckCircle2, PenLine,
    GraduationCap, ClipboardList, ArrowRight
} from "lucide-react";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit, getCountFromServer } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getTimeAgo } from "@/lib/utils/date";

const quickActions = [
    { label: "Mark Attendance", icon: CheckCircle2, href: "/teacher/attendance" },
    { label: "Enter Marks", icon: GraduationCap, href: "/teacher/marks" },
    { label: "Post Homework", icon: PenLine, href: "/teacher/homework" },
    { label: "My Classes", icon: ClipboardList, href: "/teacher/classes" },
];

export default function TeacherDashboard() {
    const [userData, setUserData] = useState<any>(null);
    const router = useRouter();
    const [totalStudents, setTotalStudents] = useState(0);
    const [totalHomework, setTotalHomework] = useState(0);
    const [totalClasses, setTotalClasses] = useState(0);
    const [assignedClassNames, setAssignedClassNames] = useState("");
    const [recentHomework, setRecentHomework] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

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

    useEffect(() => {
        const fetchStats = async () => {
            if (!userData) return;
            try {
                // Number of classes assigned to this teacher (from assignment.classSections)
                const classSections: Record<string, string[]> = userData.assignment?.classSections || {};
                const classNames = Object.keys(classSections);
                setTotalClasses(classNames.length);
                if (classNames.length > 0) {
                    // Build label like "Class 7 (A,B,C), Class 8 (A)"
                    const label = classNames.map(cls => {
                        const secs = classSections[cls];
                        return secs && secs.length > 0 ? `${cls} (${secs.join(",")})` : cls;
                    }).join(", ");
                    setAssignedClassNames(label);
                } else {
                    setAssignedClassNames("No classes assigned");
                }

                // Total Homework assignments created by this teacher
                const hwSnap = await getCountFromServer(query(collection(db, "homework"), where("teacherId", "==", userData.uid)));
                setTotalHomework(hwSnap.data().count);

                // Recent homework (for activity feed)
                try {
                    const recentHw = await getDocs(
                        query(collection(db, "homework"), where("teacherId", "==", userData.uid), orderBy("createdAt", "desc"), limit(5))
                    );
                    setRecentHomework(recentHw.docs.map(d => ({ id: d.id, ...d.data() })));
                } catch (e) {
                    // Fallback without sort if index missing
                    const recentHw = await getDocs(
                        query(collection(db, "homework"), where("teacherId", "==", userData.uid), limit(5))
                    );
                    setRecentHomework(recentHw.docs.map(d => ({ id: d.id, ...d.data() })));
                }
            } catch (err) {
                console.error("Teacher dashboard error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [userData]);

    const greeting = (() => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    })();

    const stats = [
        {
            title: "Assigned Classes",
            value: loading ? "..." : totalClasses.toString(),
            change: loading ? "Loading..." : assignedClassNames,
            icon: Users,
            iconBg: "bg-blue-100",
            iconColor: "text-blue-600",
        },
        {
            title: "Homework Posted",
            value: loading ? "..." : totalHomework.toString(),
            change: "Your total assignments",
            icon: FileText,
            iconBg: "bg-amber-100",
            iconColor: "text-amber-600",
        },
        {
            title: "Today",
            value: new Date().toLocaleDateString("en-IN", { weekday: "short" }),
            change: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
            icon: CalendarCheck,
            iconBg: "bg-emerald-100",
            iconColor: "text-emerald-600",
        },
    ];

    return (
        <div className="space-y-6">
            {/* Welcome Banner */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div
                    className="absolute inset-0 opacity-10"
                    style={{
                        backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.3) 0%, transparent 55%)`
                    }}
                />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <p className="text-white/50 text-sm font-medium">Teacher Portal</p>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">
                            {greeting}, {userData?.name || "Teacher"}!
                        </h1>
                        <p className="text-white/40 text-sm mt-2">
                            Manage your classes, assignments, and student progress.
                        </p>
                    </div>
                    <Link
                        href="/teacher/classes"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all backdrop-blur-sm border border-white/10 shrink-0"
                    >
                        View My Classes
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <div key={stat.title} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 card-hover">
                        <div className="flex items-start justify-between mb-4">
                            <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center`}>
                                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-navy">{stat.value}</div>
                        <div className="text-xs text-gray-400 mt-0.5 font-medium">{stat.title}</div>
                        <div className="text-xs text-gray-300 mt-0.5">{stat.change}</div>
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-5 gap-6">
                {/* Recent Homework */}
                <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="font-bold text-navy text-lg">Recent Homework</h2>
                        <Link href="/teacher/homework" className="text-xs font-medium text-gold hover:text-gold-light transition-colors">
                            View All
                        </Link>
                    </div>
                    <div className="space-y-3">
                        {loading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-8 h-8 border-4 border-navy/20 border-t-navy rounded-full animate-spin" />
                            </div>
                        ) : recentHomework.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-10">No homework posted yet.</p>
                        ) : (
                            recentHomework.map((hw: any, i: number) => (
                                <div key={hw.id || i} className="flex items-center gap-4 p-3 rounded-xl hover:bg-off-white transition-colors group">
                                    <div className="w-14 h-14 rounded-xl bg-navy/5 group-hover:bg-navy/10 flex flex-col items-center justify-center shrink-0 transition-colors">
                                        <PenLine className="w-5 h-5 text-navy/50" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-navy truncate">{hw.title || "Assignment"}</div>
                                        <div className="text-xs text-gray-400 mt-0.5">
                                            {hw.className || "?"}-{hw.section || "?"} • {hw.subject || ""} • Due: {hw.dueDate || "—"}
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-300">
                                        {hw.createdAt?.toDate ? getTimeAgo(hw.createdAt.toDate()) : ""}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h2 className="font-bold text-navy text-lg mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-2 gap-3">
                        {quickActions.map((action) => (
                            <Link
                                key={action.label}
                                href={action.href}
                                className="flex flex-col items-center gap-3 p-5 rounded-xl bg-off-white border border-gray-100 hover:bg-navy hover:text-white group transition-all duration-200 card-hover"
                            >
                                <div className="w-10 h-10 rounded-xl bg-navy/5 group-hover:bg-white/10 flex items-center justify-center transition-colors">
                                    <action.icon className="w-5 h-5 text-navy group-hover:text-gold transition-colors" />
                                </div>
                                <span className="text-xs font-semibold text-navy group-hover:text-white transition-colors text-center leading-tight">
                                    {action.label}
                                </span>
                            </Link>
                        ))}
                    </div>

                    {/* Homework Summary Banner */}
                    <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                <BookOpen className="w-4 h-4 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-amber-800">{loading ? "..." : totalHomework} Assignments Posted</p>
                                <p className="text-xs text-amber-600 mt-0.5">Post more homework from the Homework page</p>
                            </div>
                        </div>
                        <Link
                            href="/teacher/homework"
                            className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors"
                        >
                            Post Homework <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
