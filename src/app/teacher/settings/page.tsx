"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { User, Phone, GraduationCap, Building2, FileText, Loader2, Lock, Info } from "lucide-react";

type Tab = "profile" | "personal" | "documents" | "bank";

const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "profile", label: "Profile", icon: User },
    { id: "personal", label: "Personal", icon: Phone },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "bank", label: "Bank & PF", icon: Building2 },
];

export default function TeacherSettingsPage() {
    const [profile, setProfile] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>("profile");

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) return;
            const snap = await getDoc(doc(db, "teachers", user.uid));
            if (snap.exists()) setProfile(snap.data());
            setLoading(false);
        });
        return () => unsub();
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-navy" />
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl gradient-navy p-6 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 80% 50%, rgba(200,169,81,0.2) 0%, transparent 50%)` }} />
                <div className="relative z-10">
                    <p className="text-white/50 text-sm font-medium">Teacher Portal</p>
                    <h1 className="text-2xl md:text-3xl font-bold text-white mt-1">My Profile</h1>
                    <p className="text-white/40 text-sm mt-1">View your personal, professional, and bank details.</p>
                </div>
            </div>

            {/* Read-only notice */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
                <Lock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-semibold text-amber-800">Profile is managed by Admin</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                        Your profile details can only be updated by the school administration. Please contact the admin office to request any changes.
                    </p>
                </div>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
                {/* Tab Nav */}
                <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-3 h-fit">
                    <nav className="space-y-0.5">
                        {TABS.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id ? "bg-navy text-white" : "text-gray-500 hover:bg-gray-50 hover:text-navy"}`}>
                                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? "text-gold" : "text-gray-400"}`} />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Panel */}
                <div className="md:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">

                    {/* ── Profile Tab ── */}
                    {activeTab === "profile" && (<>
                        <h2 className="font-bold text-navy text-lg">Profile Information</h2>
                        {profile.photoUrl && (
                            <img src={profile.photoUrl} alt="profile" className="w-20 h-20 rounded-2xl object-cover border border-gray-100" />
                        )}
                        <div className="grid sm:grid-cols-2 gap-4">
                            <ViewField label="First Name" value={profile.firstName} />
                            <ViewField label="Last Name" value={profile.lastName} />
                            <ViewField label="Phone Number" value={profile.phone} />
                            <ViewField label="Qualification" value={profile.qualification} />
                            <ViewField label="Designation" value={profile.designation} />
                            <ViewField label="Joining Date" value={profile.joiningDate} />
                            <ViewField label="Basic Salary" value={profile.basicSalary ? `₹${profile.basicSalary}` : ""} />
                            <ViewField label="Subjects" value={Array.isArray(profile.subjects) ? profile.subjects.join(", ") : profile.subjects} />
                        </div>
                    </>)}

                    {/* ── Personal Tab ── */}
                    {activeTab === "personal" && (<>
                        <h2 className="font-bold text-navy text-lg">Personal Details</h2>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <ViewField label="Date of Birth" value={profile.dob} />
                            <ViewField label="Gender" value={profile.gender} />
                            <ViewField label="Blood Group" value={profile.bloodGroup} />
                            <ViewField label="Social Category" value={profile.socialCategory} />
                            <ViewField label="Father's Name" value={profile.fatherName} />
                            <ViewField label="Emergency Contact" value={profile.emergencyContact} />
                            <div className="sm:col-span-2">
                                <ViewField label="Permanent Address" value={profile.permanentAddress} />
                            </div>
                        </div>
                    </>)}

                    {/* ── Documents Tab ── */}
                    {activeTab === "documents" && (<>
                        <h2 className="font-bold text-navy text-lg">Identity Documents</h2>
                        <div className="grid sm:grid-cols-2 gap-5">
                            <div className="space-y-3">
                                <ViewField label="PAN Number" value={profile.panNumber} />
                                {(profile.panCardUrl || profile.panUrl) && (
                                    <a href={profile.panCardUrl || profile.panUrl} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:underline">
                                        📄 View PAN Card
                                    </a>
                                )}
                            </div>
                            <div className="space-y-3">
                                <ViewField label="Aadhaar Number" value={profile.aadhaarNumber} />
                                {(profile.aadhaarUrl) && (
                                    <a href={profile.aadhaarUrl} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:underline">
                                        📄 View Aadhaar
                                    </a>
                                )}
                            </div>
                        </div>
                    </>)}

                    {/* ── Bank & PF Tab ── */}
                    {activeTab === "bank" && (<>
                        <h2 className="font-bold text-navy text-lg">Bank & Payroll Details</h2>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <ViewField label="Bank Name" value={profile.bankName} />
                            <ViewField label="Account Number" value={profile.bankAccountNumber} />
                            <ViewField label="IFSC Code" value={profile.ifscCode} />
                        </div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1 mt-4">PF Details</p>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <ViewField label="UAN Number" value={profile.uanNumber} />
                            <ViewField label="EPF / PF Number" value={profile.epfNumber} />
                            <ViewField label="PF Joining Date" value={profile.pfJoiningDate} />
                        </div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1 mt-4">ESIC Details</p>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <ViewField label="ESIC Joining Date" value={profile.esicJoiningDate} />
                        </div>
                    </>)}
                </div>
            </div>
        </div>
    );
}

function ViewField({ label, value }: { label: string; value?: string }) {
    return (
        <div>
            <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">{label}</p>
            <p className="text-sm font-medium text-navy px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 min-h-[40px]">
                {value || <span className="text-gray-300 font-normal">—</span>}
            </p>
        </div>
    );
}
