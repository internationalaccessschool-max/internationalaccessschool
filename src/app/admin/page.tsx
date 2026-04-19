"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy, limit, collectionGroup, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getTimeAgo } from "@/lib/utils/date";
import Link from "next/link";
import {
    Users, GraduationCap, DollarSign, CalendarCheck,
    TrendingUp, Clock, UserPlus, FileText, CheckCircle2,
    AlertCircle, ArrowUpRight, BookOpen, PenLine
} from "lucide-react";

const quickActions = [
    { label: "Add Student", icon: UserPlus, href: "/admin/students" },
    { label: "Admissions", icon: FileText, href: "/admin/admissions" },
    { label: "View Classes", icon: GraduationCap, href: "/admin/classes" },
    { label: "Teachers", icon: Users, href: "/admin/teachers" },
];

export default function AdminDashboard() {
    const { user } = useAuth();
    const [totalStudents, setTotalStudents] = useState(0);
    const [activeStudents, setActiveStudents] = useState(0);
    const [totalTeachers, setTotalTeachers] = useState(0);
    const [pendingAdmissions, setPendingAdmissions] = useState(0);
    const [totalHomework, setTotalHomework] = useState(0);
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Total Students via nested profiles count
                const studentsSnap = await getCountFromServer(collectionGroup(db, "profiles"));
                const total = studentsSnap.data().count;
                setTotalStudents(total);

                // Active Students = total minus those with status "LEFT"
                const leftSnap = await getCountFromServer(
                    query(collectionGroup(db, "profiles"), where("status", "==", "LEFT"))
                );
                setActiveStudents(total - leftSnap.data().count);

                // Total Teachers count
                const teachersSnap = await getCountFromServer(
                    query(collection(db, "users"), where("role", "==", "teacher"))
                );
                setTotalTeachers(teachersSnap.data().count);

                // Pending Admissions count
                const admissionsSnap = await getCountFromServer(
                    query(collection(db, "admission_requests"), where("status", "==", "pending"))
                );
                setPendingAdmissions(admissionsSnap.data().count);

                // Total Homework Posted count
                const homeworkSnap = await getCountFromServer(collection(db, "homework"));
                setTotalHomework(homeworkSnap.data().count);

                // Build recent activity from real data
                const activityList: any[] = [];

                // Recent admissions
                try {
                    const recentAdmissions = await getDocs(
                        query(collection(db, "admission_requests"), orderBy("submittedAt", "desc"), limit(3))
                    );
                    recentAdmissions.docs.forEach(doc => {
                        const d = doc.data();
                        const time = d.submittedAt?.toDate
                            ? getTimeAgo(d.submittedAt.toDate())
                            : "Recently";
                        activityList.push({
                            icon: UserPlus,
                            title: `Admission request: ${d.firstName || ""} ${d.lastName || ""}, Class ${d.enrollmentClass || "?"}`,
                            time,
                            color: d.status === "pending" ? "text-blue-500" : d.status === "rejected" ? "text-rose-500" : "text-emerald-500",
                        });
                    });
                } catch (e) {
                    // Index might not exist, that's okay
                }

                // Recent homework
                try {
                    const recentHw = await getDocs(
                        query(collection(db, "homework"), orderBy("createdAt", "desc"), limit(3))
                    );
                    recentHw.docs.forEach(doc => {
                        const d = doc.data();
                        const time = d.createdAt?.toDate
                            ? getTimeAgo(d.createdAt.toDate())
                            : "Recently";
                        activityList.push({
                            icon: PenLine,
                            title: `Homework posted: ${d.title || "Assignment"} (${d.className || "?"}-${d.section || "?"})`,
                            time,
                            color: "text-amber-500",
                        });
                    });
                } catch (e) { }

                // Sort by recency (approximated by parsing time strings / just keep insertion order)
                setRecentActivity(activityList.slice(0, 6));
            } catch (err) {
                console.error("Dashboard fetch error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    const stats = [
        {
            title: "Total Students",
            value: loading ? "..." : totalStudents.toLocaleString(),
            desc: "Enrolled this session",
            icon: GraduationCap,
            iconBg: "bg-blue-100",
            iconColor: "text-blue-600",
        },
        {
            title: "Active Students",
            value: loading ? "..." : activeStudents.toLocaleString(),
            desc: "Currently studying",
            icon: Users,
            iconBg: "bg-teal-100",
            iconColor: "text-teal-600",
        },
        {
            title: "Total Teachers",
            value: loading ? "..." : totalTeachers.toString(),
            desc: "Active faculty",
            icon: Users,
            iconBg: "bg-emerald-100",
            iconColor: "text-emerald-600",
        },
        {
            title: "Pending Admissions",
            value: loading ? "..." : pendingAdmissions.toString(),
            desc: "Awaiting review",
            icon: FileText,
            iconBg: "bg-amber-100",
            iconColor: "text-amber-600",
        },
        {
            title: "Homework Posted",
            value: loading ? "..." : totalHomework.toString(),
            desc: "Total assignments",
            icon: BookOpen,
            iconBg: "bg-violet-100",
            iconColor: "text-violet-600",
        },
    ];

    return (
        <div className="space-y-6">
            {/* Welcome Banner */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{
                        backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)`
                    }}
                />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Admin Panel</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">
                        School Overview
                    </h1>
                    <p className="text-white/40 text-sm mt-2">
                        Monitor school performance, manage operations, and track key metrics.
                    </p>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {stats.map((stat) => (
                    <div key={stat.title} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 card-hover">
                        <div className="flex items-start justify-between mb-4">
                            <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center`}>
                                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-navy">{stat.value}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{stat.title} — {stat.desc}</div>
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-5 gap-6">
                {/* Recent Activity */}
                <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-navy text-lg">Recent Activity</h2>
                    </div>
                    <div className="space-y-3">
                        {loading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-8 h-8 border-4 border-navy/20 border-t-navy rounded-full animate-spin" />
                            </div>
                        ) : recentActivity.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-10">No recent activity yet.</p>
                        ) : (
                            recentActivity.map((activity, i) => (
                                <div key={i} className="flex items-center gap-4 p-3 rounded-xl hover:bg-off-white transition-colors">
                                    <div className="w-9 h-9 rounded-lg bg-off-white flex items-center justify-center shrink-0">
                                        <activity.icon className={`w-4 h-4 ${activity.color}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-navy">{activity.title}</div>
                                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                            <Clock className="w-3 h-3" />
                                            {activity.time}
                                        </div>
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
                                <span className="text-sm font-semibold text-navy group-hover:text-white transition-colors">
                                    {action.label}
                                </span>
                            </Link>
                        ))}
                    </div>

                    {/* Pending Admissions Banner */}
                    {pendingAdmissions > 0 && (
                        <div className="mt-6 p-5 rounded-xl bg-gradient-to-r from-navy to-navy-light text-white">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-white/60 uppercase tracking-wider">Pending Applications</span>
                                <AlertCircle className="w-4 h-4 text-amber-400" />
                            </div>
                            <div className="text-2xl font-bold">{pendingAdmissions}</div>
                            <div className="text-xs text-white/40 mt-1">Admission requests awaiting review</div>
                            <Link
                                href="/admin/admissions"
                                className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
                            >
                                Review Now <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
