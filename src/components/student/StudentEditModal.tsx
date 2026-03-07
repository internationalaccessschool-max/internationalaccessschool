"use client";

import { useState } from "react";
import { doc, setDoc, updateDoc, collectionGroup, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CloudinaryUpload } from "@/components/ui/cloudinary-upload";
import { X, Save, Loader2, User, Phone, Mail, BookOpen, Heart, Banknote, Lock, FileText, Image as ImageIcon } from "lucide-react";

interface StudentEditModalProps {
    student: any;
    onClose: () => void;
    onSaved?: (updated: any) => void;
    /** 'admin' can edit all fields including class/section/admissionNumber; 'teacher' edits personal/contact/medical */
    role?: "admin" | "teacher";
}

const TABS = [
    { id: "personal", label: "Personal", icon: User },
    { id: "contact", label: "Contact", icon: Phone },
    { id: "family", label: "Family", icon: User },
    { id: "medical", label: "Medical", icon: Heart },
    { id: "bank", label: "Bank", icon: Banknote },
    { id: "academic", label: "Academic", icon: BookOpen },
    { id: "other", label: "Other", icon: FileText },
    { id: "documents", label: "Documents", icon: ImageIcon },
];

const CLASSES = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5",
    "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];
const SECTIONS = ["A", "B", "C", "D", "E"];
const GENDER_OPTIONS = ["Male", "Female", "Other"];
const BLOOD_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const CATEGORY_OPTIONS = ["General", "OBC", "SC", "ST", "EWS", "Other"];

// ─── Extracted Field Component to prevent re-renders on keystroke ────────────────
const FieldRenderer = ({
    label,
    field,
    type = "text",
    options,
    form,
    set,
    locked
}: {
    label: string;
    field: string;
    type?: string;
    options?: string[];
    form: any;
    set: (key: string, value: any) => void;
    locked: boolean;
}) => {
    return (
        <div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                {label}
                {locked && <span title="Admin only"><Lock className="w-3 h-3 text-slate-300 ml-1" /></span>}
            </label>
            {options ? (
                <select
                    value={form[field] || ""}
                    onChange={e => !locked && set(field, e.target.value)}
                    disabled={locked}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none transition-all duration-200 bg-white shadow-sm ${locked ? "border-slate-100/50 bg-slate-50/50 text-slate-400 cursor-not-allowed shadow-none" : "border-slate-200/60 text-slate-800 focus:border-black focus:ring-4 focus:ring-black/5 hover:border-slate-300"}`}
                >
                    <option value="" className="text-slate-400">Select {label}</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : (
                <input
                    type={type}
                    value={form[field] || ""}
                    onChange={e => !locked && set(field, e.target.value)}
                    readOnly={locked}
                    placeholder={`Enter ${label.toLowerCase()}...`}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none transition-all duration-200 shadow-sm placeholder:text-slate-300 ${locked ? "bg-slate-50/50 border-slate-100/50 text-slate-400 cursor-not-allowed shadow-none" : "bg-white border-slate-200/60 text-slate-800 focus:border-black focus:ring-4 focus:ring-black/5 hover:border-slate-300"}`}
                />
            )}
        </div>
    );
};

export function StudentEditModal({ student, onClose, onSaved, role = "admin" }: StudentEditModalProps) {
    const [activeTab, setActiveTab] = useState("personal");
    // Convert DOB from DD-MM-YYYY (DB) to YYYY-MM-DD (for date input) on load
    const initForm = { ...student };
    if (initForm.dob && initForm.dob.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [d, m, y] = initForm.dob.split("-");
        initForm.dob = `${y}-${m}-${d}`;
    }
    const [form, setForm] = useState<any>(initForm);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const set = (key: string, value: any) => setForm((p: any) => ({ ...p, [key]: value }));

    const handleSave = async () => {
        setSaving(true);
        const { id, ...dataToSave } = form;

        // Check if DOB was changed so we can update Auth password
        const oldDob = student.dob;
        let newDobForAuth = null;
        // Convert DOB from YYYY-MM-DD (date input) back to DD-MM-YYYY for DB
        if (dataToSave.dob && dataToSave.dob.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [y, m, d] = dataToSave.dob.split("-");
            dataToSave.dob = `${d}-${m}-${y}`;
        }

        // Always sync Auth password with DOB on save to heal broken accounts
        if (dataToSave.dob) {
            // Convert DD-MM-YYYY string to DD-MM-YY exactly as login screen and admission screen expect
            const [d, m, y] = dataToSave.dob.split("-");
            newDobForAuth = `${d}-${m}-${y.slice(-2)}`;
        }

        // Handle moving nested profile document if Class or Section changed
        try {
            const oldClassName = student.className;
            const oldSection = student.section;
            const newClassName = dataToSave.className;
            const newSection = dataToSave.section || "Unassigned";

            if (oldClassName !== newClassName || oldSection !== newSection) {
                // Delete old document via collectionGroup lookup to be safe
                const snap = await getDocs(collectionGroup(db, "profiles"));
                const oldDoc = snap.docs.find(d => d.id === student.id);
                if (oldDoc) {
                    await deleteDoc(oldDoc.ref);
                }
            }

            // Always write to the new nested destination regardless of whether it moved
            const newDocRef = doc(db, "users", "classes", newClassName, "sections", newSection, "students", "profiles", student.id);
            await setDoc(newDocRef, dataToSave, { merge: true });

            // Ensure parent documents exist for console visibility
            await setDoc(doc(db, "users", "classes"), { description: "Root for classes", updatedAt: new Date() }, { merge: true });
            await setDoc(doc(db, "users", "classes", newClassName, "sections"), { description: `Root for sections in ${newClassName}`, updatedAt: new Date() }, { merge: true });
            await setDoc(doc(db, "users", "classes", newClassName, "sections", newSection, "students"), { description: `Root for students in ${newClassName} - ${newSection}`, updatedAt: new Date() }, { merge: true });

        } catch (e) {
            console.error("Failed to update nested profile:", e);
        }

        // Update Auth password and display name via API
        try {
            const newDisplayName = `${dataToSave.firstName || ""} ${dataToSave.lastName || ""}`.trim();
            await fetch("/api/admin/update-student-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    uid: student.id,
                    newPassword: newDobForAuth,
                    newDisplayName: newDisplayName
                })
            });
        } catch (e) {
            console.warn("Failed to update student auth profile:", e);
        }

        setSaved(true);
        onSaved?.({ ...form });
        setTimeout(() => setSaved(false), 2000);
        setSaving(false);
    };

    const isAdminLocked = (field: string) => role === "teacher" && ["admissionNumber", "className", "section", "session", "aadharNo", "pen", "aparId"].includes(field);

    const F = (props: { label: string; field: string; type?: string; options?: string[] }) => (
        <FieldRenderer {...props} form={form} set={set} locked={isAdminLocked(props.field)} />
    );

    const renderTab = () => {
        switch (activeTab) {
            case "personal":
                return (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <F label="Full Name" field="name" />
                        <F label="First Name" field="firstName" />
                        <F label="Middle Name" field="middleName" />
                        <F label="Last Name" field="lastName" />
                        <F label="Date of Birth" field="dob" type="date" />
                        <F label="Gender" field="gender" options={GENDER_OPTIONS} />
                        <F label="Blood Group" field="bloodGroup" options={BLOOD_OPTIONS} />
                        <F label="Religion" field="religion" />
                        <F label="Nationality" field="nationality" />
                        <F label="Category" field="category" options={CATEGORY_OPTIONS} />
                        <F label="Mother Tongue" field="motherTongue" />
                        <F label="House" field="house" />
                        <F label="Free Scheme" field="freeScheme" />
                        <F label="EWS" field="economicallyWeakSection" />
                        <F label="Minority Status" field="minorityStatus" />
                    </div>
                );
            case "contact":
                return (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <F label="Mobile No (Primary)" field="mobileNo" type="tel" />
                        <F label="Contact 2" field="contact2" type="tel" />
                        <F label="Contact 3" field="contact3" type="tel" />
                        <F label="Father's Mobile" field="fatherMobile" type="tel" />
                        <F label="Mother's Mobile" field="motherMobile" type="tel" />
                        <F label="Email" field="email" type="email" />
                        <div className="sm:col-span-2"><F label="Address" field="address" /></div>
                        <div className="sm:col-span-2"><F label="Present Address" field="presentAddress" /></div>
                        <div className="sm:col-span-2"><F label="Permanent Address" field="permanentAddress" /></div>
                        <F label="City" field="city" />
                        <F label="State" field="state" />
                        <F label="Pin Code" field="pinCode" />
                        <F label="Transport" field="transport" />
                    </div>
                );
            case "family":
                return (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <F label="Father's Name" field="fatherName" />
                        <F label="Father's Occupation" field="fatherOccupation" />
                        <F label="Father's Education" field="fatherEducation" />
                        <F label="Father's Qualification" field="fatherQualification" />
                        <F label="Mother's Name" field="motherName" />
                        <F label="Mother's Occupation" field="motherOccupation" />
                        <F label="Mother's Education" field="motherEducation" />
                        <F label="Mother's Qualification" field="motherQualification" />
                        <F label="Guardian Name" field="guardianName" />
                        <F label="Guardian Relation" field="guardianRelation" />
                        <F label="Guardian Qualification" field="guardianQualification" />
                        <F label="Guardian Mobile" field="guardianMobile" type="tel" />
                        <F label="Annual Family Income" field="annualIncome" />
                    </div>
                );
            case "medical":
                return (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <F label="Height (cm)" field="height" type="number" />
                        <F label="Weight (kg)" field="weight" type="number" />
                        <F label="Medical Condition" field="medicalCondition" />
                        <F label="Disability (if any)" field="disability" />
                        <F label="Allergies" field="allergies" />
                        <F label="Emergency Contact" field="emergencyContact" type="tel" />
                    </div>
                );
            case "bank":
                return (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <F label="Bank Name" field="bankName" />
                        <F label="Account Number" field="bankAccountNumber" />
                        <F label="IFSC Code" field="ifscCode" />
                        <F label="Account Holder Name" field="accountHolderName" />
                        <F label="PAN Number" field="panNumber" />
                    </div>
                );
            case "academic":
                return (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <F label="S.N (Serial No)" field="serialNumber" />
                        <F label="Admission Number (ENR)" field="admissionNumber" />
                        <F label="Status" field="status" options={["ACTIVE", "LEFT"]} />
                        <F label="Session" field="session" />
                        <F label="Date of Admission" field="dateOfAdmission" />
                        <F label="Class at Admission" field="classAtAdmission" />
                        <F label="Current Class" field="currentClass" options={role === "admin" ? ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] : undefined} />
                        <F label="Class (DB)" field="className" options={role === "admin" ? ["NUR", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] : undefined} />
                        <F label="Section" field="section" options={role === "admin" ? SECTIONS : undefined} />
                        <F label="Roll Number" field="rollNumber" />
                        <F label="Stream" field="stream" options={["General", "Science", "Commerce", "Arts", "Vocational"]} />
                        <F label="Aadhaar Number" field="aadharNo" />
                        <F label="PEN" field="pen" />
                        <F label="APAR ID" field="aparId" />
                        <F label="UDISE" field="udise" />
                        <F label="CBSE Enrolment No" field="cbseEnrolmentNo" />
                        <F label="Branch" field="branch" />
                        <F label="Block" field="block" />
                        <F label="TC Number" field="tcNumber" />
                        <F label="Previous School" field="previousSchool" />
                        <F label="Prev. School Address" field="previousSchoolAddress" />
                        <F label="Last Class" field="lastClass" />
                        <F label="Last Date" field="lastDate" />
                        <F label="Left Year" field="leftYear" />
                        {role === "teacher" && (
                            <div className="sm:col-span-2 mt-2 flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3">
                                <Lock className="w-3.5 h-3.5 shrink-0" />
                                Fields like Admission No, Class, Section, and IDs are managed by Admin only.
                            </div>
                        )}
                    </div>
                );
            case "other":
                return (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <div className="sm:col-span-2"><F label="Remarks" field="remarks" /></div>
                        <F label="House" field="house" />
                        <F label="Free Scheme" field="freeScheme" />
                        <F label="EWS" field="economicallyWeakSection" />
                        <F label="Minority Status" field="minorityStatus" />
                        <F label="Transport" field="transport" />
                    </div>
                );
            case "documents":
                return (
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {[
                            { title: "Student Photo", field: "childPhotoUrl" },
                            { title: "Parents Photo (Joint)", field: "parentPhotoUrl" },
                            { title: "Student Aadhaar Card", field: "aadharUrl" },
                            { title: "APAR ID Document", field: "aparUrl" },
                            { title: "Father Aadhaar Card", field: "fatherAadharUrl" },
                            { title: "Mother Aadhaar Card", field: "motherAadharUrl" },
                        ].map((doc) => (
                            <div key={doc.field} className="border border-gray-200 rounded-2xl p-4 flex flex-col items-center text-center">
                                <h3 className="font-bold text-navy mb-3 text-xs">{doc.title}</h3>
                                {form[doc.field] ? (
                                    <div className="w-full space-y-2">
                                        <div className="aspect-square w-full rounded-xl overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center">
                                            {form[doc.field].toLowerCase().includes('.pdf') ? (
                                                <div className="text-red-400 flex flex-col items-center"><FileText className="w-8 h-8 mb-1" /><span className="text-[10px] font-bold">PDF</span></div>
                                            ) : (
                                                <img src={form[doc.field]} alt={doc.title} className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <a href={form[doc.field]} target="_blank" rel="noopener noreferrer" className="block w-full py-1.5 text-xs font-bold text-navy bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border">View File</a>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await fetch("/api/delete-file", {
                                                        method: "POST",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ url: form[doc.field] })
                                                    });
                                                } catch (e) { console.error(e); }
                                                set(doc.field, "");
                                            }}
                                            className="block w-full py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-red-100"
                                        >
                                            Remove / Replace
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-full flex flex-col items-center justify-center min-h-[140px] transform scale-90 origin-top">
                                        <CloudinaryUpload
                                            folder="student-profiles"
                                            subFolder={student.id}
                                            onUpload={(url) => set(doc.field, url)}
                                            acceptedFileTypes={doc.field.includes("Photo") ? "images" : "all"}
                                            maxSizeMB={5}
                                            label={`Upload`}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-4 sm:p-6" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden ring-1 ring-slate-900/5" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="gradient-navy px-7 py-5 flex items-center justify-between shrink-0 border-b border-black/10">
                    <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center font-bold text-white shadow-inner border border-white/10">
                            {(form.firstName || "S").charAt(0)}
                        </div>
                        <div>
                            <p className="font-bold text-white tracking-wide text-lg">{form.firstName} {form.middleName} {form.lastName}</p>
                            <p className="text-white/60 text-xs font-medium tracking-wide mt-0.5">{form.admissionNumber} · {form.className} {form.section}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex overflow-x-auto border-b border-slate-100 bg-white shrink-0 scrollbar-hide px-3 pt-3 pb-0 gap-1">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold rounded-t-xl transition-all duration-200 outline-none ${activeTab === tab.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
                        >
                            <tab.icon className="w-3.5 h-3.5" strokeWidth={activeTab === tab.id ? 2.5 : 2} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-7 bg-[#fbfbfb]">
                    {renderTab()}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50 shrink-0">
                    <p className="text-xs text-gray-400">Changes are saved to Firestore immediately</p>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${saved ? "bg-emerald-500 text-white" : "bg-navy text-white hover:bg-navy/90"} disabled:opacity-60`}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? "Saving..." : saved ? "Saved ✓" : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
