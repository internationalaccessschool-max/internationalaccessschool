"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, updateDoc, collectionGroup, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import {
    Loader2, User, Phone, MapPin, GraduationCap, HeartPulse,
    FileText, Camera, Landmark, Save, CheckCircle2, Lock
} from "lucide-react";
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";

type Tab = "personal" | "academic" | "parents" | "medical" | "bank" | "documents";

// Fields that only admins can change
const READ_ONLY_FIELDS = ["admissionNumber", "className", "section", "session", "pen", "aparId", "role"];

export default function StudentProfilePage() {
    const [userData, setUserData] = useState<any>(null);
    const [formData, setFormData] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>("personal");
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                router.push("/student/login");
                setLoading(false);
                return;
            }

            let rawData: any = null;

            try {
                const allProfiles = await getDocs(collectionGroup(db, "profiles"));
                const match = allProfiles.docs.find(d => d.id === user.uid);
                if (match) {
                    rawData = { id: user.uid, role: "student", ...match.data() };
                }
            } catch (e) {
                console.warn("Could not search profiles collectionGroup:", e);
            }

            if (rawData) {
                // Convert DOB from DD-MM-YYYY (DB) to YYYY-MM-DD (for date input)
                if (rawData.dob && rawData.dob.match(/^\d{2}-\d{2}-\d{4}$/)) {
                    const [d, m, y] = rawData.dob.split("-");
                    rawData.dob = `${y}-${m}-${d}`;
                }
                setUserData(rawData);
                setFormData(rawData);
            } else {
                // No data found in either source
                setUserData({ id: user.uid });
                setFormData({ id: user.uid });
            }

            setLoading(false);
        });
        return () => unsubscribe();
    }, [router]);

    const handleChange = (field: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!userData?.id) return;
        setSaving(true);
        try {
            // Strip read-only and system fields before saving
            const { id, role, ...rest } = formData;
            const sanitized: any = {};
            for (const key of Object.keys(rest)) {
                if (!READ_ONLY_FIELDS.includes(key)) {
                    sanitized[key] = rest[key] ?? "";
                }
            }

            // Check if DOB changed for auth update
            const oldDob = userData.dob;
            let newDobForAuth = null;

            // Convert DOB from YYYY-MM-DD (date input) back to DD-MM-YYYY for DB
            if (sanitized.dob && sanitized.dob.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [y, m, d] = sanitized.dob.split("-");
                sanitized.dob = `${d}-${m}-${y}`;
            }

            // Always sync Auth password with DOB on save to heal broken accounts
            if (sanitized.dob) {
                newDobForAuth = sanitized.dob;
            }

            // Update the nested profiles doc
            try {
                const allProfiles = await getDocs(collectionGroup(db, "profiles"));
                const nestedDoc = allProfiles.docs.find(d => d.id === userData.id);
                if (nestedDoc) {
                    await setDoc(nestedDoc.ref, sanitized, { merge: true });
                } else {
                    console.error("No profile document found for student.");
                }
            } catch (e) {
                console.warn("Could not update nested profile doc:", e);
            }

            setUserData((prev: any) => ({ ...prev, ...sanitized }));
            setSaved(true);

            // Update Auth Password and profile name
            try {
                const newDisplayName = `${sanitized.firstName || ""} ${sanitized.lastName || ""}`.trim();
                await fetch("/api/admin/update-student-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        uid: userData.id,
                        newPassword: newDobForAuth,
                        newDisplayName: newDisplayName
                    })
                });
            } catch (e) {
                console.warn("Failed to update auth profile:", e);
            }

            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            console.error("Failed to save profile", err);
            alert("Failed to save. Please try again.");
        }
        setSaving(false);
    };

    const handleDocumentUpdate = async (field: string, url: string) => {
        if (!userData?.id) return;
        try {
            const allProfiles = await getDocs(collectionGroup(db, "profiles"));
            const nestedDoc = allProfiles.docs.find(d => d.id === userData.id);
            if (nestedDoc) {
                await updateDoc(nestedDoc.ref, { [field]: url });
            } else {
                throw new Error("Profile not found");
            }
            setUserData((prev: any) => ({ ...prev, [field]: url }));
            setFormData((prev: any) => ({ ...prev, [field]: url }));
        } catch (error) {
            console.error("Failed to update document", error);
            alert("Failed to save image. Please try again.");
        }
    };

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-navy" />
            </div>
        );
    }

    if (!userData) return null;

    const tabs: { id: Tab; label: string; icon: any }[] = [
        { id: "personal", label: "Personal Info", icon: User },
        { id: "academic", label: "Academic Info", icon: GraduationCap },
        { id: "parents", label: "Family Details", icon: Phone },
        { id: "medical", label: "Medical & Physical", icon: HeartPulse },
        { id: "bank", label: "Bank Details", icon: Landmark },
        { id: "documents", label: "Documents", icon: FileText },
    ];

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header Profile Summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
                <div className="h-32 bg-gradient-to-r from-navy to-navy-light" />
                <div className="px-6 sm:px-10 pb-8 flex flex-col sm:flex-row gap-6 sm:items-end -mt-12 relative z-10">
                    <div
                        className="relative w-32 h-32 rounded-full border-4 border-white bg-gray-100 shrink-0 shadow-md group overflow-hidden cursor-pointer"
                        onClick={() => setActiveTab("documents")}
                    >
                        {formData.childPhotoUrl ? (
                            <img src={formData.childPhotoUrl} alt="Student" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-300">
                                <User className="w-12 h-12" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="w-6 h-6 text-white" />
                        </div>
                    </div>
                    <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-bold text-navy">
                                {formData.firstName} {formData.lastName}
                            </h1>
                            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">Active</span>
                        </div>
                        <p className="text-gray-500 font-medium">
                            {userData.className} {userData.section ? `— Section ${userData.section}` : ""}
                        </p>
                        <p className="text-gray-400 text-sm">
                            Admission No: <span className="text-navy font-semibold">{userData.admissionNumber}</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Tabs */}
                <div className="flex overflow-x-auto border-b border-gray-100 hide-scrollbar">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${activeTab === tab.id
                                ? "border-navy text-navy bg-navy/5"
                                : "border-transparent text-gray-400 hover:text-navy hover:bg-gray-50"
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="p-6 sm:p-8">

                    {/* ── PERSONAL INFO ── */}
                    {activeTab === "personal" && (
                        <div className="space-y-6">
                            <SectionNote text="These are your personal details. Fields marked with a lock are managed by admin." />
                            <div className="grid sm:grid-cols-2 gap-5">
                                <Field label="First Name" field="firstName" value={formData.firstName} onChange={handleChange} />
                                <Field label="Middle Name" field="middleName" value={formData.middleName} onChange={handleChange} />
                                <Field label="Last Name" field="lastName" value={formData.lastName} onChange={handleChange} />
                                <Field label="Date of Birth" field="dob" value={formData.dob} onChange={handleChange} type="date" />
                                <SelectField
                                    label="Gender" field="gender" value={formData.gender} onChange={handleChange}
                                    options={["Male", "Female", "Other"]}
                                />
                                <SelectField
                                    label="Blood Group" field="bloodGroup" value={formData.bloodGroup} onChange={handleChange}
                                    options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]}
                                />
                                <SelectField
                                    label="Category" field="category" value={formData.category} onChange={handleChange}
                                    options={["General", "OBC", "SC", "ST", "EWS"]}
                                />
                                <SelectField
                                    label="Physically Disabled" field="physicallyDisabled" value={formData.physicallyDisabled} onChange={handleChange}
                                    options={["No", "Yes"]}
                                />
                                <Field label="Aadhaar No" field="aadharNo" value={formData.aadharNo} onChange={handleChange} />
                                <Field label="Mobile No" field="mobileNo" value={formData.mobileNo} onChange={handleChange} type="tel" />
                                <Field label="PEN" field="pen" value={formData.pen} onChange={handleChange} readOnly />
                                <Field label="APAR ID" field="aparId" value={formData.aparId} onChange={handleChange} readOnly />
                                <div className="sm:col-span-2">
                                    <Field label="Local Address" field="localAddress" value={formData.localAddress} onChange={handleChange} textarea />
                                </div>
                                <div className="sm:col-span-2">
                                    <Field label="Permanent Address" field="permanentAddress" value={formData.permanentAddress} onChange={handleChange} textarea />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── ACADEMIC INFO ── */}
                    {activeTab === "academic" && (
                        <div className="space-y-6">
                            <SectionNote text="Academic details are managed by school administration and cannot be changed by students." />
                            <div className="grid sm:grid-cols-2 gap-5">
                                <Field label="Admission Number" field="admissionNumber" value={formData.admissionNumber} onChange={handleChange} readOnly />
                                <Field label="Class" field="className" value={formData.className} onChange={handleChange} readOnly />
                                <Field label="Section" field="section" value={formData.section} onChange={handleChange} readOnly />
                                <Field label="Session" field="session" value={formData.session} onChange={handleChange} readOnly />
                                <Field label="PEN" field="pen" value={formData.pen} onChange={handleChange} readOnly />
                                <Field label="APAR ID" field="aparId" value={formData.aparId} onChange={handleChange} readOnly />
                            </div>
                        </div>
                    )}

                    {/* ── FAMILY DETAILS ── */}
                    {activeTab === "parents" && (
                        <div className="space-y-8">
                            <SectionNote text="Please provide accurate family details. This information is used for official school records." />

                            <div>
                                <h3 className="text-base font-bold text-navy border-b border-gray-100 pb-3 mb-5">Father's Details</h3>
                                <div className="grid sm:grid-cols-2 gap-5">
                                    <Field label="Father's Name" field="fatherName" value={formData.fatherName} onChange={handleChange} />
                                    <Field label="Qualification" field="fatherQualification" value={formData.fatherQualification} onChange={handleChange} />
                                    <Field label="Occupation" field="fatherOccupation" value={formData.fatherOccupation} onChange={handleChange} />
                                    <Field label="Mobile No" field="fatherPhone" value={formData.fatherPhone} onChange={handleChange} type="tel" />
                                    <Field label="Aadhaar No" field="fatherAadharNo" value={formData.fatherAadharNo} onChange={handleChange} />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-base font-bold text-navy border-b border-gray-100 pb-3 mb-5">Mother's Details</h3>
                                <div className="grid sm:grid-cols-2 gap-5">
                                    <Field label="Mother's Name" field="motherName" value={formData.motherName} onChange={handleChange} />
                                    <Field label="Qualification" field="motherQualification" value={formData.motherQualification} onChange={handleChange} />
                                    <Field label="Occupation" field="motherOccupation" value={formData.motherOccupation} onChange={handleChange} />
                                    <Field label="Aadhaar No" field="motherAadharNo" value={formData.motherAadharNo} onChange={handleChange} />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-base font-bold text-navy border-b border-gray-100 pb-3 mb-5">Household Information</h3>
                                <div className="grid sm:grid-cols-3 gap-5">
                                    <Field label="No. of Brothers" field="noOfBrothers" value={formData.noOfBrothers} onChange={handleChange} type="number" />
                                    <Field label="No. of Sisters" field="noOfSisters" value={formData.noOfSisters} onChange={handleChange} type="number" />
                                    <Field label="Annual Income (₹)" field="annualIncome" value={formData.annualIncome} onChange={handleChange} type="number" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── MEDICAL & PHYSICAL ── */}
                    {activeTab === "medical" && (
                        <div className="space-y-6">
                            <SectionNote text="Medical information helps the school provide appropriate care in case of emergencies." />
                            <div className="grid sm:grid-cols-2 gap-5">
                                <SelectField
                                    label="Blood Group" field="bloodGroup" value={formData.bloodGroup} onChange={handleChange}
                                    options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]}
                                />
                                <Field label="Height (e.g. 165 cm)" field="height" value={formData.height} onChange={handleChange} />
                                <Field label="Weight (e.g. 55 kg)" field="weight" value={formData.weight} onChange={handleChange} />
                                <div className="sm:col-span-2">
                                    <Field
                                        label="Allergies (if any)"
                                        field="allergies"
                                        value={formData.allergies}
                                        onChange={handleChange}
                                        textarea
                                        placeholder="e.g. Dust, Peanuts, Penicillin... or write None"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── BANK DETAILS ── */}
                    {activeTab === "bank" && (
                        <div className="space-y-6">
                            <SectionNote text="Bank details are used for scholarship disbursements and fee refunds. Please ensure accuracy." />
                            <div className="grid sm:grid-cols-2 gap-5">
                                <div className="sm:col-span-2">
                                    <Field label="Account Holder's Name" field="accountHolderName" value={formData.accountHolderName} onChange={handleChange} />
                                </div>
                                <Field label="Account Number" field="accountNumber" value={formData.accountNumber} onChange={handleChange} />
                                <Field label="IFSC Code" field="ifscCode" value={formData.ifscCode} onChange={handleChange} />
                            </div>
                        </div>
                    )}

                    {/* ── DOCUMENTS ── */}
                    {activeTab === "documents" && (
                        <div className="space-y-8">
                            <SectionNote text="Upload clear photos/scans of required documents. Files are securely stored on your profile." />
                            <div className="grid md:grid-cols-3 gap-6">
                                {[
                                    { title: "Student Photo", field: "childPhotoUrl" },
                                    { title: "Parents Photo (Joint)", field: "parentPhotoUrl" },
                                    { title: "Student Aadhaar Card", field: "aadharUrl" },
                                    { title: "APAR ID Document", field: "aparUrl" },
                                    { title: "Father Aadhaar Card", field: "fatherAadharUrl" },
                                    { title: "Mother Aadhaar Card", field: "motherAadharUrl" },
                                ].map((doc) => (
                                    <DocumentCard
                                        key={doc.field}
                                        title={doc.title}
                                        url={formData[doc.field]}
                                        onUpload={(url) => handleDocumentUpdate(doc.field, url)}
                                        onRemove={() => handleDocumentUpdate(doc.field, "")}
                                        folder="student-profiles"
                                        uid={userData.id}
                                        acceptedFileTypes={doc.field.includes("Photo") ? "images" : "all"}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Save Button (not shown for read-only or documents tabs) ── */}
                    {activeTab !== "documents" && activeTab !== "academic" && (
                        <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between">
                            <p className="text-xs text-gray-400">Changes are saved to your school profile record.</p>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${saved
                                    ? "bg-emerald-500 text-white"
                                    : "bg-navy text-white hover:bg-navy/90 disabled:opacity-60"
                                    }`}
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : saved ? (
                                    <CheckCircle2 className="w-4 h-4" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Reusable Components ─── */

function SectionNote({ text }: { text: string }) {
    return (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
            {text}
        </div>
    );
}

interface FieldProps {
    label: string;
    field: string;
    value?: string | number;
    onChange: (field: string, value: string) => void;
    type?: string;
    readOnly?: boolean;
    textarea?: boolean;
    placeholder?: string;
}

function Field({ label, field, value, onChange, type = "text", readOnly = false, textarea = false, placeholder }: FieldProps) {
    const baseClass = `w-full px-4 py-2.5 rounded-xl border text-sm text-navy transition-all focus:outline-none ${readOnly
        ? "bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed"
        : "bg-white border-gray-200 focus:border-navy focus:ring-2 focus:ring-navy/10"
        }`;

    return (
        <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                {readOnly && <Lock className="w-3 h-3 text-gray-300" />}
                {label}
            </label>
            {textarea ? (
                <textarea
                    rows={3}
                    readOnly={readOnly}
                    value={value ?? ""}
                    placeholder={placeholder}
                    onChange={(e) => !readOnly && onChange(field, e.target.value)}
                    className={`${baseClass} resize-none`}
                />
            ) : (
                <input
                    type={type}
                    readOnly={readOnly}
                    value={value ?? ""}
                    placeholder={placeholder || `Enter ${label.toLowerCase()}`}
                    onChange={(e) => !readOnly && onChange(field, e.target.value)}
                    className={baseClass}
                />
            )}
        </div>
    );
}

function SelectField({ label, field, value, onChange, options }: {
    label: string; field: string; value?: string;
    onChange: (field: string, value: string) => void; options: string[];
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
            <select
                value={value ?? ""}
                onChange={(e) => onChange(field, e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-navy bg-white focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition-all"
            >
                <option value="">Select {label}</option>
                {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        </div>
    );
}

function DocumentCard({ title, url, onUpload, onRemove, folder, uid, acceptedFileTypes = "all" }: {
    title: string; url?: string; onUpload: (url: string) => void; onRemove: () => void; folder: any; uid: string; acceptedFileTypes?: "images" | "pdfs" | "all";
}) {
    return (
        <div className="border border-gray-200 rounded-2xl p-5 flex flex-col items-center text-center hover:border-navy/20 transition-colors">
            <h3 className="font-bold text-navy mb-4 text-sm">{title}</h3>
            {url ? (
                <div className="w-full space-y-3">
                    <div className="aspect-square w-full rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                        {url.toLowerCase().includes('.pdf') ? (
                            <div className="w-full h-full flex flex-col items-center justify-center text-red-400">
                                <FileText className="w-12 h-12 mb-2" />
                                <span className="font-bold text-sm">PDF Document</span>
                            </div>
                        ) : (
                            <img src={url} alt={title} className="w-full h-full object-cover" />
                        )}
                    </div>
                    <a
                        href={url} target="_blank" rel="noopener noreferrer"
                        className="block w-full py-2 text-sm font-bold text-navy bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border"
                    >
                        View Full Size
                    </a>
                    <button
                        onClick={async () => {
                            try {
                                await fetch("/api/delete-file", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ url })
                                });
                            } catch (e) {
                                console.error("Failed to delete from Cloudinary", e);
                            }
                            // Call onRemove to clear it from Firestore and local state
                            onRemove();
                        }}
                        className="block w-full py-2 text-sm font-bold text-red-500 bg-white hover:bg-red-50 rounded-lg transition-colors border border-red-100"
                    >
                        Remove & Replace
                    </button>
                </div>
            ) : (
                <div className="w-full flex items-center justify-center min-h-[180px]">
                    <CloudinaryUpload
                        folder={folder}
                        subFolder={uid}
                        onUpload={(url) => onUpload(url)}
                        acceptedFileTypes={acceptedFileTypes}
                        maxSizeMB={5}
                        label={`Upload ${title}`}
                    />
                </div>
            )}
        </div>
    );
}
