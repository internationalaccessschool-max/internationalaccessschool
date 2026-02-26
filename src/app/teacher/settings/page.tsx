"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";
import { Save, User, Phone, GraduationCap, CreditCard, Building2, FileText, Loader2, CheckCircle2 } from "lucide-react";

const GENDER_OPTIONS = ["Male", "Female", "Other"];
const BLOOD_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const CATEGORY_OPTIONS = ["General", "OBC", "SC", "ST", "Other"];

type Tab = "profile" | "personal" | "documents" | "bank";

const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "profile", label: "Profile", icon: User },
    { id: "personal", label: "Personal", icon: Phone },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "bank", label: "Bank", icon: Building2 },
];

interface TeacherProfile {
    firstName: string; lastName: string; phone: string; qualification: string; photoUrl: string;
    dob: string; gender: string; bloodGroup: string; socialCategory: string;
    fatherName: string; permanentAddress: string; emergencyContact: string;
    panNumber: string; aadhaarNumber: string; panUrl: string; aadhaarUrl: string;
    bankName: string; bankAccountNumber: string; ifscCode: string; uanNumber: string; epfNumber: string;
}

const EMPTY: TeacherProfile = {
    firstName: "", lastName: "", phone: "", qualification: "", photoUrl: "",
    dob: "", gender: "", bloodGroup: "", socialCategory: "",
    fatherName: "", permanentAddress: "", emergencyContact: "",
    panNumber: "", aadhaarNumber: "", panUrl: "", aadhaarUrl: "",
    bankName: "", bankAccountNumber: "", ifscCode: "", uanNumber: "", epfNumber: "",
};

export default function TeacherSettingsPage() {
    const [uid, setUid] = useState<string | null>(null);
    const [profile, setProfile] = useState<TeacherProfile>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>("profile");

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) return;
            setUid(user.uid);
            const snap = await getDoc(doc(db, "teachers", user.uid));
            if (snap.exists()) {
                const data = snap.data();
                setProfile(prev => ({ ...prev, ...data }));
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleSave = async () => {
        if (!uid) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, "teachers", uid), { ...profile });
            await updateDoc(doc(db, "users", uid), { ...profile });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) {
            console.error(e);
            alert("Failed to save. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const set = (key: keyof TeacherProfile) => (val: string) =>
        setProfile(p => ({ ...p, [key]: val }));

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
                    <p className="text-white/40 text-sm mt-1">Update your personal, professional, and bank details.</p>
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
                <div className="md:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">

                    {/* ── Profile Tab ── */}
                    {activeTab === "profile" && (
                        <>
                            <h2 className="font-bold text-navy text-lg">Profile Information</h2>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-20 h-20 rounded-2xl bg-navy/10 overflow-hidden border border-navy/10 shrink-0 flex items-center justify-center">
                                    {profile.photoUrl
                                        ? <img src={profile.photoUrl} alt="photo" className="w-full h-full object-cover" />
                                        : <User className="w-8 h-8 text-navy/30" />}
                                </div>
                                <CloudinaryUpload
                                    folder="teachers"
                                    subFolder="photos"
                                    onUpload={(url) => set("photoUrl")(url)}
                                    acceptedFileTypes="images"
                                    maxSizeMB={5}
                                    label="Upload Profile Photo"
                                />
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <Field label="First Name" value={profile.firstName} onChange={set("firstName")} />
                                <Field label="Last Name" value={profile.lastName} onChange={set("lastName")} />
                                <Field label="Phone Number" value={profile.phone} onChange={set("phone")} />
                                <Field label="Qualification" value={profile.qualification} onChange={set("qualification")} placeholder="e.g. B.Ed, M.Sc" />
                            </div>
                        </>
                    )}

                    {/* ── Personal Tab ── */}
                    {activeTab === "personal" && (
                        <>
                            <h2 className="font-bold text-navy text-lg">Personal Details</h2>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <Field label="Date of Birth" value={profile.dob} onChange={set("dob")} type="date" />
                                <SelectField label="Gender" value={profile.gender} onChange={set("gender")} options={GENDER_OPTIONS} />
                                <SelectField label="Blood Group" value={profile.bloodGroup} onChange={set("bloodGroup")} options={BLOOD_OPTIONS} />
                                <SelectField label="Social Category" value={profile.socialCategory} onChange={set("socialCategory")} options={CATEGORY_OPTIONS} />
                                <Field label="Father's Name" value={profile.fatherName} onChange={set("fatherName")} />
                                <Field label="Emergency Contact" value={profile.emergencyContact} onChange={set("emergencyContact")} placeholder="+91 XXXXX XXXXX" />
                                <div className="sm:col-span-2">
                                    <Field label="Permanent Address" value={profile.permanentAddress} onChange={set("permanentAddress")} placeholder="Full address..." />
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Documents Tab ── */}
                    {activeTab === "documents" && (
                        <>
                            <h2 className="font-bold text-navy text-lg">Identity Documents</h2>
                            <div className="grid sm:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <Field label="PAN Number" value={profile.panNumber} onChange={set("panNumber")} placeholder="ABCDE1234F" />
                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">PAN Card Upload</p>
                                        {profile.panUrl && <a href={profile.panUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline block mb-2">📄 View current PAN</a>}
                                        <CloudinaryUpload folder="admin-docs" subFolder="staff-docs" onUpload={(url) => set("panUrl")(url)} acceptedFileTypes="all" maxSizeMB={2} label="Upload PAN Card" />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <Field label="Aadhaar Number" value={profile.aadhaarNumber} onChange={set("aadhaarNumber")} placeholder="12 digit number" />
                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Aadhaar Upload</p>
                                        {profile.aadhaarUrl && <a href={profile.aadhaarUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline block mb-2">📄 View current Aadhaar</a>}
                                        <CloudinaryUpload folder="admin-docs" subFolder="staff-docs" onUpload={(url) => set("aadhaarUrl")(url)} acceptedFileTypes="all" maxSizeMB={2} label="Upload Aadhaar" />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Bank Tab ── */}
                    {activeTab === "bank" && (
                        <>
                            <h2 className="font-bold text-navy text-lg">Bank & Payroll Details</h2>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <Field label="Bank Name" value={profile.bankName} onChange={set("bankName")} placeholder="e.g. SBI, HDFC" />
                                <Field label="Account Number" value={profile.bankAccountNumber} onChange={set("bankAccountNumber")} />
                                <Field label="IFSC Code" value={profile.ifscCode} onChange={set("ifscCode")} />
                                <Field label="UAN Number" value={profile.uanNumber} onChange={set("uanNumber")} />
                                <Field label="EPF Number" value={profile.epfNumber} onChange={set("epfNumber")} />
                            </div>
                        </>
                    )}

                    {/* Save Button */}
                    <div className="pt-6 border-t border-gray-100 flex justify-end">
                        <button onClick={handleSave} disabled={saving}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 ${saved ? "bg-emerald-500 text-white" : "bg-navy text-white hover:bg-navy/90"}`}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, type = "text", placeholder }: {
    label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
            <input type={type} value={value} onChange={e => onChange(e.target.value)}
                placeholder={placeholder || `Enter ${label.toLowerCase()}`}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition-all" />
        </div>
    );
}

function SelectField({ label, value, onChange, options }: {
    label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-navy bg-white transition-all">
                <option value="">Select {label}</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );
}
