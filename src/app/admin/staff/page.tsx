"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, LayoutGrid, List, User, Phone, MapPin, Briefcase, Mail, IdCard } from "lucide-react";

type StaffRole = "admin" | "supervisor" | "accountant" | "teacher" | "staff" | "all";

interface StaffMember {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
    empId?: string;
    email?: string;
    phone?: string;
    designation?: string;
    department?: string;
    city?: string;
    state?: string;
    photoUrl?: string;
    role: StaffRole;
    displayRole: string;
}

const ROLE_COLOR: Record<string, string> = {
    admin: "bg-purple-100 text-purple-700",
    supervisor: "bg-blue-100 text-blue-700",
    accountant: "bg-amber-100 text-amber-700",
    teacher: "bg-emerald-100 text-emerald-700",
    staff: "bg-orange-100 text-orange-700",
};

const ROLE_LABELS: Record<string, string> = {
    all: "All Staff",
    admin: "Admins",
    supervisor: "Supervisors",
    accountant: "Accountants",
    teacher: "Teachers",
    staff: "Non-Teaching",
};

function nameOf(d: any) {
    if (d.firstName || d.lastName) return `${d.firstName || ""} ${d.lastName || ""}`.trim();
    return d.name || d.displayName || "—";
}

export default function StaffDirectoryPage() {
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"card" | "list">("card");
    const [filterRole, setFilterRole] = useState<StaffRole>("all");
    const [search, setSearch] = useState("");

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [adminSnap, supervisorSnap, accountantSnap, teacherSnap, ntsSnap] = await Promise.all([
                    getDocs(collection(db, "admins")),
                    getDocs(collection(db, "supervisors")),
                    getDocs(collection(db, "accountants")),
                    getDocs(collection(db, "teachers")),
                    getDocs(collection(db, "nonTeachingStaff")),
                ]);

                const toStaff = (snap: any, role: StaffRole, displayRole: string): StaffMember[] =>
                    snap.docs.map((d: any) => {
                        const data = d.data();
                        return {
                            id: d.id,
                            name: nameOf(data),
                            firstName: data.firstName,
                            lastName: data.lastName,
                            empId: data.admissionNumber || data.empId || data.employeeId || d.id.slice(0, 8).toUpperCase(),
                            email: data.email || "",
                            phone: data.phone || data.phoneNumber || "",
                            designation: data.designation || "",
                            department: data.department || "",
                            city: data.city || "",
                            state: data.state || "",
                            photoUrl: data.photoUrl || "",
                            role,
                            displayRole: `${displayRole}${data.designation ? " · " + data.designation : ""}`,
                        };
                    });

                const all: StaffMember[] = [
                    ...toStaff(adminSnap, "admin", "Admin"),
                    ...toStaff(supervisorSnap, "supervisor", "Supervisor"),
                    ...toStaff(accountantSnap, "accountant", "Accountant"),
                    ...toStaff(teacherSnap, "teacher", "Teacher"),
                    ...toStaff(ntsSnap, "staff", "Non-Teaching"),
                ];
                all.sort((a, b) => a.name.localeCompare(b.name));
                setStaff(all);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const filtered = useMemo(() => {
        return staff.filter(s => {
            const matchRole = filterRole === "all" || s.role === filterRole;
            const q = search.toLowerCase();
            const matchSearch = !q || s.name.toLowerCase().includes(q) ||
                s.email?.toLowerCase().includes(q) ||
                s.phone?.includes(q) ||
                s.designation?.toLowerCase().includes(q) ||
                s.empId?.toLowerCase().includes(q);
            return matchRole && matchSearch;
        });
    }, [staff, filterRole, search]);

    const counts = useMemo(() => ({
        all: staff.length,
        admin: staff.filter(s => s.role === "admin").length,
        supervisor: staff.filter(s => s.role === "supervisor").length,
        accountant: staff.filter(s => s.role === "accountant").length,
        teacher: staff.filter(s => s.role === "teacher").length,
        staff: staff.filter(s => s.role === "staff").length,
    }), [staff]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.3) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Admin Panel</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">Staff Directory</h1>
                    <p className="text-white/40 text-sm mt-2">All school staff — teachers, admins, supervisors & accountants</p>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {(["all", "teacher", "staff", "admin", "supervisor", "accountant"] as StaffRole[]).map(r => (
                    <button key={r} onClick={() => setFilterRole(r)}
                        className={`rounded-xl p-3 text-center border transition-all ${filterRole === r ? "border-navy bg-navy text-white shadow-md" : "border-gray-100 bg-white hover:border-navy/30"}`}>
                        <div className={`text-xl font-extrabold ${filterRole === r ? "text-white" : "text-navy"}`}>{counts[r]}</div>
                        <div className={`text-xs mt-0.5 font-medium ${filterRole === r ? "text-white/70" : "text-gray-400"}`}>{ROLE_LABELS[r]}</div>
                    </button>
                ))}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone, ID…"
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-navy/20 outline-none text-sm bg-white" />
                </div>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                    <button onClick={() => setViewMode("card")}
                        className={`px-4 py-2 flex items-center gap-1.5 text-xs font-semibold transition-colors ${viewMode === "card" ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                        <LayoutGrid className="w-3.5 h-3.5" /> Card View
                    </button>
                    <button onClick={() => setViewMode("list")}
                        className={`px-4 py-2 flex items-center gap-1.5 text-xs font-semibold transition-colors ${viewMode === "list" ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                        <List className="w-3.5 h-3.5" /> List View
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-8 h-8 border-4 border-navy/20 border-t-navy rounded-full animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center text-gray-400 text-sm">
                    No staff found.
                </div>
            ) : viewMode === "card" ? (
                /* ── Card View ── */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {filtered.map(s => (
                        <div key={`${s.role}_${s.id}`} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col items-center text-center p-4 hover:shadow-md transition-shadow">
                            {/* Photo */}
                            {s.photoUrl ? (
                                <img src={s.photoUrl} alt={s.name} className="w-20 h-20 rounded-xl object-cover border border-gray-200 mb-3" />
                            ) : (
                                <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center mb-3 border border-gray-200">
                                    <User className="w-9 h-9 text-gray-300" />
                                </div>
                            )}
                            {/* Name */}
                            <p className="font-bold text-navy text-sm leading-tight line-clamp-2">{s.name.toUpperCase()}</p>
                            {/* Emp ID */}
                            {s.empId && <p className="text-xs text-gray-400 mt-1 font-mono">{s.empId}</p>}
                            {/* Phone */}
                            {s.phone && <p className="text-xs text-gray-600 mt-1">{s.phone}</p>}
                            {/* Location */}
                            {(s.city || s.state || s.department) && (
                                <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide">
                                    {[s.city, s.state, s.department].filter(Boolean).join(", ")}
                                </p>
                            )}
                            {/* Role badge */}
                            <span className={`mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${ROLE_COLOR[s.role]}`}>
                                {s.displayRole}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                /* ── List View ── */
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="grid grid-cols-[48px_1fr_120px_130px_140px_120px] gap-3 px-5 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <span></span>
                        <span>Name</span>
                        <span>ID</span>
                        <span>Phone</span>
                        <span>Email</span>
                        <span>Role</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {filtered.map(s => (
                            <div key={`${s.role}_${s.id}`} className="grid grid-cols-[48px_1fr_120px_130px_140px_120px] gap-3 px-5 py-3 items-center hover:bg-gray-50/50 transition-colors">
                                {/* Avatar */}
                                {s.photoUrl ? (
                                    <img src={s.photoUrl} alt={s.name} className="w-9 h-9 rounded-lg object-cover border border-gray-200" />
                                ) : (
                                    <div className="w-9 h-9 rounded-lg bg-navy/10 flex items-center justify-center">
                                        <span className="text-sm font-bold text-navy">{(s.name || "?").charAt(0).toUpperCase()}</span>
                                    </div>
                                )}
                                {/* Name + designation */}
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-navy truncate">{s.name}</p>
                                    {s.designation && <p className="text-xs text-gray-400 truncate">{s.designation}</p>}
                                </div>
                                <span className="text-xs font-mono text-gray-600 truncate">{s.empId || "—"}</span>
                                <span className="text-xs text-gray-600 truncate">{s.phone || "—"}</span>
                                <span className="text-xs text-gray-600 truncate">{s.email || "—"}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${ROLE_COLOR[s.role]} w-fit`}>
                                    {ROLE_LABELS[s.role]}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
