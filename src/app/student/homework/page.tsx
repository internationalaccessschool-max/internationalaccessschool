"use client";

import { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FileViewerTrigger } from "@/components/ui/file-viewer";
import { BookOpen, Calendar, Clock, Filter, ChevronDown, Search } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Homework {
    id: string;
    title: string;
    description: string;
    className: string;
    section: string;
    subject: string;
    dueDate: string;
    assignedDate?: string;
    assignedDay?: string;
    fileUrl?: string;
    fileName?: string;
    createdAt: unknown;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SUBJECT_COLORS: Record<string, string> = {
    "Mathematics": "bg-blue-100 text-blue-700",
    "Science": "bg-green-100 text-green-700",
    "English": "bg-purple-100 text-purple-700",
    "Hindi": "bg-orange-100 text-orange-700",
    "Social Science": "bg-teal-100 text-teal-700",
    "Computer Science": "bg-indigo-100 text-indigo-700",
    "Physics": "bg-cyan-100 text-cyan-700",
    "Chemistry": "bg-lime-100 text-lime-700",
    "Biology": "bg-emerald-100 text-emerald-700",
    "History": "bg-amber-100 text-amber-700",
    "Geography": "bg-rose-100 text-rose-700",
    "Economics": "bg-yellow-100 text-yellow-700",
};

function getSubjectColor(subject: string) {
    return SUBJECT_COLORS[subject] || "bg-gray-100 text-gray-600";
}

function getDueStatus(dueDate: string): { label: string; color: string } {
    if (!dueDate) return { label: "No deadline", color: "text-gray-400" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + "T00:00:00");
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: "Overdue", color: "text-red-600 bg-red-50" };
    if (diff === 0) return { label: "Due Today!", color: "text-orange-600 bg-orange-50" };
    if (diff === 1) return { label: "Due Tomorrow", color: "text-amber-600 bg-amber-50" };
    if (diff <= 3) return { label: `${diff} days left`, color: "text-yellow-600 bg-yellow-50" };
    return { label: `${diff} days left`, color: "text-green-600 bg-green-50" };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function StudentHomeworkPage() {
    const [homeworks, setHomeworks] = useState<Homework[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState("All");
    const [filterSection, setFilterSection] = useState("All");
    const [filterSubject, setFilterSubject] = useState("All");
    const [search, setSearch] = useState("");

    // Real-time Firestore listener fetching ALL homework globally
    useEffect(() => {
        const q = query(collection(db, "homework"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Homework));
            setHomeworks(docs);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // ── Derived lists ─────────────────────────────────────────────────────────
    const allClasses = ["All", ...Array.from(new Set(homeworks.map(h => h.className))).filter(Boolean).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '') || "0");
        const numB = parseInt(b.replace(/\D/g, '') || "0");
        return numA - numB;
    })];
    const allSections = ["All", ...Array.from(new Set(homeworks.map(h => h.section))).filter(Boolean).sort()];
    const allSubjects = ["All", ...Array.from(new Set(homeworks.map(h => h.subject))).filter(Boolean).sort()];

    const filtered = homeworks.filter(hw => {
        const matchClass = filterClass === "All" || hw.className === filterClass;
        const matchSection = filterSection === "All" || hw.section === filterSection;
        const matchSubject = filterSubject === "All" || hw.subject === filterSubject;
        const matchSearch = !search || hw.title.toLowerCase().includes(search.toLowerCase())
            || hw.subject.toLowerCase().includes(search.toLowerCase());
        return matchClass && matchSection && matchSubject && matchSearch;
    });

    const pending = filtered.filter(hw => {
        if (!hw.dueDate) return true;
        const due = new Date(hw.dueDate + "T00:00:00");
        return due >= new Date(new Date().toDateString());
    });
    const overdue = filtered.filter(hw => {
        if (!hw.dueDate) return false;
        const due = new Date(hw.dueDate + "T00:00:00");
        return due < new Date(new Date().toDateString());
    });

    return (
        <div className="space-y-6">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(200,169,81,0.4) 0%, transparent 60%)" }}
                />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Student Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">📚 My Homework</h1>
                    <p className="text-white/40 text-sm mt-1">View all assignments given by your teachers</p>
                </div>
                {/* Stats pills */}
                <div className="relative z-10 flex gap-3 mt-4 flex-wrap">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-sm">
                        <span className="font-bold text-lg">{pending.length}</span>
                        <span className="text-white/60 ml-1">Pending</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-sm">
                        <span className="font-bold text-lg text-red-300">{overdue.length}</span>
                        <span className="text-white/60 ml-1">Overdue</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white text-sm">
                        <span className="font-bold text-lg">{homeworks.length}</span>
                        <span className="text-white/60 ml-1">Total</span>
                    </div>
                </div>
            </div>

            {/* ── Filters ────────────────────────────────────────────────────── */}
            <div className="flex flex-col flex-wrap lg:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search assignments..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none text-sm"
                    />
                </div>
                {/* Class filter */}
                <div className="relative min-w-[120px]">
                    <select
                        value={filterClass}
                        onChange={e => setFilterClass(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white text-sm"
                    >
                        {allClasses.map(c => <option key={c} value={c}>{c === "All" ? "All Classes" : c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                {/* Section filter */}
                <div className="relative min-w-[120px]">
                    <select
                        value={filterSection}
                        onChange={e => setFilterSection(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white text-sm"
                    >
                        {allSections.map(s => <option key={s} value={s}>{s === "All" ? "All Sections" : `Section ${s}`}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                {/* Subject filter */}
                <div className="relative min-w-[150px]">
                    <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <select
                        value={filterSubject}
                        onChange={e => setFilterSubject(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none appearance-none bg-white text-sm"
                    >
                        {allSubjects.map(s => <option key={s} value={s}>{s === "All" ? "All Subjects" : s}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
            </div>

            {/* ── Content ────────────────────────────────────────────────────── */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                        <div className="w-10 h-10 border-4 border-navy/20 border-t-navy rounded-full animate-spin" />
                        <p className="text-sm">Loading assignments...</p>
                    </div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center">
                    <div className="text-5xl mb-4">🎉</div>
                    <p className="font-bold text-navy text-lg">No homework right now!</p>
                    <p className="text-gray-400 text-sm mt-1">Check back later for new assignments.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Pending / Active */}
                    {pending.length > 0 && (
                        <div>
                            <h2 className="text-base font-bold text-navy mb-3 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-amber-500" /> Pending Assignments
                            </h2>
                            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                {pending.map(hw => <HomeworkCard key={hw.id} hw={hw} />)}
                            </div>
                        </div>
                    )}

                    {/* Overdue */}
                    {overdue.length > 0 && (
                        <div>
                            <h2 className="text-base font-bold text-red-600 mb-3 flex items-center gap-2">
                                <Calendar className="w-4 h-4" /> Overdue
                            </h2>
                            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 opacity-80">
                                {overdue.map(hw => <HomeworkCard key={hw.id} hw={hw} overdue />)}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Homework Card ─────────────────────────────────────────────────────────────
function HomeworkCard({ hw, overdue = false }: { hw: Homework; overdue?: boolean }) {
    const due = getDueStatus(hw.dueDate);
    const fmtDue = hw.dueDate
        ? new Date(hw.dueDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : "—";

    return (
        <div className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all flex flex-col ${overdue ? "border-red-100" : "border-gray-100"}`}>
            {/* Colored top bar */}
            <div className={`h-1.5 rounded-t-2xl ${overdue ? "bg-red-400" : "bg-navy"}`} />

            <div className="p-5 flex-1 space-y-3">
                {/* Class + Subject badges */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 bg-navy/10 text-navy rounded text-xs font-bold">
                        {hw.className}{hw.section ? `-${hw.section}` : ""}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getSubjectColor(hw.subject)}`}>
                        {hw.subject}
                    </span>
                </div>

                {/* Title */}
                <h3 className="font-bold text-navy leading-snug">{hw.title}</h3>

                {/* Description */}
                {hw.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">{hw.description}</p>
                )}

                {/* Dates */}
                <div className="text-xs text-gray-400 space-y-1">
                    {hw.assignedDate && (
                        <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            Assigned: {hw.assignedDay}, {new Date(hw.assignedDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                    )}
                    <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Due: {fmtDue}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-4 flex items-center justify-between">
                {/* Due status badge */}
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${due.color}`}>
                    {due.label}
                </span>

                {/* View attachment */}
                {hw.fileUrl && (
                    <FileViewerTrigger
                        url={hw.fileUrl}
                        fileName={hw.fileName || "attachment"}
                        label="View File"
                        className="text-xs"
                    />
                )}
            </div>
        </div>
    );
}
